#!/usr/bin/env node
// 本地 GitHub OAuth 代理（零第三方依赖，仅用 Node 原生模块）
//
// 用途：Workbuddy 之类的本地 AI/工具无法自己在浏览器里完成 GitHub OAuth 授权，
// 本工具在本机起一个临时 HTTP 服务，拉起浏览器让用户授权，接收 GitHub 回调，
// 用 code 换 access token，然后把令牌以「本地加密文件 + 一次性本地接口」两种方式
// 安全转交给 Workbuddy。
//
// 用法：
//   node github-oauth-proxy.mjs login           # 一键：起服务 → 开浏览器 → 收回调 → 存令牌（默认）
//   node github-oauth-proxy.mjs login --handoff # 额外开一个一次性本地接口用于转交令牌
//   node github-oauth-proxy.mjs setup           # 只配置 Client ID / Secret
//   node github-oauth-proxy.mjs status          # 查看当前令牌对应的账号与权限
//   node github-oauth-proxy.mjs token           # 把 access token 打到 stdout（供脚本/AI 取用）
//   node github-oauth-proxy.mjs logout          # 删除本地令牌
//
// 令牌与配置一律存放在用户目录 ~/.hongguo/ 下（仓库之外，不会误提交），
// 令牌以 AES-256-GCM 加密落盘，密钥文件权限 600。

import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = os.homedir();
const APP_DIR = path.join(HOME, '.hongguo');
const CONFIG_FILE = path.join(APP_DIR, 'oauth-config.json');
const KEY_FILE = path.join(APP_DIR, 'oauth-key.bin');
const TOKEN_FILE = path.join(APP_DIR, 'oauth-token.enc');
const LOCAL_CONFIG_FILE = path.join(HERE, 'config.json');

const DEFAULT_PORT = 8765;
const DEFAULT_SCOPES = 'repo workflow read:user';
const GITHUB_AUTHORIZE = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API = 'https://api.github.com';

// ===== 基础工具 =====

function ensureAppDir() {
  fs.mkdirSync(APP_DIR, { recursive: true, mode: 0o700 });
}

function chmod600(file) {
  try {
    fs.chmodSync(file, 0o600);
  } catch (_) {
    /* Windows 上 chmod 能力有限，忽略 */
  }
}

function readJson(file) {
  try {
    // 去掉可能的 UTF-8 BOM（Windows 记事本/PowerShell 写文件时常见）
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch (_) {
    return null;
  }
}

function loadConfig() {
  const fromEnv = {
    clientId: process.env.HG_GITHUB_CLIENT_ID || '',
    clientSecret: process.env.HG_GITHUB_CLIENT_SECRET || '',
    scopes: process.env.HG_GITHUB_SCOPES || DEFAULT_SCOPES,
    port: Number(process.env.HG_OAUTH_PORT || DEFAULT_PORT)
  };
  const fromUser = readJson(CONFIG_FILE) || {};
  const fromLocal = readJson(LOCAL_CONFIG_FILE) || {};
  return {
    clientId: fromEnv.clientId || fromLocal.clientId || fromUser.clientId || '',
    clientSecret: fromEnv.clientSecret || fromLocal.clientSecret || fromUser.clientSecret || '',
    scopes: fromEnv.scopes || fromLocal.scopes || fromUser.scopes || DEFAULT_SCOPES,
    port: Number(fromLocal.port || fromUser.port || fromEnv.port || DEFAULT_PORT)
  };
}

function saveConfig(cfg) {
  ensureAppDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  chmod600(CONFIG_FILE);
}

// ===== 令牌加密存储（AES-256-GCM） =====

function loadOrCreateKey() {
  ensureAppDir();
  try {
    const key = fs.readFileSync(KEY_FILE);
    if (key.length === 32) return key;
  } catch (_) {}
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, key);
  chmod600(KEY_FILE);
  return key;
}

function saveToken(payload) {
  ensureAppDir();
  const key = loadOrCreateKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  fs.writeFileSync(
    TOKEN_FILE,
    JSON.stringify({ iv: iv.toString('base64'), tag: tag.toString('base64'), data: data.toString('base64') }),
    'utf8'
  );
  chmod600(TOKEN_FILE);
}

function readToken() {
  try {
    const raw = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    const key = fs.readFileSync(KEY_FILE);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(raw.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(raw.tag, 'base64'));
    const out = Buffer.concat([decipher.update(Buffer.from(raw.data, 'base64')), decipher.final()]);
    return JSON.parse(out.toString('utf8'));
  } catch (_) {
    return null;
  }
}

