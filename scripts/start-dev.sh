#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT="${PORT:-3000}"
TINYPERSONAL_BIND_HOST="${TINYPERSONAL_BIND_HOST:-127.0.0.1}"
ENABLE_TAILSCALE_FUNNEL="${ENABLE_TAILSCALE_FUNNEL:-0}"
declare -a child_pids=()

stop_children() {
  if ((${#child_pids[@]} > 0)); then
    kill "${child_pids[@]}" 2>/dev/null || true
    wait "${child_pids[@]}" 2>/dev/null || true
  fi
}

trap stop_children EXIT INT TERM
cd "$PROJECT_ROOT"

if ! node -e '
  const net = require("node:net");
  const server = net.createServer();
  server.once("error", () => process.exit(1));
  server.listen(Number(process.argv[1]), process.argv[2], () => server.close());
' "$PORT" "$TINYPERSONAL_BIND_HOST"; then
  echo "Port ${PORT} on ${TINYPERSONAL_BIND_HOST} is already in use. Stop the existing server or choose another PORT." >&2
  exit 1
fi

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# The chat UI always queues durable generation jobs. Development therefore
# needs the same runner as production, even when no persistent cron secret was
# configured. This process-local value is never written to disk.
if [[ -z "${CRON_SECRET:-}" ]]; then
  CRON_SECRET="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
  export CRON_SECRET
fi
export INTERNAL_APP_URL="http://127.0.0.1:${PORT}"

npm run db:deploy
npm run dev --workspace=@tinypersonal/personal-app -- --hostname "$TINYPERSONAL_BIND_HOST" --port "$PORT" &
app_pid="$!"
child_pids+=("$app_pid")

echo "Waiting for TinyPersonal on http://127.0.0.1:${PORT} ..."
for attempt in {1..60}; do
  if curl --fail --silent --show-error "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$app_pid" 2>/dev/null; then
    echo "TinyPersonal dev server exited before becoming healthy." >&2
    exit 1
  fi
  if [[ "$attempt" -eq 60 ]]; then
    echo "TinyPersonal did not become healthy within 60 seconds." >&2
    exit 1
  fi
  sleep 1
done

node scripts/chat/run-jobs.mjs &
child_pids+=("$!")

if [[ -n "${DISCORD_BOT_TOKEN:-}" ]]; then
  node --no-warnings packages/discord-bot/src/index.ts &
  child_pids+=("$!")
fi

if [[ "$ENABLE_TAILSCALE_FUNNEL" == "1" ]]; then
  "$SCRIPT_DIR/open-funnel.sh" "$PORT"
fi

echo "TinyPersonal is ready. Chat generation runner is active."
wait "$app_pid"
