#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-3000}"

for command_name in docker curl; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Error: $command_name is not installed or is not in PATH." >&2
    exit 1
  fi
done

cd "$SCRIPT_DIR"

docker network inspect tinypersonal-network >/dev/null 2>&1 || docker network create tinypersonal-network >/dev/null

for container_name in tinypersonal-hub minio tinypersonal-searxng; do
  if docker container inspect "$container_name" >/dev/null 2>&1; then
    docker rm --force "$container_name" >/dev/null
  fi
done

echo "Starting TinyPersonal stack with Docker Compose..."
docker compose up -d --build

echo "Waiting for app health on http://127.0.0.1:${PORT}/api/health ..."
for attempt in {1..30}; do
  if curl --fail --silent --show-error "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    break
  fi

  if [[ "$attempt" -eq 30 ]]; then
    echo "Error: application did not become ready."
    docker compose logs --tail=120 app
    exit 1
  fi
  sleep 2
done

"$SCRIPT_DIR/scripts/open-funnel.sh" "$PORT" || true

echo "Stack is ready."
docker compose ps
