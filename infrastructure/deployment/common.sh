#!/usr/bin/env bash
# Source from deployment scripts. No credential file is executed as shell code.
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
env_file=${CONVYN_DEPLOY_ENV:-"$repo_dir/infrastructure/deployment/.env"}
if [[ ! -f $env_file ]]; then echo 'Run infrastructure/deployment/init-env.sh first.' >&2; exit 1; fi
if [[ $(stat -c %a "$env_file") != 600 && $(stat -c %a "$env_file") != 400 ]]; then echo 'Deployment environment must have mode 600 or 400.' >&2; exit 1; fi
unset DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS DOCKER_TLS_VERIFY DOCKER_CERT_PATH
compose=(docker --host=unix:///var/run/docker.sock compose --env-file "$env_file" -f "$repo_dir/infrastructure/deployment/compose.yml")
if [[ -n ${CONVYN_DEPLOY_OVERLAY:-} ]]; then compose+=(-f "$CONVYN_DEPLOY_OVERLAY"); fi
read_setting(){ local key=$1; sed -n "s/^${key}=//p" "$env_file" | head -n 1; }
