#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ARCHIVE_PATH="${1:-}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/tinypersonal-restore.XXXXXX")"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if [[ -z "$ARCHIVE_PATH" ]]; then
  echo "Usage: $0 /path/to/tinypersonal-backup-YYYYmmdd-HHMMSS.tar.gz"
  exit 1
fi

if [[ ! -f "$ARCHIVE_PATH" ]]; then
  echo "Error: backup archive not found: $ARCHIVE_PATH"
  exit 1
fi

for command_name in docker tar; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Error: $command_name is not installed or is not in PATH." >&2
    exit 1
  fi
done

echo "Stopping stack before restore..."
cd "$PROJECT_ROOT"
docker compose down || true

tar -C "$TMP_DIR" -xzf "$ARCHIVE_PATH"

for volume_name in tinypersonal-hub-data; do
  if [[ ! -f "$TMP_DIR/${volume_name}.tar.gz" ]]; then
    echo "Error: ${volume_name}.tar.gz is missing from backup archive"
    exit 1
  fi

  docker volume create "$volume_name" >/dev/null
  echo "Restoring volume: ${volume_name}"
  docker run --rm -v "${volume_name}:/target" -v "$TMP_DIR:/backup" alpine sh -c "rm -rf /target/* /target/.[!.]* /target/..?* 2>/dev/null || true; tar -xzf /backup/${volume_name}.tar.gz -C /target"
done

if [[ -f "$TMP_DIR/.env" ]]; then
  cp "$TMP_DIR/.env" "$PROJECT_ROOT/.env"
fi

echo "Restore complete. Start services with: ./start-compose.sh"
