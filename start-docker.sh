#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="tinypersonal-hub"
IMAGE_NAME="${APP_NAME}:local"
CONTAINER_NAME="${APP_NAME}"
DATA_VOLUME="${APP_NAME}-data"
PORT="${PORT:-3000}"
DOCKER_NETWORK="${DOCKER_NETWORK:-}"
ENABLE_TAILSCALE_FUNNEL="${ENABLE_TAILSCALE_FUNNEL:-1}"
DOCKERFILE="$SCRIPT_DIR/Dockerfile"

for command_name in docker curl; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Error: $command_name is not installed or is not in PATH." >&2
    exit 1
  fi
done

cd "$SCRIPT_DIR"

echo "Building all workspaces in Docker..."
docker build --file "$DOCKERFILE" --tag "$IMAGE_NAME" .

if docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  docker rm --force "$CONTAINER_NAME" >/dev/null
fi

docker volume create "$DATA_VOLUME" >/dev/null

docker_args=(
  run --detach
  --name "$CONTAINER_NAME"
  --restart unless-stopped
  --publish "${PORT}:3000"
  --volume "${DATA_VOLUME}:/data"
)

if [[ -n "$DOCKER_NETWORK" ]]; then
  docker_args+=(--network "$DOCKER_NETWORK")
fi

if [[ -f "$SCRIPT_DIR/.env" ]]; then
  docker_args+=(--env-file "$SCRIPT_DIR/.env")
fi

docker_args+=(--env "DATABASE_URL=file:/data/dev.db")
docker_args+=(--env "MEDIA_LOCAL_ROOT=/data/media")
docker_args+=("$IMAGE_NAME")
docker "${docker_args[@]}" >/dev/null

echo "Waiting for http://127.0.0.1:${PORT} ..."
for attempt in {1..30}; do
  if curl --fail --silent --show-error "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    break
  fi

  if [[ "$attempt" -eq 30 ]]; then
    echo "Error: application did not become ready. Recent logs:" >&2
    docker logs --tail 100 "$CONTAINER_NAME" >&2
    exit 1
  fi
  sleep 2
done

echo "Clearing Docker build cache..."
docker builder prune --all --force

ENABLE_TAILSCALE_FUNNEL="$ENABLE_TAILSCALE_FUNNEL" "$SCRIPT_DIR/scripts/open-funnel.sh" "$PORT" || true
