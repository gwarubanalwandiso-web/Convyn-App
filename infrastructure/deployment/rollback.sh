#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
release_tag=${1:?Supply a previously built, database-compatible release tag}
[[ $release_tag =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}$ ]] || { echo 'Invalid image release tag.' >&2; exit 1; }
for service in api customer provider admin business enterprise; do docker image inspect "convyn-$service:$release_tag" >/dev/null; done
RELEASE_TAG="$release_tag" "${compose[@]}" up -d --no-build --wait --wait-timeout 180 api customer provider admin business enterprise edge
printf 'Application image rollback completed. Database was not downgraded; verify HTTPS and record the selected release tag.\n'
