# Server installation, deployment and verification

This guide deploys the **implemented staging marketplace**. It does not make payments, external identity verification, notifications, native distribution, or the outstanding production/security work operational. Use synthetic staging data until `PRODUCTION_READINESS.md` is addressed.

The package is tested in an isolated Docker deployment in the cloud workspace. Remote deployment remains blocked by the managed environment’s SSH network access; host installation, public certificates and firewall changes have not been verified on the supplied server.

## 1. Server and access requirements

Use a clean Ubuntu 24.04 LTS server; the installer also accepts Ubuntu 22.04/26.04 LTS, but their package installation has not been exercised here. Recommend 4 vCPU, 8 GB RAM and at least 80 GB SSD with capacity for database growth and backups. Preflight requires at least 4 GB RAM, 12 GiB free workspace disk, a reachable local Docker daemon, and Compose 2.24.4+. This is a single-server deployment, not high availability.

You need:

- SSH IP/hostname, username and port, a sudo-capable account, and verified server host-key fingerprint.
- SSH key/agent access configured securely. Never put a private key or password in chat, repository files, or a Git URL.
- A domain and access to its DNS. The generated hosts are `app`, `provider`, `admin`, `business`, and `enterprise` under that domain.
- A certificate contact email and inbound reachability on TCP 80/443. Preserve the actual SSH port and restrict administrative access using the provider firewall.

Before accepting a new SSH host key, compare its fingerprint with your provider console or another trusted channel. Do not disable strict host-key checking. In a managed agent environment the server also needs an authorised SSH/TCP network grant; HTTP package-registry access alone does not provide SSH access.

## 2. Connect and obtain the repository

Replace the host, port and username with your real values:

```sh
ssh -p SSH_PORT SSH_USER@SERVER_IP
sudo apt-get update
sudo apt-get install -y git ca-certificates
sudo install -d -m 0750 -o "$(id -un)" -g "$(id -gn)" /opt/convyn
git clone https://github.com/gwarubanalwandiso-web/Convyn-App.git /opt/convyn
cd /opt/convyn
git rev-parse HEAD
```

For a private repository, configure a read-only deploy credential through your server's credential manager/SSH setup. Do not embed a token in the URL. If `/opt/convyn` already contains a checkout, inspect `git status` and preserve existing configuration/data; do not overwrite it or reset user changes. Use a reviewed fast-forward update instead.

## 3. Install host requirements

```sh
sudo bash infrastructure/deployment/bootstrap-ubuntu.sh --apply
```

The script installs signed Ubuntu packages for CA certificates, curl, Git, OpenSSH client, OpenSSL, jq, Docker, Buildx/BuildKit and Compose, then enables Docker. It does not disable signature/TLS verification, change SSH configuration, open firewall ports, reboot, or install Node globally. Node 24, pnpm 11.25.0, compiled apps and application dependencies are provided by the container build.

For a non-root deployment account, grant Docker access deliberately (Docker membership is root-equivalent), then reconnect:

```sh
sudo usermod -aG docker "$USER"
exit
```

Reconnect over SSH, return to `/opt/convyn`, and check:

```sh
docker version
docker compose version
```

## 4. Generate private deployment configuration

The requested customer domain and administrator login are configured as follows (other portal subdomains are proposed defaults and require DNS records):

```sh
CUSTOMER_DOMAIN=www.convyn.cloud ADMIN_EMAIL=admin@convyn.cloud bash infrastructure/deployment/init-env.sh convyn.cloud admin@convyn.cloud "$(git rev-parse --short=12 HEAD)"
```

This creates `infrastructure/deployment/.env` with separate random database-owner, API database-role and Redis credentials and mode 600. It prints no secrets and never overwrites an existing file. Keep this file out of Git, Docker build contexts and logs. Back it up securely: losing database credentials or certificate volumes affects recovery.

Review domain names with a secure editor. `EDGE_BIND` starts at `127.0.0.1` to keep the edge private until routing is configured. Only the reverse proxy can publish ports; the database, Redis, API and five app services do not publish host ports.

## 5. Configure DNS, firewall and the edge binding

Create these DNS A records to the server's public IPv4 address:

| Host                    | Purpose        |
| ----------------------- | -------------- |
| www.convyn.cloud        | Customer       |
| provider.convyn.cloud   | Provider       |
| admin.convyn.cloud      | Administration |
| business.convyn.cloud   | Business       |
| enterprise.convyn.cloud | Enterprise     |

Only create AAAA records if IPv6 is configured and reachable. Remove stale/unreachable records before requesting certificates. Do not enable a CDN proxy until direct DNS/TLS validation works.

