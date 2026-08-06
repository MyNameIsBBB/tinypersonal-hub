#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

for command_name in node npm; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Error: $command_name is not installed or is not in PATH." >&2
    exit 1
  fi
done

if [[ ! -f package.json || ! -f packages/backend-api/prisma/schema.prisma ]]; then
  echo "Error: run this script from the checked-out tinypersonal-hub repository." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example. Fill in its required values before production deployment."
else
  echo "Keeping the existing .env file."
fi

echo "Installing exact npm dependencies..."
npm ci

echo "Generating Prisma Client from the current schema..."
npm run db:generate

echo "Checking all workspaces..."
npm run typecheck

echo "TinyPersonal Hub is ready for development."
echo "Run: npm run dev"
echo "Production instructions: RUNNING.md"
