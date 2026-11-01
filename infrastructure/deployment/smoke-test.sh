#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
umask 077
temporary=$(mktemp -d)
trap 'rm -rf -- "$temporary"' EXIT
for role in CUSTOMER PROVIDER ADMIN BUSINESS ENTERPRISE; do
  domain=$(read_setting "${role}_DOMAIN")
  [[ $domain =~ ^[a-zA-Z0-9.-]+$ ]] || { echo 'Invalid configured domain.' >&2; exit 1; }
  curl --fail --silent --show-error --max-time 30 "https://$domain/" -o "$temporary/page"
  curl --fail --silent --show-error --max-time 30 "https://$domain/v1/ready" -o "$temporary/ready"
  jq -e '.status == "ready"' "$temporary/ready" >/dev/null
  status=$(curl --silent --show-error --max-time 30 -o "$temporary/denied" --write-out '%{http_code}' "https://$domain/v1/bookings")
  [[ $status == 401 ]] || { echo "$role authentication boundary failed" >&2; exit 1; }
  printf 'PASS: %s HTTPS page, database readiness and unauthenticated access restriction.\n' "$role"
done
for service in postgres redis api customer provider admin business enterprise; do
  id=$("${compose[@]}" ps -q "$service")
  [[ -n $id ]]
  docker inspect --format '{{json .HostConfig.PortBindings}}' "$id" | jq -e '. == null or . == {}' >/dev/null
done
"${compose[@]}" exec -T api node -e "if(!process.version.startsWith('v24.'))process.exit(1);console.log('PASS: Node '+process.version)"
"${compose[@]}" exec -T postgres psql -XAt -U convyn -d convyn -c 'SELECT PostGIS_Version();'
"${compose[@]}" exec -T redis redis-cli ping
printf 'PASS: backend ports are not published, PostGIS and authenticated Redis respond.\n'
