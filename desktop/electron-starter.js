// Electron 启动器：确保 ELECTRON_RUN_AS_NODE 未被设置，
// 否则 electron 会以纯 Node 模式运行 main.js 而不打开窗口。
const { spawn } = require('child_process');

// 无论父环境是否设置了该变量，这里都彻底移除，保证以 GUI 模式启动
delete process.env.ELECTRON_RUN_AS_NODE;

const electronPath = require('electron');
const args = process.argv.slice(2);
// 传入 --no-sandbox：避免部分受限环境下沙箱初始化失败导致窗口无法打开
if (!args.includes('--no-sandbox')) args.unshift('--no-sandbox');
if (args.filter((a) => !a.startsWith('-')).length === 0) args.push('.');

const child = spawn(electronPath, args, {
  stdio: 'inherit',
  env: process.env,
  cwd: __dirname
});

child.on('close', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});

['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => child.kill(sig));
});
