#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"
SERVICE_NAME="tinypersonal-docker.service"
SERVICE_PATH="$SYSTEMD_USER_DIR/$SERVICE_NAME"

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl is not installed."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is not installed or not in PATH."
  exit 1
fi

mkdir -p "$SYSTEMD_USER_DIR" "$PROJECT_DIR/.data"

cat > "$SERVICE_PATH" <<EOF
[Unit]
Description=TinyPersonal Docker stack (auto start after reboot)
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$PROJECT_DIR
EnvironmentFile=-$PROJECT_DIR/.env
ExecStart=/usr/bin/env bash $PROJECT_DIR/start-docker.sh
ExecStop=/usr/bin/docker stop tinypersonal-hub
StandardOutput=append:$PROJECT_DIR/.data/start-docker-systemd.log
StandardError=append:$PROJECT_DIR/.data/start-docker-systemd.log
TimeoutStartSec=0

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now "$SERVICE_NAME"

echo "Installed systemd user service: $SERVICE_NAME"
systemctl --user status --no-pager "$SERVICE_NAME" | sed -n '1,18p'

if command -v loginctl >/dev/null 2>&1; then
  linger_state="$(loginctl show-user "$USER" --property=Linger --value 2>/dev/null || true)"
  if [[ "$linger_state" != "yes" ]]; then
    echo
    echo "Tip: to start user services even before login after reboot, enable linger:"
    echo "  sudo loginctl enable-linger $USER"
  fi
fi
