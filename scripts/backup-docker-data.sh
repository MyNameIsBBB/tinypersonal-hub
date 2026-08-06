#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${1:-$PROJECT_ROOT/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="tinypersonal-backup-${STAMP}.tar.gz"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/tinypersonal-backup.XXXXXX")"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

for command_name in docker tar; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Error: $command_name is not installed or is not in PATH." >&2
    exit 1
  fi
done

mkdir -p "$BACKUP_DIR"

for volume_name in tinypersonal-hub-data minio-data; do
  echo "Exporting volume: ${volume_name}"
  docker run --rm -v "${volume_name}:/source:ro" -v "$TMP_DIR:/backup" alpine sh -c "cd /source && tar -czf /backup/${volume_name}.tar.gz ."
done

if [[ -f "$PROJECT_ROOT/.env" ]]; then
  cp "$PROJECT_ROOT/.env" "$TMP_DIR/.env"
fi

tar -C "$TMP_DIR" -czf "$BACKUP_DIR/$ARCHIVE" .

echo "Backup created: $BACKUP_DIR/$ARCHIVE"
