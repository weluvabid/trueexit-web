#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  printf 'Error: npm is required to run verification.\n' >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  printf 'Error: dependencies are not installed. Run npm ci first.\n' >&2
  exit 1
fi

run_check() {
  local description="$1"
  shift

  printf '\n==> %s\n' "$description"
  "$@"
}

run_check "Formatting" npm run format:check
run_check "Linting" npm run lint
run_check "Type checking" npm run check
run_check "Tests" npm run test
run_check "Production build" npm run build

printf '\nAll verification checks passed.\n'
