#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

test_dir="$(mktemp -d)"
trap 'rm -f "$test_dir/app.env" "$test_dir/commands" "$test_dir/output"; rmdir "$test_dir"' EXIT
export APP_ENV_FILE="$test_dir/app.env"
export APP_IMAGE="tinypersonal-hub:test"
export DEPLOY_TEST_LOG="$test_dir/commands"
printf 'TEST_SECRET=must-not-appear-in-output\n' > "$APP_ENV_FILE"
unset COMPOSE_PROJECT_NAME

# Every Docker operation is intercepted; these tests never touch the daemon.
docker() {
  printf '%s\n' "$*" >> "$DEPLOY_TEST_LOG"
  case "$1 $2" in
    'container inspect') [[ "$DEPLOY_TEST_MODE" != fresh ]] ;;
    'inspect --format')
      if [[ "$DEPLOY_TEST_MODE" == legacy ]]; then
        printf '\n'
      else
        printf 'existing-project\n'
      fi
      ;;
    'network inspect'|'volume inspect') return 1 ;;
    compose*)
      if [[ "$*" == *'config --quiet'* && "$DEPLOY_TEST_MODE" == invalid ]]; then return 1; fi
      if [[ "$*" == *'up --detach'* && "$DEPLOY_TEST_MODE" == unhealthy ]]; then return 1; fi
      ;;
  esac
}
export -f docker

for mode in fresh existing legacy invalid unhealthy; do
  export DEPLOY_TEST_MODE="$mode"
  : > "$DEPLOY_TEST_LOG"
  result=0
  bash scripts/deploy.sh > "$test_dir/output" 2>&1 || result=$?
  if [[ "$mode" == invalid || "$mode" == unhealthy ]]; then
    [[ "$result" != 0 ]]
    ! grep -q ' ps$' "$DEPLOY_TEST_LOG"
  else
    [[ "$result" == 0 ]]
    grep -q 'up --detach --no-build --wait --wait-timeout 180' "$DEPLOY_TEST_LOG"
    grep -q ' ps$' "$DEPLOY_TEST_LOG"
  fi
  if [[ "$mode" == invalid ]]; then
    ! grep -Eq 'network create|volume create|rm --force|up --detach' "$DEPLOY_TEST_LOG"
  fi
  if [[ "$mode" == existing ]]; then
    grep -q 'compose --project-name existing-project' "$DEPLOY_TEST_LOG"
    ! grep -q 'rm --force' "$DEPLOY_TEST_LOG"
  fi
  if [[ "$mode" == legacy ]]; then
    grep -q 'rm --force tinypersonal-hub' "$DEPLOY_TEST_LOG"
  fi
  ! grep -q 'must-not-appear-in-output' "$test_dir/output"
  ! grep -Eq 'volume rm|compose.* down|prune' "$DEPLOY_TEST_LOG"
  echo "Deployment scenario passed: $mode"
done

export APP_ENV_FILE="$test_dir/missing.env"
: > "$DEPLOY_TEST_LOG"
if bash scripts/deploy.sh > "$test_dir/output" 2>&1; then
  echo 'Missing environment file should fail deployment' >&2
  exit 1
fi
[[ ! -s "$DEPLOY_TEST_LOG" ]]
echo 'Deployment scenario passed: missing environment file'
