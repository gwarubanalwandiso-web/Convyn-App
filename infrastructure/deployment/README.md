# CONVYN server deployment

Follow [the step-by-step guide](../../docs/SERVER_DEPLOYMENT.md). Host requirements are installed with `bootstrap-ubuntu.sh`; `init-env.sh` creates private configuration; `deploy.sh` builds and starts the stack; `smoke-test.sh` verifies public TLS and dependencies; `backup.sh` and `restore-test.sh` verify database recovery.

`compose.local-test.yml` and `Caddyfile.local-test` are isolated validation fixtures, not public-server configuration. They issue test certificates using Caddy's internal CA; validation explicitly trusts that generated public CA certificate. Production uses `compose.yml` and `Caddyfile` with public ACME certificates.

Do not commit `.env`, `.runtime`, backups, private keys or certificates. No server address, SSH identity or production credentials are stored here.
