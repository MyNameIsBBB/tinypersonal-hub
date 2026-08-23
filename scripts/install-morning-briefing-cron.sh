#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if ! command -v crontab >/dev/null 2>&1; then
  echo "crontab is not installed; falling back to a systemd user timer"
  exec bash "$SCRIPT_DIR/install-morning-briefing-systemd.sh"
fi

CRON_TZ_LINE="CRON_TZ=Asia/Bangkok"
CRON_LINE="0 8 * * * cd '$PROJECT_DIR' && /usr/bin/env node '$PROJECT_DIR/scripts/run-morning-briefing.mjs' >> '$PROJECT_DIR/.data/morning-briefing.log' 2>&1"
mkdir -p "$PROJECT_DIR/.data"
(crontab -l 2>/dev/null | grep -v "run-morning-briefing.mjs" | grep -v '^CRON_TZ=Asia/Bangkok$' || true; echo "$CRON_TZ_LINE"; echo "$CRON_LINE") | crontab -
echo "Installed morning briefing cron for 08:00 Asia/Bangkok."
