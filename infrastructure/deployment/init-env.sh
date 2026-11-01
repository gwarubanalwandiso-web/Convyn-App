#!/usr/bin/env bash
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
env_file=${CONVYN_DEPLOY_ENV:-"$repo_dir/infrastructure/deployment/.env"}
base_domain=${1:?Usage: init-env.sh BASE_DOMAIN TLS_EMAIL [RELEASE_TAG]}
tls_email=${2:?Supply the certificate contact email}
release_tag=${3:-$(git -C "$repo_dir" rev-parse --short=12 HEAD)}
customer_domain=${CUSTOMER_DOMAIN:-app.$base_domain}
admin_email=${ADMIN_EMAIL:-admin@$base_domain}
if [[ ! $base_domain =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ ]] || [[ $base_domain != *.* ]] || [[ $base_domain == *..* ]]; then
  echo 'Use a DNS domain without scheme, path or port.' >&2; exit 1
fi
if [[ ! $tls_email =~ ^[a-zA-Z0-9._+%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then echo 'Invalid certificate contact email.' >&2; exit 1; fi
if [[ ! $release_tag =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}$ ]]; then echo 'Invalid image release tag.' >&2; exit 1; fi
if [[ ! $customer_domain =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ ]] || [[ $customer_domain != *.* ]] || [[ $customer_domain == *..* ]]; then echo "Invalid customer domain." >&2; exit 1; fi
if [[ ! $admin_email =~ ^[a-zA-Z0-9._+%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then echo "Invalid administrator email." >&2; exit 1; fi
if [[ -e $env_file ]]; then echo 'Deployment environment already exists; no values changed.'; exit 0; fi
database_password=$(openssl rand -hex 32)
redis_password=$(openssl rand -hex 32)
app_password=$(openssl rand -hex 32)
umask 077
mkdir -p -- "$(dirname -- "$env_file")"
set -o noclobber
cat > "$env_file" <<EOF
COMPOSE_PROJECT_NAME=convyn
RELEASE_TAG=$release_tag
POSTGRES_PASSWORD=$database_password
REDIS_PASSWORD=$redis_password
APP_DATABASE_PASSWORD=$app_password
CUSTOMER_DOMAIN=$customer_domain
ADMIN_EMAIL=$admin_email
PROVIDER_DOMAIN=provider.$base_domain
ADMIN_DOMAIN=admin.$base_domain
BUSINESS_DOMAIN=business.$base_domain
ENTERPRISE_DOMAIN=enterprise.$base_domain
TLS_EMAIL=$tls_email
# Keep private until DNS, firewall and staging exposure are deliberately configured.
EDGE_BIND=127.0.0.1
EOF
printf 'Created private deployment configuration at %s. No secrets printed.\n' "$env_file"
