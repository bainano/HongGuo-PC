// 校验打包产物 app.asar 是否包含 dist/index.html。
// 缺失时应用启动会加载失败，表现为黑屏（main.js 加载 app.asar/dist/index.html）。
// 用法：node tools/verify-asar.mjs <app.asar 路径>
import fs from 'node:fs';

const asarPath = process.argv[2];
if (!asarPath) {
  console.error('[verify] usage: node verify-asar.mjs <app.asar path>');
  process.exit(2);
}
if (!fs.existsSync(asarPath)) {
  console.error(`[verify] FATAL: app.asar 不存在: ${asarPath}`);
  process.exit(1);
}

const buf = fs.readFileSync(asarPath);
const jsonLen = buf.readUInt32LE(12);
const header = JSON.parse(buf.slice(16, 16 + jsonLen).toString('utf8'));
const dist = header.files && header.files.dist && header.files.dist.files;

if (!dist || !dist['index.html']) {
  console.error('[verify] FATAL: app.asar 缺少 dist/index.html —— 应用启动会黑屏！');
  console.error('[verify] 请确认 vite build 成功输出到 desktop/dist/ 后再打包');
  process.exit(1);
}

const assetCount = dist.assets && dist.assets.files ? Object.keys(dist.assets.files).length : 0;
console.log(`[verify] OK: app.asar 含 dist/index.html，assets ${assetCount} 个文件`);