function deleteToken() {
  try {
    fs.unlinkSync(TOKEN_FILE);
  } catch (_) {}
}

function mask(s) {
  if (!s) return '(无)';
  return s.length <= 10 ? '***' : `${s.slice(0, 4)}...${s.slice(-4)}`;
}

// ===== TLS 兼容 =====
// Node 默认用自带的 CA 列表，不读 Windows/macOS 系统证书存储。
// 机器上有安全软件/网关做 TLS 拦截时（根证书只装在系统里），就会报
// "unable to verify the first certificate / UNABLE_TO_VERIFY_LEAF_SIGNATURE"。
// 解决：用 --use-system-ca 重新跑一次自身（Node 20+ 支持）。
const INSECURE = process.env.HG_OAUTH_INSECURE === '1';

function ensureSystemCa() {
  if (process.env.HG_OAUTH_REEXEC === '1') return;
  if (process.execArgv.includes('--use-system-ca')) return;
  let supported = false;
  try {
    supported = !!process.allowedNodeEnvironmentFlags && process.allowedNodeEnvironmentFlags.has('--use-system-ca');
  } catch (_) {}
  if (!supported) return;
  console.log('[tls] 检测到本机证书校验异常风险，改用系统证书重新运行（--use-system-ca）…');
  const r = spawnSync(process.execPath, ['--use-system-ca', fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, HG_OAUTH_REEXEC: '1' }
  });
  process.exit(typeof r.status === 'number' ? r.status : 0);
}

function tlsHint(err) {
  const m = String((err && err.message) || err || '');
  if (!/certificate|UNABLE_TO_VERIFY|SELF_SIGNED|CA/i.test(m)) return '';
  return (
    '\n[tls] 这是本机 TLS 证书校验问题（多见于安全软件/公司网关做 HTTPS 拦截），不是授权本身失败。\n' +
    '[tls] 任选其一：\n' +
    '[tls]   1) node --use-system-ca github-oauth-proxy.mjs login   （用系统证书，推荐）\n' +
    '[tls]   2) 把拦截用的根 CA 导出为 pem，然后：set NODE_EXTRA_CA_CERTS=C:\\path\\ca.pem\n' +
    '[tls]   3) 仅本机一次性授权可接受风险时：set HG_OAUTH_INSECURE=1（跳过证书校验）\n'
  );
}

// ===== HTTP 小工具 =====

function request(url, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        // HG_OAUTH_INSECURE=1 时跳过证书校验（仅建议在本机一次性授权场景临时使用）
        rejectUnauthorized: !INSECURE,
        headers: { 'User-Agent': 'hongguo-oauth-proxy', ...headers }
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function openBrowser(url) {
  const platform = process.platform;
  try {
    if (platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true });
    else if (platform === 'darwin') spawn('open', [url], { stdio: 'ignore', detached: true });
    else spawn('xdg-open', [url], { stdio: 'ignore', detached: true });
  } catch (_) {}
}

