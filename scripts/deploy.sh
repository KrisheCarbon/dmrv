#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1"
    exit 1
  }
}

load_env_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "Missing $file — copy from .env.example and fill in values."
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
}

echo "==> KriSHE Carbon deployment helper"
echo "Run each step after logging into the target platform."
echo

case "${1:-help}" in
  backend-railway)
    require_cmd railway
    load_env_file "$ROOT/Backend/.env"
    railway login
    railway init --name krishecarbon-backend 2>/dev/null || true
    railway up --service krishecarbon-backend --path-as-root Backend || railway up
    railway variables set \
      "PORT=3001" \
      "NODE_ENV=production" \
      "SUPABASE_URL=${SUPABASE_URL}" \
      "SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}" \
      "CORS_ORIGINS=${CORS_ORIGINS:-http://localhost:3000}"
    echo "Backend URL: $(railway domain 2>/dev/null || railway status)"
    ;;

  backend-render)
    echo "Render deploy (GitHub-connected):"
    echo "1. Push this repo to GitHub (KrisheCarbon org)."
    echo "2. https://dashboard.render.com/blueprint/new"
    echo "3. Select the repo and apply render.yaml."
    echo "4. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and CORS_ORIGINS in the Render dashboard."
    ;;

  web-vercel)
    require_cmd npx
    load_env_file "$ROOT/Web/.env.local"
    cd "$ROOT/Web"
    npx vercel login
    npx vercel link
    npx vercel env add NEXT_PUBLIC_SUPABASE_URL production <<<"$NEXT_PUBLIC_SUPABASE_URL"
    npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production <<<"$NEXT_PUBLIC_SUPABASE_ANON_KEY"
    npx vercel env add NEXT_PUBLIC_MAPBOX_TOKEN production <<<"$NEXT_PUBLIC_MAPBOX_TOKEN"
    npx vercel env add SUPABASE_SERVICE_ROLE_KEY production <<<"$SUPABASE_SERVICE_ROLE_KEY"
    npx vercel env add BACKEND_URL production <<<"${BACKEND_URL:-${NEXT_PUBLIC_BACKEND_URL:-http://localhost:3001}}"
    npx vercel env add NEXT_PUBLIC_BACKEND_URL production <<<"${NEXT_PUBLIC_BACKEND_URL:-${BACKEND_URL:-http://localhost:3001}}"
    if [[ -n "${POSTMARK_SERVER_TOKEN:-}" ]]; then
      npx vercel env add POSTMARK_SERVER_TOKEN production <<<"$POSTMARK_SERVER_TOKEN"
    fi
    if [[ -n "${POSTMARK_FROM_EMAIL:-}" ]]; then
      npx vercel env add POSTMARK_FROM_EMAIL production <<<"$POSTMARK_FROM_EMAIL"
    fi
    npx vercel --prod
    echo "Add the Vercel URL to Backend CORS_ORIGINS and Supabase Auth redirect URLs."
    ;;

  mobile-eas)
    require_cmd eas
    load_env_file "$ROOT/Mobile/.env"
    cd "$ROOT/Mobile"
    eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "$EXPO_PUBLIC_SUPABASE_URL" --force 2>/dev/null || true
    eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "$EXPO_PUBLIC_SUPABASE_ANON_KEY" --force 2>/dev/null || true
    eas secret:create --scope project --name EXPO_PUBLIC_MAPBOX_TOKEN --value "$EXPO_PUBLIC_MAPBOX_TOKEN" --force 2>/dev/null || true
    eas secret:create --scope project --name EXPO_PUBLIC_BACKEND_URL --value "$EXPO_PUBLIC_BACKEND_URL" --force 2>/dev/null || true
    eas build --profile preview --platform android --non-interactive
    echo "Install link appears on https://expo.dev/accounts/shanmukh-krishe/projects/dmrv-app/builds"
    ;;

  mobile-share-dev)
    require_cmd npx
    cd "$ROOT/Mobile"
    npx expo start --tunnel
    ;;

  all)
    echo "Recommended order:"
    echo "  1. ./scripts/deploy.sh backend-railway   (or backend-render)"
    echo "  2. Update Backend/.env CORS_ORIGINS + Mobile/.env EXPO_PUBLIC_BACKEND_URL with live URLs"
    echo "  3. ./scripts/deploy.sh web-vercel"
    echo "  4. ./scripts/deploy.sh mobile-eas"
    ;;

  *)
    echo "Usage: ./scripts/deploy.sh [backend-railway|backend-render|web-vercel|mobile-eas|mobile-share-dev|all]"
    ;;
esac
