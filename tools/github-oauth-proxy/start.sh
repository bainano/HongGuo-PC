#!/usr/bin/env bash
# macOS / Linux 一键启动：bash start.sh
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[error] 没找到 Node.js，请先安装 Node.js 20+ https://nodejs.org"
  exit 1
fi

echo "============================================"
echo " 红果短剧 · GitHub OAuth 本地代理"
echo " 浏览器会自动打开，点一次 Authorize 即可"
echo "============================================"
exec node "$(dirname "$0")/github-oauth-proxy.mjs" login "$@"