function htmlPage(title, bodyHtml) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,"Microsoft YaHei",sans-serif;background:#131414;color:#e8e8e8;margin:0;padding:40px;line-height:1.7}
h1{font-size:20px;margin:0 0 16px}.box{max-width:640px;margin:0 auto;background:#1b1d1d;border:1px solid #2c2f2f;border-radius:10px;padding:28px}
code{background:#0f1010;padding:2px 6px;border-radius:4px;color:#7ee0c0}
a{color:#7ee0c0}input{width:100%;box-sizing:border-box;padding:10px;margin:6px 0 14px;background:#0f1010;border:1px solid #2c2f2f;color:#e8e8e8;border-radius:6px}
button{background:#7ee0c0;color:#08120f;border:0;padding:10px 18px;border-radius:6px;font-weight:600;cursor:pointer}</style>
</head><body><div class="box"><h1>${title}</h1>${bodyHtml}</div></body></html>`;
}

// ===== OAuth 主流程 =====

function startLogin({ handoff }) {
  const cfg = loadConfig();
  const state = crypto.randomBytes(16).toString('hex');
  const port = cfg.port;
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, `http://127.0.0.1:${port}`);

    const send = (code, body, type = 'text/html; charset=utf-8') => {
      res.writeHead(code, { 'Content-Type': type });
      res.end(body);
    };

    // 1) 首次使用：本机配置页，填 Client ID / Secret
    if (u.pathname === '/setup') {
      if (req.method === 'POST') {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const form = new URLSearchParams(raw);
        const next = {
          clientId: (form.get('clientId') || '').trim(),
          clientSecret: (form.get('clientSecret') || '').trim(),
          scopes: (form.get('scopes') || DEFAULT_SCOPES).trim(),
          port
        };
        if (!next.clientId || !next.clientSecret) {
          return send(400, htmlPage('缺少信息', '<p>Client ID 与 Client Secret 都不能为空，请返回重填。</p>'));
        }
        saveConfig(next);
        Object.assign(cfg, next);
        res.writeHead(302, { Location: '/start' });
        return res.end();
      }
      const prefill = `https://github.com/settings/applications/new?oauth_application%5Bname%5D=HongGuo-PC%20Local%20Proxy&oauth_application%5Burl%5D=https%3A%2F%2Fgithub.com%2Fbainano%2FHongGuo-PC&oauth_application%5Bcallback_url%5D=${encodeURIComponent(redirectUri)}`;
      return send(
        200,
        htmlPage(
          '首次配置',
          `<p>还没有配置 OAuth App。请：</p>
           <ol>
             <li>点这个链接在 GitHub 创建应用（回调地址已预填）：<br><a href="${prefill}" target="_blank">${prefill}</a></li>
             <li>创建后把 <b>Client ID</b> 和 <b>Client Secret</b> 粘到下面</li>
           </ol>
           <form method="post" action="/setup">
             <label>Client ID<input name="clientId" placeholder="Iv1.xxxx"></label>
             <label>Client Secret<input name="clientSecret" placeholder="一串 40 位字符"></label>
             <label>授权范围 scopes<input name="scopes" value="${DEFAULT_SCOPES}"></label>
             <button type="submit">保存并继续授权</button>
           </form>
           <p style="color:#9a9a9a;font-size:13px">配置保存在 <code>~/.hongguo/oauth-config.json</code>（仓库之外，不会进 git）</p>`
        )
      );
    }

    // 2) 跳 GitHub 授权
    if (u.pathname === '/start') {
      if (!cfg.clientId || !cfg.clientSecret) {
        res.writeHead(302, { Location: '/setup' });
        return res.end();
      }
      const authorizeUrl =
        `${GITHUB_AUTHORIZE}?client_id=${encodeURIComponent(cfg.clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(cfg.scopes)}` +
        `&state=${state}`;
      res.writeHead(302, { Location: authorizeUrl });
      return res.end();
    }

    // 3) GitHub 回调：拿 code 换 token
    if (u.pathname === '/callback') {
      const code = u.searchParams.get('code');
      const gotState = u.searchParams.get('state');
      if (!code) return send(400, htmlPage('授权未完成', '<p>回调里没有 code，可能是你取消了授权。</p>'));
      if (gotState !== state) return send(400, htmlPage('校验失败', '<p>state 不匹配，已中止（防 CSRF）。</p>'));

      try {
        const r = await request(GITHUB_TOKEN_URL, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: cfg.clientId,
            client_secret: cfg.clientSecret,
            code,
            redirect_uri: redirectUri
          })
        });
        const json = JSON.parse(r.body);
        if (!json.access_token) {
          throw new Error(json.error_description || json.error || r.body.slice(0, 200));
        }
        const me = await request(`${GITHUB_API}/user`, {
          headers: { Authorization: `Bearer ${json.access_token}`, Accept: 'application/vnd.github+json' }
        });
        const login = me.status === 200 ? JSON.parse(me.body).login : '(未知)';
        saveToken({
          access_token: json.access_token,
          scope: json.scope || cfg.scopes,
          token_type: json.token_type || 'bearer',
          login,
          obtained_at: new Date().toISOString()
        });
        console.log(`\n[ok] 授权成功：GitHub 账号 ${login}`);
        console.log(`[ok] 权限范围：${json.scope || cfg.scopes}`);
        console.log(`[ok] 令牌已加密保存到 ${TOKEN_FILE}`);
        console.log('[ok] 取用方式：node github-oauth-proxy.mjs token\n');
        send(
          200,
          htmlPage(
            '授权完成',
            `<p>GitHub 账号 <b>${login}</b> 已授权，令牌已加密保存到本机。</p>
             <p>回到 Workbuddy 继续即可；取用令牌：<code>node github-oauth-proxy.mjs token</code></p>
             <p style="color:#9a9a9a;font-size:13px">这个本地服务可以关掉了。</p>`
          )
        );
        if (handoff) {
          startHandoff(json.access_token, port + 1);
        } else {
          setTimeout(() => server.close(() => process.exit(0)), 300);
        }
      } catch (e) {
        console.error('[error] 换取令牌失败：', e.message, tlsHint(e));
        send(500, htmlPage('换取令牌失败', `<p>${e.message}</p><pre style="white-space:pre-wrap">${tlsHint(e)}</pre>`));
        setTimeout(() => server.close(() => process.exit(1)), 300);
      }
      return;
    }

    res.writeHead(302, { Location: '/start' });
    res.end();
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`[error] 端口 ${port} 被占用，换一个：node github-oauth-proxy.mjs login --port 8787`);
    } else {
      console.error('[error] 本地服务启动失败：', e.message);
    }
    process.exit(1);
  });

  server.listen(port, '127.0.0.1', () => {
    const entry = cfg.clientId ? '/start' : '/setup';
    console.log(`\n[hongguo] 本地 OAuth 代理已启动：http://127.0.0.1:${port}${entry}`);
    console.log('[hongguo] 正在打开浏览器，请在 GitHub 页面点「Authorize」…');
    openBrowser(`http://127.0.0.1:${port}${entry}`);
  });
}

