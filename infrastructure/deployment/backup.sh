#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
backup_dir=${CONVYN_BACKUP_DIR:-"$repo_dir/infrastructure/deployment/.runtime/backups"}
umask 077
mkdir -p -- "$backup_dir"
backup_file="$backup_dir/convyn-$(date -u +%Y%m%dT%H%M%SZ)-$(openssl rand -hex 4).dump"
partial="$backup_file.partial"
upload_partial="$backup_file.uploads.tar.gz.partial"
trap 'rm -f -- "$partial" "$upload_partial"' EXIT
"${compose[@]}" exec -T postgres pg_dump -U convyn -d convyn --format=custom > "$partial"
test -s "$partial"
mv -- "$partial" "$backup_file"
(cd -- "$backup_dir" && sha256sum -- "$(basename -- "$backup_file")") > "$backup_file.sha256"
"${compose[@]}" --profile tools run --rm --no-deps -T tools tar -C /app/uploads -czf - . > "$upload_partial"
test -s "$upload_partial"
mv -- "$upload_partial" "$backup_file.uploads.tar.gz"
(cd -- "$backup_dir" && sha256sum -- "$(basename -- "$backup_file.uploads.tar.gz")") > "$backup_file.uploads.tar.gz.sha256"
printf 'Database and private-upload backups saved: %s\n'  "$backup_file"
