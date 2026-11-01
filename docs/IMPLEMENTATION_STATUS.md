# Implementation status

## Current marketplace update — 2026-11-01

The new React 18/Vite marketplace is implemented against the **existing PostgreSQL database and accounts**, following the owner's instruction. It retains CONVYN's monochrome/Lato branding. See [MARKETPLACE_UPDATE.md](MARKETPLACE_UPDATE.md) for scope, compatibility and cutover. The historical milestones below describe earlier releases; this section supersedes their pending status for features now implemented.

Implemented: nine exact seeded service categories; scoped nine-entity API and seven requested server functions; four-step request wizard/private media; provider profile/credential approval; line-item quotes/upsert/withdrawal/expiry; versioned eight-factor scoring; atomic amount-confirmed acceptance; lifecycle/evidence/customer closure/review; quoted commission/net earnings; all eleven admin tabs including services, account roles, invitations, broadcasts and audit; email recovery/session revocation; optional Google/AI/SMTP adapters. Private filesystem storage and database row policies are enforced. Existing history remains accessible, shared capacity prevents old/new double booking, and provider history/suspension spans both schemas. No Supabase project or replacement database was created. Admin MFA remains temporarily disabled as requested.

Verified in the current local environment: frozen installation; formatter/lint; all 23 package type checks; all nine build targets; existing domain cases plus new cents/timezone checks; 128 existing HTTP integration assertions and 120 new contract assertions plus SQL concurrency/privacy/RLS checks; all five existing and three new Chromium journeys. New browser coverage includes 375/768/1440px, a complete booking/review flow and all admin tabs. Recovery/invitations and notification delivery use a real local SMTP sink; AI adapter validation uses a local HTTP fixture. Demo seeding and repeat execution pass in a separate local `convyn_demo` database. The production web, API and tooling images build using proxy CA trust. Nine isolated container services are healthy; certificate-verified HTTPS covers the full booking/review journey and private uploads. A paired database/upload backup and isolated restore pass with 15 migration ledger entries and row-policy checks. See DEPLOYMENT_VALIDATION.md. The documented local marketplace launcher also passes readiness checks against the existing development database.

Not established: real Google consent/callback, external AI access, production SMTP deliverability, payment/payout/refund processing, public DNS/TLS or this release on the VPS, native device certification, external qualification verification, independent security/legal acceptance. Existing Expo and organisation portals retain their previous API flows; they have not been rewritten against the new entity schema. Original PNG logo bytes remain unavailable, so text fallback is retained. Dependency audit still reports four high findings in the existing Prisma/mobile toolchain; no findings are suppressed.

| Phase                 | Status      | Actual implementation                                                                                                                                                                                                                                                                                  |
| --------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 Foundation          | In Progress | Frozen pnpm workspace; five built Next portals; two API-connected Expo applications; compiled Nest API; Prisma/PostGIS schema; repeatable setup; shared UI; password login and sessions; admin MFA temporarily disabled. Email verification/recovery, social login and complete design system pending. |
| 2 Marketplace         | In Progress | Tested persistent customer registration → request → provider opportunity → bid comparison → atomic acceptance → booking. Scheduled requests and editable/publishable drafts implemented. Attachments, detailed quote line items and payment integration pending.                                       |
| 3 Provider operations | In Progress | Verification submission/admin review, availability, category/radius eligibility, single-active-booking capacity, job lifecycle, completion notes, cancellation and customer confirmation tested. Credential uploads, dispatch, teams, earnings and external verification pending.                      |
| 4 Geolocation         | In Progress | PostGIS-backed radius discovery, coordinate redaction, consent-controlled per-booking location updates and expiry/retention implemented. Map UI, geocoding, navigation and continuous tracking pending.                                                                                                |
| 5 Transactions        | In Progress | Integer pricing tested; accepted bid and pricing version persisted. Idempotent unpaid PDF service invoices and completed quoted-earnings reporting implemented. No payment, tax calculation, refund, commission or payout processing.                                                                  |
| 6 Communication       | In Progress | Persistent in-app notifications, booking conversations/read receipts, reviews, support tickets and administrator dispute resolution tested. Worker refuses external delivery without an adapter. Attachments, WebSockets, push, email and SMS pending.                                                 |
| 7 Intelligence        | In Progress | Weighted recommendations integrated into the API and bid UI, with configurable versioned weights and stored feature/component/score snapshots. Assistants, statistical forecasting and anomaly detection pending.                                                                                      |
| 8 Administration      | In Progress | Role-protected verification, operations counts, support/dispute queues, scoring controls and audit API implemented. Full finance, user-management, campaigns and integration administration pending.                                                                                                   |
| 9 Organisations       | In Progress | Business/enterprise portals now support organisations, employees, departments, locations, cost centres, purchase orders, approval decisions, per-request budgets, contract/SLA records and reports. Supplier networks, automated SLA enforcement, SSO and consolidated paid billing pending.           |
| 10 Deployment         | In Progress | Local infrastructure, tested SQL migrations, CI definition and regression tests. No production deployment, security clearance or mobile certification.                                                                                                                                                 |

## Verified in this environment

