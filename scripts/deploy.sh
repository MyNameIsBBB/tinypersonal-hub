#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"
export APP_ENV_FILE="${APP_ENV_FILE:-/home/best/actions-runner/.env}"
export APP_IMAGE="${APP_IMAGE:?APP_IMAGE must identify the tested Docker image}"

if [[ ! -r "$APP_ENV_FILE" ]]; then
  echo "Application environment file is not readable: $APP_ENV_FILE" >&2
  exit 1
fi
docker image inspect "$APP_IMAGE" >/dev/null

# Reuse the existing Compose project, including deployments from another checkout.
project_name="${COMPOSE_PROJECT_NAME:-tinypersonal-hub}"
for container_name in tinypersonal-hub tinypersonal-searxng; do
  if docker container inspect "$container_name" >/dev/null 2>&1; then
    existing_project="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$container_name")"
    if [[ -n "$existing_project" && "$existing_project" != '<no value>' ]]; then
      project_name="$existing_project"
      break
    fi
  fi
done
compose=(docker compose --project-name "$project_name" --env-file "$APP_ENV_FILE")
# Validate without printing interpolated credentials.
"${compose[@]}" config --quiet
docker network inspect tinypersonal-network >/dev/null 2>&1 || docker network create tinypersonal-network >/dev/null
docker volume inspect tinypersonal-hub-data >/dev/null 2>&1 || docker volume create tinypersonal-hub-data >/dev/null

# Adopt containers created by the legacy docker-run launcher. Keep the data volume.
for container_name in tinypersonal-hub tinypersonal-searxng; do
  if docker container inspect "$container_name" >/dev/null 2>&1; then
    existing_project="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$container_name")"
    if [[ -z "$existing_project" || "$existing_project" == '<no value>' ]]; then
      docker rm --force "$container_name" >/dev/null
    elif [[ "$existing_project" != "$project_name" ]]; then
      echo "Container $container_name belongs to another Compose project: $existing_project" >&2
      exit 1
    fi
  fi
done

# Container startup applies Prisma migrations before starting the app and chat worker.
# Compose waits for /api/health via the configured container health check.
"${compose[@]}" up --detach --no-build --wait --wait-timeout 180
"${compose[@]}" ps
if [[ -n "${MEMORY_SEED_KEY:-}" ]]; then
  "${compose[@]}" exec --no-TTY app node scripts/verify-memory-seed.mjs
fi
