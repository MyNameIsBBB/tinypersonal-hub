#!/usr/bin/env bash

set -Eeuo pipefail

declare -a child_pids=()

stop_children() {
  if ((${#child_pids[@]} > 0)); then
    kill "${child_pids[@]}" 2>/dev/null || true
    wait "${child_pids[@]}" 2>/dev/null || true
  fi
}

start_child() {
  "$@" &
  child_pids+=("$!")
}

trap stop_children EXIT INT TERM

npm run db:deploy
node scripts/import-memory-seed.mjs
start_child npm run start --workspace=@tinypersonal/personal-app -- --port 3000

if [[ -n "${CRON_SECRET:-}" ]]; then
  start_child node scripts/chat/run-jobs.mjs
fi

if [[ -n "${DISCORD_BOT_TOKEN:-}" ]]; then
  start_child node packages/discord-bot/dist/index.js
fi

# Any essential child exiting should restart the container and recover leased jobs.
wait -n "${child_pids[@]}"
