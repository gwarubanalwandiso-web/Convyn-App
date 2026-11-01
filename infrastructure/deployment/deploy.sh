#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
skip_build=false
prepare_only=false
for argument in "$@"; do
  case "$argument" in
    --skip-build) skip_build=true ;;
    --prepare) prepare_only=true ;;
    *) echo 'Usage: deploy.sh [--skip-build] [--prepare]' >&2; exit 1 ;;
  esac
done
if $skip_build; then bash "$repo_dir/infrastructure/deployment/preflight.sh" --runtime; else bash "$repo_dir/infrastructure/deployment/preflight.sh"; fi
if ! $skip_build; then
  build_compose=("${compose[@]}")
  if [[ -n ${CODEX_PROXY_CERT:-} ]]; then build_compose+=(-f "$repo_dir/infrastructure/deployment/compose.proxy-build.yml"); fi
  COMPOSE_PARALLEL_LIMIT=1 "${build_compose[@]}" --profile tools build --pull
fi
"${compose[@]}" up -d --wait postgres redis
existing=$("${compose[@]}" exec -T postgres psql -XAt -U convyn -d convyn -c "SELECT to_regclass('public.convyn_schema_migrations') IS NOT NULL;")
if [[ $existing == t ]]; then bash "$repo_dir/infrastructure/deployment/backup.sh"; fi
"${compose[@]}" --profile tools run --rm --no-deps tools node scripts/migrate.mjs
"${compose[@]}" --profile tools run --rm --no-deps tools node scripts/seed-categories.mjs
"${compose[@]}" --profile tools run --rm --no-deps tools node scripts/provision-runtime-role.mjs
if $prepare_only; then
  printf 'Private database preparation complete. Provision the administrator before publishing the staging edge, then run deploy.sh --skip-build.\n'
  exit 0
fi
"${compose[@]}" up -d --no-build --wait --wait-timeout 180 api customer provider admin business enterprise edge
printf 'All deployment services are healthy. Run smoke-test.sh to verify external HTTPS/DNS and application behaviour.\n'
