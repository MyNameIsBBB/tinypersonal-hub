#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs"
LOG_FILE="$LOG_DIR/funnel-heal.log"
PORT="${PORT:-3000}"

mkdir -p "$LOG_DIR"

if ! command -v crontab >/dev/null 2>&1; then
  echo "crontab is not installed"
  exit 1
fi

job="*/3 * * * * cd $PROJECT_ROOT && PORT=$PORT ENABLE_TAILSCALE_FUNNEL=1 ./scripts/check-funnel-health.sh >> $LOG_FILE 2>&1"

current="$(crontab -l 2>/dev/null || true)"
filtered="$(printf '%s\n' "$current" | grep -v 'scripts/check-funnel-health.sh' || true)"

printf '%s\n%s\n' "$filtered" "$job" | crontab -

echo "installed cron auto-heal job"
echo "$job"
