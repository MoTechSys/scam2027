#!/usr/bin/env bash
# Restart the production Next.js server on :3000 (sandbox/dev helper).
# Kills whatever holds the port (stale next-server survives parent kills), then starts fresh.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-3000}"
for p in $(ss -ltnp 2>/dev/null | grep ":${PORT} " | grep -o "pid=[0-9]*" | cut -d= -f2); do
  kill -9 "$p" 2>/dev/null || true
done
sleep 1
nohup pnpm start -p "$PORT" > /tmp/next.log 2>&1 &
for _ in $(seq 1 30); do
  if curl -fs "http://localhost:${PORT}/api/health" > /dev/null 2>&1; then
    echo "next ready on :${PORT} (BUILD_ID $(cat .next/BUILD_ID))"
    exit 0
  fi
  sleep 1
done
echo "server failed to start; see /tmp/next.log" >&2
exit 1