- Frozen-lockfile installation and Prisma client generation succeed.
- Prisma schema format/validation succeeds. Reviewed initial migration enables PostGIS and SQL invariants; migration application and repeat execution succeed. Seed is repeatable.
- All 22 workspace package type checks pass, including the connected mobile applications.
- Nest API, all five Next portals and both Expo applications build successfully (eight build targets). Android/iOS Hermes bundles export for both mobile apps; these are not APK/IPA/device builds.
- Nine domain cases pass for integer pricing, eligibility/scoring and lifecycle rules.
- API integration: 127 HTTP assertions plus database integrity, privacy, duplicate/replayed mutations, expired bids, competing-bid concurrency, suspension, session rotation/revocation and complete job lifecycle pass against an isolated PostgreSQL database.
- Chromium E2E: three journeys pass across all five portals: customer/provider/admin booking, advisory ranking, messaging, invoice download and support; plus separate business and enterprise procurement flows.
- Lint and formatter checks pass. GitHub-hosted CI itself has not run.

## Environment diagnosis

The configured HTTP proxy is reachable outside the command sandbox. Use supported escalation for network/service commands; no credentials or TLS exceptions are needed. Native Prisma downloads are still denied by policy, so client execution uses Prisma's official JavaScript PostgreSQL adapter. Prisma 6's experimental JS migration engine fails on PostgreSQL `name` columns; use the documented checksum-protected SQL runner rather than native `prisma migrate deploy`. See DATABASE.md.
System Chromium runs Playwright successfully. Downloading Playwright's bundled Chromium is separately policy blocked and unnecessary here.

## Next tasks

1. Resolve the remaining dependency security findings with compatible upstream upgrades; audit is not passing.
2. Add email verification/recovery delivery, protected verification-document storage, MFA secret encryption and stronger account administration.
3. Add detailed bid items, protected uploads, real-time events, search/filtering and complete administrative modules.
4. Verify a South African marketplace payment/payout provider contract and sandbox integration before collecting money.
5. Device-test mobile permissions, SecureStore and end-to-end workflows; complete remaining native screens and enterprise procurement/SLA features.
6. Complete production operational, legal, security, backup and restore verification before launch.

## Expansion milestone

Three additive migrations preserve prior history and data. New database constraints cover monetary/coordinate values and cross-organisation procurement consistency. Message submission is idempotent; tracking writes lock booking state against concurrent cancellation/revocation. Expired GPS records are purged every minute. Invoices remain UNPAID and dispute decisions never imply a refund. See FEATURE_COVERAGE.md for explicit remaining scope.

## Server deployment package

Container API/standalone web images, Caddy HTTPS routing, private PostGIS/Redis networks, a restricted runtime database role, migration/reference-data tooling, host installation/preflight scripts, backup/restore checks and rollback image selection are provided. The isolated deployment passed 34 certificate-verified HTTPS assertions and a three-migration restore test. See SERVER_DEPLOYMENT.md and DEPLOYMENT_VALIDATION.md for steps, cached-artifact download-outage limits and required server access. Requested defaults: customer site www.convyn.cloud and administrator admin@convyn.cloud. No remote server or default administrator password has been installed.

## Host firewall helper

Added preview-first UFW allow/deny/web/enable/status commands with validated ports and SSH deny protection. Verified argument rejection, command ordering with a mocked UFW, and Bash syntax; no live firewall or remote changes applied. Docker and provider firewall limitations are documented in SERVER_DEPLOYMENT.md.

Added `firewall.sh setup` for automatic apt-based UFW installation, SSH/80/443 rules, deny-incoming/allow-outgoing defaults and activation. Tested with mocked commands; actual remote firewall remains unverified.

Added console-only administrator MFA recovery requiring the current password and a valid code from the replacement key; replacement and session revocation are atomic. Syntax and mocked rejection/success checks passed; remote recovery has not been executed.

## Temporary password-only administrator authentication

At the user’s request, administrator login no longer enforces TOTP. Removed the authenticator field from the shared portal and the MFA requirement from administrator provisioning. Existing keys remain stored for later re-enrollment work. Password checks, role/tenant guards and session handling remain enforced. Remote deployment still requires VPS access.

Validation for password-only admin change: API build, all 22 package type checks, ESLint, and 128 HTTP integration assertions plus database/concurrency/privacy checks pass. Tests cover existing enrolled admins, admins without a key, and rejection of an incorrect admin password.

## CONVYN identity and layout milestone

Applied a shared black/white editorial system to customer, provider, admin, business and enterprise portals, including split authentication, workspace header/sidebar, mobile tabs, live metrics, outlined statuses, table registers, empty states and branded not-found pages. Existing marketplace, organisation, auth and permission behavior is retained. Both Expo apps use matching monochrome controls, opaque brand placement and bundled Lato 400/700/900. Web fonts use Next’s local optimization; font licenses are included.

Verified: frozen-lockfile installation with supply-chain checks, all 22 package type checks, formatter/format check, ESLint, nine domain cases in two test files, 128 API HTTP assertions plus integrity/concurrency/privacy checks, and all five Chromium tests. Browser checks cover public and authenticated roots in all five portals at 390/768/1440px, branded 404s, keyboard skip links, overflow, navigation targets, and existing booking/messaging/PDF/support plus business/enterprise procurement journeys. All eight production build targets pass; both native apps export Android and iOS Hermes bundles with their local fonts. Native device behavior has not been tested. Docker’s web runtime now includes public assets; fresh container image/HTTPS validation of this visual milestone has not been run.

Original app-icon/wordmark images are visible in chat but their downloadable PNG bytes are not available in the workspace. Logo components deliberately use plain text until those files arrive. `scripts/install-brand-assets.mjs` installs the four originals unchanged across all portals, Next favicon/apple icons and both native app icons; original-image loading verification remains pending. No watermark, gradients, non-neutral accents, shadows, low-opacity logos or unintended rounded corners were found in the source audit. See BRAND_IMPLEMENTATION.md for changed components, workflow coverage, asset installation and remaining limits. These changes have not been deployed to the VPS.
