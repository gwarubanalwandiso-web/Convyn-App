#!/usr/bin/env bash
set -euo pipefail
if [[ ${1:-} != --apply ]]; then echo 'Usage: sudo bash infrastructure/deployment/bootstrap-ubuntu.sh --apply'; exit 1; fi
if (( EUID != 0 )); then echo 'Root is required to install operating-system packages.' >&2; exit 1; fi
source /etc/os-release
if [[ $ID != ubuntu ]] || [[ ! $VERSION_ID =~ ^(22\.04|24\.04|26\.04)$ ]]; then echo 'This bootstrap supports Ubuntu 22.04/24.04/26.04 LTS. Use the documented equivalent on other systems.' >&2; exit 1; fi
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git openssh-client openssl jq docker.io docker-buildx docker-compose-v2
systemctl enable --now docker
# Membership is not changed automatically; docker access is root-equivalent.
docker version
docker compose version
printf 'Host packages installed. Configure SSH/firewall and non-root deployment access as documented.\n'
