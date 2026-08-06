#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"
PORT="${PORT:-3000}"

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl is not installed"
  exit 1
fi

mkdir -p "$SYSTEMD_USER_DIR"
mkdir -p "$PROJECT_ROOT/logs"

cat > "$SYSTEMD_USER_DIR/tinypersonal-funnel-heal.service" <<EOF
[Unit]
Description=TinyPersonal Funnel health check and self-heal

[Service]
Type=oneshot
WorkingDirectory=$PROJECT_ROOT
Environment=PORT=$PORT
Environment=ENABLE_TAILSCALE_FUNNEL=1
ExecStart=$PROJECT_ROOT/scripts/check-funnel-health.sh
StandardOutput=append:$PROJECT_ROOT/logs/funnel-heal.log
StandardError=append:$PROJECT_ROOT/logs/funnel-heal.log
EOF

cat > "$SYSTEMD_USER_DIR/tinypersonal-funnel-heal.timer" <<EOF
[Unit]
Description=Run TinyPersonal Funnel health check every 3 minutes

[Timer]
OnBootSec=90s
OnUnitActiveSec=3min
AccuracySec=30s
Persistent=true
Unit=tinypersonal-funnel-heal.service

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now tinypersonal-funnel-heal.timer

echo "installed systemd user timer tinypersonal-funnel-heal.timer"
systemctl --user status --no-pager tinypersonal-funnel-heal.timer | sed -n '1,12p'
