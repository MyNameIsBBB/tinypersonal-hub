#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="tinypersonal-hub"
PORT="${PORT:-3000}"

for command_name in npm pm2 tailscale; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Error: $command_name is not installed or is not in PATH." >&2
    exit 1
  fi
done

cd "$SCRIPT_DIR"

if [[ -f "$SCRIPT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/.env"
  set +a
fi

echo "Installing dependencies and building all workspaces..."
npm ci
npm run db:generate
npm run build
npm run db:deploy

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 delete "$APP_NAME" >/dev/null
fi

PORT="$PORT" NODE_ENV=production pm2 start "$(command -v npm)" \
  --name "$APP_NAME" \
  --cwd "$SCRIPT_DIR" \
  --interpreter none \
  -- \
  run start --workspace=@tinypersonal/personal-app -- \
  --hostname 0.0.0.0 \
  --port "$PORT"

pm2 save

echo "Starting Tailscale Funnel..."
tailscale funnel --bg --yes "$PORT"
