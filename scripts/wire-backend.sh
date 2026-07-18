#!/usr/bin/env bash
set -euo pipefail

# After Render backend is live, run:
#   ./scripts/wire-backend.sh https://your-service.onrender.com

if [[ $# -ne 1 ]]; then
  echo "Usage: ./scripts/wire-backend.sh https://your-backend.onrender.com"
  exit 1
fi

BACKEND_URL="${1%/}"
WEB_URL="${WEB_URL:-https://krishecarbon-web.vercel.app}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Wiring backend: $BACKEND_URL"

if [[ -f "$ROOT/Backend/.env" ]]; then
  if grep -q '^CORS_ORIGINS=' "$ROOT/Backend/.env"; then
    sed -i '' "s|^CORS_ORIGINS=.*|CORS_ORIGINS=${WEB_URL},http://localhost:3000,http://localhost:8081|" "$ROOT/Backend/.env"
  else
    echo "CORS_ORIGINS=${WEB_URL},http://localhost:3000,http://localhost:8081" >> "$ROOT/Backend/.env"
  fi
fi

if [[ -f "$ROOT/Mobile/.env" ]]; then
  if grep -q '^EXPO_PUBLIC_BACKEND_URL=' "$ROOT/Mobile/.env"; then
    sed -i '' "s|^EXPO_PUBLIC_BACKEND_URL=.*|EXPO_PUBLIC_BACKEND_URL=${BACKEND_URL}|" "$ROOT/Mobile/.env"
  else
    echo "EXPO_PUBLIC_BACKEND_URL=${BACKEND_URL}" >> "$ROOT/Mobile/.env"
  fi
fi

python3 - <<PY
import json
from pathlib import Path
path = Path("$ROOT/Mobile/eas.json")
data = json.loads(path.read_text())
data.setdefault("build", {}).setdefault("preview", {}).setdefault("env", {})["EXPO_PUBLIC_BACKEND_URL"] = "$BACKEND_URL"
path.write_text(json.dumps(data, indent=2) + "\n")
PY

cd "$ROOT/Web"
printf '%s' "$BACKEND_URL" | npx vercel env add BACKEND_URL production --force --yes >/dev/null
printf '%s' "$BACKEND_URL" | npx vercel env add NEXT_PUBLIC_BACKEND_URL production --force --yes >/dev/null
npx vercel --prod --yes --cwd "$ROOT" >/dev/null

echo "Done."
echo "Web:    $WEB_URL"
echo "Backend health: ${BACKEND_URL}/health"
echo "Next: rebuild mobile with  cd Mobile && eas build --profile preview --platform android"