Inspect existing listeners with `sudo ss -lntp`; do not stop another application's web server blindly. If ports 80/443 are already used, integrate the existing proxy or choose a separate server.

In your hosting-provider firewall, preserve the actual SSH port from your administration IP and allow inbound TCP 80/443. Do not expose 5432, 6379, 3000–3004 or 4000. Docker-published ports are not reliably restricted by simple UFW rules; publishing only the edge is intentional. If you use a host firewall, establish the correct SSH allow rule and recovery-console access before enabling it.

The host firewall helper previews commands unless `--apply` is supplied. From the server, with provider recovery-console access available:

```sh
# Replace 22 with the real SSH port. Preview first.
bash infrastructure/deployment/firewall.sh setup --ssh-port 22
sudo bash infrastructure/deployment/firewall.sh setup --ssh-port 22 --apply
sudo bash infrastructure/deployment/firewall.sh status --apply
# Examples for additional host ports:
sudo bash infrastructure/deployment/firewall.sh allow 8080 8443 --ssh-port 22 --apply
sudo bash infrastructure/deployment/firewall.sh deny 8080 --ssh-port 22 --apply
sudo bash infrastructure/deployment/firewall.sh allow 51820 --protocol udp --ssh-port 22 --apply
```

`allow` and `deny` insert priority rules ahead of existing rules; review existing policy before applying. The script refuses a TCP deny for the protected SSH port, preserves existing rules/defaults, and allows that SSH port from any source to retain access. It does not discover every configured SSH listener. When run over SSH it detects the connection’s server port; explicitly specify it when running through sudo or a console. Verify a second SSH login after enabling the firewall. `setup` installs UFW when missing, allows TCP SSH/80/443, sets deny-incoming and allow-outgoing defaults, and enables UFW. Existing explicit rules remain, so previously allowed ports remain allowed: inspect `status` and deny unwanted ports explicitly. The separate `enable` command preserves defaults. Port 443/UDP is unnecessary for this Compose deployment, which publishes TCP only. PostgreSQL 5432, Redis 6379, API 4000 and portals 3000–3004 remain on private Docker networks and must not be opened publicly. Outbound DNS/HTTPS for certificates and package downloads remains allowed. This helper is for host traffic: to deny a Docker-published service, remove its port publication or restrict its bind address and update the provider firewall. It cannot change this cloud environment’s outbound network policy. No authenticated web firewall control panel is exposed.

Keep `EDGE_BIND=127.0.0.1` while preparing the database and administrator. Validate requirements now:

```sh
bash infrastructure/deployment/preflight.sh
```

Caddy requests public certificates automatically on startup and renews them using persistent volumes. It requires outbound DNS/HTTPS access to its ACME provider and inbound challenge reachability. Public certificate issuance is not validated by the local test stack.

## 6. Build and prepare the private database

```sh
bash infrastructure/deployment/deploy.sh --prepare
```

This:

1. Checks host prerequisites and validates Compose without printing the expanded secret configuration.
2. Builds a production-dependency API image, five standalone Next images, and a batch tooling image. Frozen dependency installation and an explicit reviewed build-script allowlist are preserved. No local `.env`, private key, database dump or managed proxy certificate is copied into images.
3. Starts private PostGIS and password-protected Redis with persistent volumes.
4. Backs up an existing application database before migrations.
5. Applies checksum-verified, transaction-locked SQL migrations, inserts only reference categories, and provisions the restricted `convyn_app` runtime role. The API has no superuser, database/role creation, migration-ledger write or audit update/delete privileges. No customers, providers, administrator passwords or synthetic bookings are seeded.
6. Stops after private preparation when `--prepare` is supplied. Public app/edge startup occurs after the administrator is provisioned below.

Builds are capped at two concurrent application tasks. API/web processes run as the unprivileged Node user with read-only root filesystems, dropped capabilities and bounded memory/PIDs. Caches use temporary mounts. Container logs rotate. The batch tooling image contains development/build dependencies and is not a network service.

On this managed cloud worker, the deployment script automatically adds the proxy-CA build-secret overlay when `CODEX_PROXY_CERT` exists. That is unnecessary on a normal server without the managed proxy. Never work around a certificate error with `--insecure`, `strict-ssl=false` or altered checksums.

## 7. Bootstrap an administrator before public exposure

Create/enrol a 32+ character base32 TOTP secret using your secure password-manager/authenticator workflow. In your private SSH terminal, read credentials without putting them into command history:

