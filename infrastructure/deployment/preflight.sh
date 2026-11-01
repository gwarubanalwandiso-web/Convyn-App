#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
for command in docker curl git openssl jq; do command -v "$command" >/dev/null || { echo "Missing requirement: $command" >&2; exit 1; }; done
docker --host=unix:///var/run/docker.sock info >/dev/null
docker buildx version >/dev/null || { echo "Docker Buildx/BuildKit is required." >&2; exit 1; }
version=$(docker compose version --short | sed 's/^v//')
minimum=2.24.4
if [[ $(printf '%s\n' "$minimum" "$version" | sort -V | head -n 1) != "$minimum" ]]; then echo 'Docker Compose 2.24.4 or later is required.' >&2; exit 1; fi
memory_mb=$(awk '/MemTotal:/{print int($2/1024)}' /proc/meminfo)
if (( memory_mb < 3500 )); then echo 'At least 4 GB RAM is required; 8 GB is recommended for builds.' >&2; exit 1; fi
free_kb=$(df -Pk "$repo_dir" | awk 'NR==2{print $4}')
if [[ ${1:-} != --runtime ]] && (( free_kb < 12582912 )); then echo 'At least 12 GiB free workspace disk is required for the image build; allow additional database and backup capacity.' >&2; exit 1; fi
"${compose[@]}" --profile tools config --quiet
printf 'PASS: Docker %s, Compose %s, %s MB RAM, deployment configuration valid.\n' "$(docker version --format '{{.Server.Version}}')" "$version" "$memory_mb"
