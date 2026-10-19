#!/usr/bin/env sh
# 公关洗地模拟器：Linux / macOS 一键启动（本地服务 + 自动打开浏览器）
# 用法：./start.sh [端口]
cd "$(dirname "$0")" || exit 1

PORT="${1:-8765}"

PY=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(sys.version_info[0] < 3)' 2>/dev/null; then
    PY="$c"
    break
  fi
done
if [ -z "$PY" ]; then
  echo "没有找到 Python 3。请用系统包管理器安装（如 sudo apt install python3），或直接用浏览器打开 Start.html 离线游玩。"
  exit 1
fi

exec "$PY" tools/serve.py --port "$PORT" --open
