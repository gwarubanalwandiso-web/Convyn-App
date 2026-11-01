# Implementation status

| Phase                 | Status      | Actual implementation                                                                                                                                                                                                                                                                        |
| --------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Foundation          | In Progress | Frozen pnpm workspace; five built Next portals; two API-connected Expo applications; compiled Nest API; Prisma/PostGIS schema; repeatable setup; shared UI; password login, sessions and admin MFA. Email verification/recovery, social login and complete design system pending.            |
| 2 Marketplace         | In Progress | Tested persistent customer registration → request → provider opportunity → bid comparison → atomic acceptance → booking. Scheduled requests and editable/publishable drafts implemented. Attachments, detailed quote line items and payment integration pending.                             |
| 3 Provider operations | In Progress | Verification submission/admin review, availability, category/radius eligibility, single-active-booking capacity, job lifecycle, completion notes, cancellation and customer confirmation tested. Credential uploads, dispatch, teams, earnings and external verification pending.            |
| 4 Geolocation         | In Progress | PostGIS-backed radius discovery, coordinate redaction, consent-controlled per-booking location updates and expiry/retention implemented. Map UI, geocoding, navigation and continuous tracking pending.                                                                                      |
| 5 Transactions        | In Progress | Integer pricing tested; accepted bid and pricing version persisted. Idempotent unpaid PDF service invoices and completed quoted-earnings reporting implemented. No payment, tax calculation, refund, commission or payout processing.                                                        |
| 6 Communication       | In Progress | Persistent in-app notifications, booking conversations/read receipts, reviews, support tickets and administrator dispute resolution tested. Worker refuses external delivery without an adapter. Attachments, WebSockets, push, email and SMS pending.                                       |
| 7 Intelligence        | In Progress | Weighted recommendations integrated into the API and bid UI, with configurable versioned weights and stored feature/component/score snapshots. Assistants, statistical forecasting and anomaly detection pending.                                                                            |
| 8 Administration      | In Progress | MFA-protected verification, operations counts, support/dispute queues, scoring controls and audit API implemented. Full finance, user-management, campaigns and integration administration pending.                                                                                          |
| 9 Organisations       | In Progress | Business/enterprise portals now support organisations, employees, departments, locations, cost centres, purchase orders, approval decisions, per-request budgets, contract/SLA records and reports. Supplier networks, automated SLA enforcement, SSO and consolidated paid billing pending. |
| 10 Deployment         | In Progress | Local infrastructure, tested SQL migrations, CI definition and regression tests. No production deployment, security clearance or mobile certification.                                                                                                                                       |

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
