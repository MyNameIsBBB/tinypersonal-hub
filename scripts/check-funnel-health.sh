#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT="${PORT:-3000}"
LOCAL_HEALTH_URL="http://127.0.0.1:${PORT}/api/health"

if ! command -v tailscale >/dev/null 2>&1; then
  echo "tailscale is not installed"
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is not installed"
  exit 1
fi

if ! curl --silent --show-error --fail --max-time 8 "$LOCAL_HEALTH_URL" >/dev/null; then
  echo "local app health failed at $LOCAL_HEALTH_URL"
  exit 1
fi

funnel_url="$(tailscale funnel status 2>/dev/null | awk '/^https:\/\// {print $1; exit}')"
if [[ -z "$funnel_url" ]]; then
  echo "no active funnel route found, trying to open"
  "$SCRIPT_DIR/open-funnel.sh" "$PORT" || true
  funnel_url="$(tailscale funnel status 2>/dev/null | awk '/^https:\/\// {print $1; exit}')"
fi

if [[ -z "$funnel_url" ]]; then
  echo "funnel url is unavailable"
  exit 1
fi

funnel_health_url="${funnel_url%/}/api/health"
if curl --silent --show-error --fail --max-time 12 "$funnel_health_url" >/dev/null; then
  echo "funnel health ok: $funnel_health_url"
  exit 0
fi

echo "funnel health failed, trying to heal routing"
"$SCRIPT_DIR/open-funnel.sh" "$PORT" || true

if curl --silent --show-error --fail --max-time 12 "$funnel_health_url" >/dev/null; then
  echo "funnel healed: $funnel_health_url"
  exit 0
fi

echo "funnel still unhealthy: $funnel_health_url"
exit 1
