#!/usr/bin/env bash
# Ping Render every 5 minutes so the free tier does not sleep.
# Stop with Ctrl+C. Run in a terminal until your demo:
#   ./scripts/keep-backend-awake.sh

URL="${BACKEND_URL:-https://krishecarbon-backend.onrender.com/health}"
INTERVAL="${KEEPALIVE_INTERVAL_SEC:-300}"

echo "Keep-alive: $URL every ${INTERVAL}s (Ctrl+C to stop)"
while true; do
  if curl -fsS --max-time 60 "$URL" >/dev/null; then
    echo "$(date '+%H:%M:%S') ping OK"
  else
    echo "$(date '+%H:%M:%S') ping failed (may be waking up — retry in ${INTERVAL}s)"
  fi
  sleep "$INTERVAL"
done