// 一次性本地转交接口（默认 5 分钟有效，带随机 key）
function startHandoff(token, port) {
  const key = crypto.randomBytes(16).toString('hex');
  const expireAt = Date.now() + 5 * 60 * 1000;
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, `http://127.0.0.1:${port}`);
    if (u.pathname === '/token' && u.searchParams.get('key') === key && Date.now() < expireAt) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ access_token: token, expires_in: Math.floor((expireAt - Date.now()) / 1000) }));
    }
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end('{"error":"forbidden"}');
  });
  srv.listen(port, '127.0.0.1', () => {
    console.log(`[handoff] 令牌转交接口（5 分钟内有效）：`);
    console.log(`[handoff] http://127.0.0.1:${port}/token?key=${key}`);
    console.log('[handoff] Workbuddy 访问该地址即可拿到 access_token；到期自动失效，可 Ctrl+C 结束。\n');
  });
  setTimeout(() => srv.close(() => process.exit(0)), 5 * 60 * 1000 + 1000);
}

// ===== 子命令 =====

function cmdStatus() {
  const t = readToken();
  if (!t) {
    console.log('[status] 还没有令牌，先执行：node github-oauth-proxy.mjs login');
    return;
  }
  console.log(`账号      : ${t.login || '(未知)'}`);
  console.log(`权限范围  : ${t.scope || '(未知)'}`);
  console.log(`获取时间  : ${t.obtained_at}`);
  console.log(`令牌(脱敏): ${mask(t.access_token)}`);
  console.log(`存储位置  : ${TOKEN_FILE}（AES-256-GCM 加密）`);
}

function cmdToken() {
  const t = readToken();
  if (!t) {
    console.error('[error] 没有可用令牌，先执行 login');
    process.exit(1);
  }
  process.stdout.write(t.access_token);
}

function cmdSelfTest() {
  const had = readToken();
  const probe = {
    access_token: 'ghp_selftest_' + crypto.randomBytes(8).toString('hex'),
    scope: 'repo workflow read:user',
    token_type: 'bearer',
    login: 'selftest',
    obtained_at: new Date().toISOString()
  };
  saveToken(probe);
  const back = readToken();
  const ok = back && back.access_token === probe.access_token;
  if (had) saveToken(had);
  else deleteToken();
  console.log(ok ? '[selftest] 通过：令牌加密写入与读取一致' : '[selftest] 失败：读取结果与写入不一致');
  process.exit(ok ? 0 : 1);
}

function cmdLogout() {
  deleteToken();
  console.log('[ok] 本地令牌已删除（如需彻底失效，请到 GitHub → Settings → Applications → Authorized OAuth Apps 里 Revoke）');
}

function main() {
  // 需要联网的命令先确保能用系统证书（否则会被本机 TLS 拦截挡住）
  ensureSystemCa();
  if (INSECURE) console.log('[warn] HG_OAUTH_INSECURE=1：已跳过 TLS 证书校验，仅限本机临时使用');

  const args = process.argv.slice(2);
  const cmd = args[0] || 'login';
  const portArg = args.indexOf('--port');
  if (portArg >= 0 && args[portArg + 1]) process.env.HG_OAUTH_PORT = args[portArg + 1];

  switch (cmd) {
    case 'login':
      startLogin({ handoff: args.includes('--handoff') });
      break;
    case 'setup':
      startLogin({ handoff: false }); // 首次进入会先落在 /setup 页
      break;
    case 'status':
      cmdStatus();
      break;
    case 'token':
      cmdToken();
      break;
    case 'logout':
      cmdLogout();
      break;
    case 'selftest':
      cmdSelfTest();
      break;
    default:
      console.log(`用法：node github-oauth-proxy.mjs [login|setup|status|token|logout|selftest] [--handoff] [--port 8765]`);
  }
}

main();
