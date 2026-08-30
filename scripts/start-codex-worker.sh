#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_DIR="${CODEX_WORKER_DIR:-/tmp/tinypersonal-codex-worker}"
PROJECT_ROOT="${HOST_JARVIS_PROJECT_ROOT:-/home/best/production-app}"
LOG_FILE="$WORKER_DIR/worker.log"
UNIT_NAME="tinypersonal-codex-worker.service"

mkdir -p "$WORKER_DIR"
chmod 700 "$WORKER_DIR"
if [[ ! -d "$PROJECT_ROOT/.git" ]]; then
  echo "Codex worker project is not a Git repository: $PROJECT_ROOT" >&2
  exit 1
fi

CODEX_EXECUTABLE="$(command -v codex || true)"
if [[ -z "$CODEX_EXECUTABLE" && -d "$HOME/.nvm/versions/node" ]]; then
  CODEX_EXECUTABLE="$(find "$HOME/.nvm/versions/node" -type f -path '*/bin/codex' 2>/dev/null | sort -V | tail -n 1)"
fi
if [[ -z "$CODEX_EXECUTABLE" ]]; then
  echo "codex executable not found in PATH" >&2
  exit 1
fi
systemctl --user stop "$UNIT_NAME" >/dev/null 2>&1 || true
systemctl --user reset-failed "$UNIT_NAME" >/dev/null 2>&1 || true
rm -f "$WORKER_DIR/worker.sock"
systemd-run --user \
  --unit="${UNIT_NAME%.service}" \
  --property=Restart=on-failure \
  --property=RestartSec=2 \
  --setenv=CODEX_WORKER_SOCKET="$WORKER_DIR/worker.sock" \
  --setenv=CODEX_WORKER_PROJECT_ROOT="$PROJECT_ROOT" \
  --setenv=CODEX_EXECUTABLE="$CODEX_EXECUTABLE" \
  node "$SCRIPT_DIR/codex-worker.mjs" >/dev/null

for _ in {1..50}; do
  [[ -S "$WORKER_DIR/worker.sock" ]] && exit 0
  systemctl --user is-active --quiet "$UNIT_NAME" || {
    journalctl --user -u "$UNIT_NAME" --lines 30 --no-pager >&2
    exit 1
  }
  sleep 0.1
done
echo "Codex worker socket was not created." >&2
exit 1
