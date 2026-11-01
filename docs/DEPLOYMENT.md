# Deployment

Development: `pnpm install --frozen-lockfile`, `pnpm setup:local`, `pnpm build`, then `pnpm start:api` and selected web dev/start commands on ports 3000–3004. Setup preserves an existing `.env`, generates local random credentials only when absent, starts Compose services and reapplies migrations/seeding safely. A completed snapshot retains files/dependencies; processes must restart. Use the existing isolated checkout, not a new worktree.

PostGIS and Redis bind only to loopback on the host. Native engine and browser downloads are unnecessary for this environment because official JS database drivers and system Chromium are used. Package/daemon/localhost access may need the platform's approved command sandbox escalation; preserve its proxy and CA configuration.

Expo Android/iOS export tasks run as part of the monorepo build and cache public API URL environment variables. Use `EXPO_OFFLINE=1` to disable optional CLI network lookups in restricted build environments. These bundles are not signed app binaries.

Container images, a Caddy TLS proxy, private backend networks, migration tooling, backup/restore scripts and an image rollback command are now provided. The isolated Docker deployment is validated as described in SERVER_DEPLOYMENT.md. Actual server installation, public DNS/ACME issuance, production data recovery, off-site storage and monitoring remain separate requirements. Do not expose the local services or publish the marketplace commercially until PRODUCTION_READINESS.md is addressed. Do not mix the documented migration ledger with native Prisma Migrate without a reviewed baseline.

Use [SERVER_DEPLOYMENT.md](SERVER_DEPLOYMENT.md) for the step-by-step server workflow. The deployment uses same-origin `/v1` API routing, Secure refresh cookies and one trusted reverse-proxy hop. No server identity or credentials are assumed.