```sh
read -r -p 'Administrator email: ' ADMIN_EMAIL
read -r -s -p 'Administrator password (16+ characters): ' ADMIN_PASSWORD
printf '\n'
read -r -s -p 'Enrolled base32 TOTP secret: ' ADMIN_MFA_SECRET
printf '\n'
export ADMIN_EMAIL ADMIN_PASSWORD ADMIN_MFA_SECRET
docker compose --env-file infrastructure/deployment/.env -f infrastructure/deployment/compose.yml --profile tools run --rm --no-deps --env ADMIN_EMAIL --env ADMIN_PASSWORD --env ADMIN_MFA_SECRET tools node scripts/create-admin.mjs
unset ADMIN_EMAIL ADMIN_PASSWORD ADMIN_MFA_SECRET
```

Sign in at the admin domain using the password and current authenticator code. The command creates one administrator and does not print credentials. Production MFA-secret envelope encryption and replay hardening remain outstanding; do not treat this staging setup as final security approval.

## 8. Publish staging, then verify HTTPS and installed requirements

```sh
sed -i 's/^EDGE_BIND=.*/EDGE_BIND=0.0.0.0/' infrastructure/deployment/.env
bash infrastructure/deployment/deploy.sh --skip-build
bash infrastructure/deployment/smoke-test.sh
docker compose --env-file infrastructure/deployment/.env -f infrastructure/deployment/compose.yml ps
```

The smoke script verifies trusted public HTTPS for all five hosts, database readiness, unauthenticated API denial, Node 24, PostGIS, Redis authentication and absence of backend host-port bindings. It fails on an invalid certificate, wrong domain, failed dependency or exposed backend port.

A healthy container is not proof that payment or external-service integrations work. Log in with staging accounts and exercise request → approval → bid → acceptance → fulfilment → review. Invoices remain UNPAID and no online money is collected. The isolated local TLS test in `tests/deployment/https-smoke.mjs` automates that journey with synthetic identities; it is deliberately restricted to its own `.localhost` test stack, not your server database.

For diagnostics (avoid posting secret values or private customer data):

```sh
docker compose --env-file infrastructure/deployment/.env -f infrastructure/deployment/compose.yml logs --tail 100 api edge
docker compose --env-file infrastructure/deployment/.env -f infrastructure/deployment/compose.yml exec postgres pg_isready -U convyn -d convyn
```

Do not run `docker compose config` without `--quiet` in shared logs: expanded environment entries contain credentials.

## 9. Back up and test restoration

```sh
bash infrastructure/deployment/backup.sh
bash infrastructure/deployment/restore-test.sh /absolute/path/to/the-generated.dump
```

Backups use PostgreSQL custom format, mode 600, and a SHA-256 sidecar. A failed dump never replaces a completed backup. The restore test creates a unique temporary database, restores the dump, verifies migration history/PostGIS, then removes only that temporary database. It never overwrites the live database.

Schedule this backup command with your host's timer service and monitor failures. For example, 02:00 UTC is 04:00 in South Africa. Verify the server/timer timezone before adopting that example. Keep encrypted copies off the server and test recovery regularly. This repository does not provision an off-site backup account or its encryption keys.

## 10. Update and roll back

Before an update, preserve the current release tag and ensure its images remain locally available. Back up first, review compatibility, fast-forward the repository, set `RELEASE_TAG` in the private environment file to the new commit, then rerun `deploy.sh` and `smoke-test.sh`.

For a known database-compatible previous image release:

```sh
bash infrastructure/deployment/rollback.sh PREVIOUS_RELEASE_TAG
bash infrastructure/deployment/smoke-test.sh
```

Rollback requires local API/web images for that tag and never downgrades or destroys the database. Record/set the selected release tag in the environment file after successful validation. If a schema change is not backwards compatible, prepare an explicit reviewed database recovery plan; never improvise `down -v`, reset the production schema, or restore over live data.

## Verification boundaries

The isolated workspace test covers image builds, non-root API/web runtime, private backend ports, custom-CA-verified HTTPS routing, secure cookies, MFA, the marketplace journey, health checks, migrations and backup restoration. It does not establish remote server reachability, public DNS/ACME issuance, the Ubuntu host installation on your server, production data recovery, mobile distribution, or third-party payment/notification behaviour. Record those results only after performing the corresponding operations on the supplied server.

## Administrator credential handling

The intended administrator login is `admin@convyn.cloud`. No default password is embedded in source, images or this document. The supplied chat password does not meet the current administrator CLI's 16-character minimum and has not been installed. Set a replacement `ADMIN_PASSWORD` of at least 16 characters and an enrolled `ADMIN_MFA_SECRET` through secure configuration before provisioning. Do not reuse a password posted in chat for a public deployment.
