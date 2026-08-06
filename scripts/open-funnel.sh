#!/usr/bin/env bash

set -Eeuo pipefail

PORT="${1:-${PORT:-3000}}"
ENABLE_TAILSCALE_FUNNEL="${ENABLE_TAILSCALE_FUNNEL:-1}"

if [[ "$ENABLE_TAILSCALE_FUNNEL" != "1" ]]; then
  echo "Skipping Tailscale Funnel (ENABLE_TAILSCALE_FUNNEL=$ENABLE_TAILSCALE_FUNNEL)."
  exit 0
fi

if ! command -v tailscale >/dev/null 2>&1; then
  echo "Warning: tailscale is not installed; skipping funnel setup."
  exit 0
fi

run_tailscale() {
  if tailscale "$@"; then
    return 0
  fi

  if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
    sudo -n tailscale "$@"
    return $?
  fi

  return 1
}

if run_tailscale funnel status 2>/dev/null | grep -q "proxy http://127.0.0.1:${PORT}"; then
  echo "Tailscale Funnel already points to port ${PORT}."
  exit 0
fi

echo "Configuring Tailscale Funnel to port ${PORT}..."
run_tailscale funnel --https=443 off >/dev/null 2>&1 || true

if ! tailscale funnel status >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
    sudo -n tailscale set --operator="$USER" >/dev/null 2>&1 || true
  fi
fi

if ! run_tailscale funnel --bg --yes "$PORT"; then
  echo "Warning: failed to start Tailscale Funnel automatically."
  echo "If needed, run one of these commands manually:"
  echo "  sudo tailscale set --operator=$USER"
  echo "  tailscale funnel --bg --yes ${PORT}"
  exit 1
fi

if run_tailscale funnel status 2>/dev/null | grep -q "proxy http://127.0.0.1:${PORT}"; then
  echo "Tailscale Funnel is active and points to port ${PORT}."
  exit 0
fi

echo "Warning: funnel command succeeded but status does not show target port ${PORT}."
run_tailscale funnel status || true
exit 1
