#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
command -v docker >/dev/null 2>&1 || { echo "Error: docker is not installed or is not in PATH." >&2; exit 1; }
cd "$PROJECT_DIR"
docker network inspect tinypersonal-network >/dev/null 2>&1 || docker network create tinypersonal-network >/dev/null
docker compose up -d searxng
echo "SearXNG is available at http://127.0.0.1:8080"
