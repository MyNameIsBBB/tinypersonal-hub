#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="tinypersonal-hub"
IMAGE_NAME="${APP_NAME}:local"
CONTAINER_NAME="${APP_NAME}"
DATA_VOLUME="${APP_NAME}-data"
PORT="${PORT:-3000}"
DOCKERFILE="$(mktemp "${TMPDIR:-/tmp}/${APP_NAME}.Dockerfile.XXXXXX")"

cleanup() {
  rm -f "$DOCKERFILE"
}
trap cleanup EXIT

for command_name in docker tailscale curl; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Error: $command_name is not installed or is not in PATH." >&2
    exit 1
  fi
done

cd "$SCRIPT_DIR"

cat >"$DOCKERFILE" <<'DOCKERFILE_EOF'
FROM node:22-bookworm-slim

WORKDIR /app

ENV DATABASE_URL=file:/tmp/build.db

COPY . .
RUN npm ci \
  && npm run db:generate \
  && npm run build

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/data/dev.db

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["sh", "-c", "npm run db:deploy && npm run start --workspace=@tinypersonal/personal-app -- --hostname 0.0.0.0 --port 3000"]
DOCKERFILE_EOF

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

if [[ -f "$SCRIPT_DIR/.env" ]]; then
  docker_args+=(--env-file "$SCRIPT_DIR/.env")
fi

docker_args+=(--env "DATABASE_URL=file:/data/dev.db")
docker_args+=(--env "MEDIA_LOCAL_ROOT=/data/media")
docker_args+=("$IMAGE_NAME")
docker "${docker_args[@]}" >/dev/null

echo "Waiting for http://127.0.0.1:${PORT} ..."
for attempt in {1..30}; do
  if curl --fail --silent --show-error "http://127.0.0.1:${PORT}" >/dev/null 2>&1; then
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

echo "Starting Tailscale Funnel..."
tailscale funnel --bg --yes "$PORT"
