# CONVYN

South African on-demand services marketplace. The core **development** marketplace is operational and tested; commercial deployment is not approved.

## Start locally

Requirements: Node 24 LTS, pnpm 11.25.0, Docker with Compose, and available ports 3000–3004, 4000, 5432 and 6379.

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm build
pnpm start:stack
```

`start:stack` manages the built API and all five portals in one terminal and shuts down only its own processes. Stop it before running browser tests. For individual services or editing, run `pnpm start:api` and, in separate terminals, run `pnpm --filter @convyn/customer-web dev`, `pnpm --filter @convyn/provider-web dev` and `pnpm --filter @convyn/admin-web dev`. Their ports are 3000, 3001 and 3002. Business and enterprise portals use 3003 and 3004, with tenant-scoped locations, employees, cost centres, procurement approvals, contract/SLA records and reports. For built portals use `pnpm --filter @convyn/customer-web exec next start -p 3000` and equivalent commands for the other roles.

`setup:local` creates a private ignored `.env` with randomly generated development database credentials **only if absent**, starts PostGIS and Redis, generates the Prisma client, applies migrations and seeds categories. Existing environment files and application records are preserved. Review `.env.example` when supplying your own settings.

Register customer/provider accounts through their respective portals. Providers submit qualification details, an administrator reviews them, and approved providers can go online and bid. The customer compares bids and accepts one. The provider advances the job, supplies a completion note, and the customer confirms and reviews it. Online payment is not collected. Qualification documents and external checks are not yet integrated.

There is no public administrator registration. Supply `ADMIN_EMAIL`, a 16+ character `ADMIN_PASSWORD`, and a base32 `ADMIN_MFA_SECRET` through secure environment variables, then run `pnpm admin:create`. Enrol the same TOTP secret in your authenticator securely; no credentials are printed. Administrator login requires its current code. Production encryption/key management for MFA secrets remains pending.

API: `/v1/health`, `/v1/ready`, `/docs` and `/docs-json`. See docs/API.md. Access tokens remain in browser memory; refresh tokens use an HttpOnly SameSite cookie. Tokens expire and can be rotated/revoked through the API; the portal currently requires sign-in again after reload or access expiry.

## Checks

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:integration
pnpm test:web
```

Integration tests create and retain a local `convyn_test` database and require a local database URL; they refuse production or remote database targets. API tests start a separate API on port 4019. Browser tests start their own API on 4000 and three built portals; those ports must be free. They use the installed Chromium at `/usr/bin/chromium`, configurable with `CHROMIUM_PATH`. Alternatively install Playwright Chromium and run `USE_PLAYWRIGHT_BROWSER=1 pnpm test:web`. Run integration tests before browser tests to prepare their database. Browser tests now start all five portals on 3000–3004. Synthetic test users are unique per run and retained for inspection.

`pnpm audit --prod --audit-level=high` currently fails on known Prisma/mobile toolchain dependencies; see docs/PRODUCTION_READINESS.md. Passing application tests does not clear that gate.

Mobile: `pnpm --filter @convyn/customer-mobile dev` and the provider equivalent start real API-connected Expo screens. The apps support registration/login, requests/opportunities, quoting, bookings/statuses/reviews, conversations, support, provider verification/availability and authorised device GPS updates. Access tokens use SecureStore; sign in again after expiry. Set `EXPO_PUBLIC_API_URL` before bundling for a physical device; emulator defaults are Android `10.0.2.2:4000` and iOS simulator localhost. Never put secret values in public Expo variables.

`EXPO_OFFLINE=1 pnpm build` also exports Android/iOS Hermes bundles to each mobile app's ignored `dist/native` directory. These outputs validate JavaScript bundling, not device behaviour or signed APK/IPA distribution. Location/SecureStore/device interaction still needs real emulator/device testing.

In managed cloud execution, commands needing package access, Docker or local service connections may require the supported command sandbox escalation. The configured proxy works outside that command sandbox; do not unset it or disable TLS checks.

See docs/IMPLEMENTATION_STATUS.md for scope and continuation.

## Operational additions

Booking tools provide conversations, support/disputes, cancellation, consent-controlled short-lived GPS observations and downloadable unpaid PDF service invoices. Provider recommendations are advisory weighted scores with versioned, audited feature snapshots. Admins can adjust weights; missing history is disclosed, and no score selects or pays a provider. See docs/FEATURE_COVERAGE.md for the exact remaining scope.

## Server deployment

Follow [the server installation and deployment guide](docs/SERVER_DEPLOYMENT.md). It includes Ubuntu host requirements, private environment generation, Docker images, all five portal domains, automatic TLS configuration, migrations, health checks, administrator provisioning, backups and isolated restore tests. The implementation remains a staging application; server access, public DNS/certificates and production acceptance must be verified separately.
