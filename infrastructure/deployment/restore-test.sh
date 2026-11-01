#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
backup_file=${1:?Supply the path to a PostgreSQL custom-format backup}
test -f "$backup_file"
if [[ -f "$backup_file.sha256" ]]; then (cd -- "$(dirname -- "$backup_file")" && sha256sum --check --status "$(basename -- "$backup_file.sha256")"); fi
database="convyn_restore_test_$(openssl rand -hex 8)"
"${compose[@]}" exec -T postgres createdb -U convyn "$database"
cleanup(){ "${compose[@]}" exec -T postgres dropdb -U convyn --if-exists "$database"; }
trap cleanup EXIT
"${compose[@]}" exec -T postgres pg_restore --exit-on-error --no-owner --no-acl -U convyn -d "$database" < "$backup_file"
count=$("${compose[@]}" exec -T postgres psql -XAt -U convyn -d "$database" -c 'SELECT count(*) FROM convyn_schema_migrations;')
[[ $count =~ ^[0-9]+$ ]] && (( count > 0 ))
"${compose[@]}" exec -T postgres psql -XAt -U convyn -d "$database" -c 'SELECT PostGIS_Version();' >/dev/null
printf 'PASS: backup restored into an isolated temporary database; %s migrations verified. Live database untouched.\n' "$count"
