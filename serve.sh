#!/usr/bin/env sh
# SocialLite 로컬 서버 — 정적 파일만 있으므로 파이썬 한 줄이면 충분하다.
#   ./serve.sh          → http://localhost:5173/
#   ./serve.sh 8080     → 포트 지정
set -e
PORT="${1:-5173}"
cd "$(dirname "$0")"
echo ""
echo "  SocialLite  →  http://localhost:$PORT/"
echo "  대시보드      http://localhost:$PORT/index.html"
echo "  자체 검증      http://localhost:$PORT/tests/"
echo ""
echo "  (Ctrl+C 로 종료)"
echo ""
exec python3 -m http.server "$PORT" --bind 0.0.0.0
