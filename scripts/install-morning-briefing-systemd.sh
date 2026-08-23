#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"
NODE_BIN="$(command -v node || true)"
BASE_URL="${TINYPERSONAL_BASE_URL:-http://127.0.0.1:3000}"

if ! command -v systemctl >/dev/null 2>&1; then
  echo "Neither crontab nor systemctl is installed. Install cron or systemd first."
  exit 1
fi

if [[ -z "$NODE_BIN" ]]; then
  echo "node is not installed or is not available in PATH"
  exit 1
fi

mkdir -p "$SYSTEMD_USER_DIR" "$PROJECT_DIR/.data"

cat > "$SYSTEMD_USER_DIR/tinypersonal-morning-briefing.service" <<EOF
[Unit]
Description=TinyPersonal daily Morning Briefing
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$PROJECT_DIR
Environment=TINYPERSONAL_BASE_URL=$BASE_URL
EnvironmentFile=-$PROJECT_DIR/.env
EnvironmentFile=-$PROJECT_DIR/packages/personal-app/.env.local
ExecStart=$NODE_BIN $PROJECT_DIR/scripts/run-morning-briefing.mjs
StandardOutput=append:$PROJECT_DIR/.data/morning-briefing.log
StandardError=append:$PROJECT_DIR/.data/morning-briefing.log
EOF

cat > "$SYSTEMD_USER_DIR/tinypersonal-morning-briefing.timer" <<EOF
[Unit]
Description=Run TinyPersonal Morning Briefing at 08:00 Asia/Bangkok

[Timer]
OnCalendar=*-*-* 08:00:00 Asia/Bangkok
AccuracySec=30s
Persistent=true
Unit=tinypersonal-morning-briefing.service

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now tinypersonal-morning-briefing.timer

echo "Installed systemd user timer for 08:00 Asia/Bangkok."
systemctl --user status --no-pager tinypersonal-morning-briefing.timer | sed -n '1,14p'
