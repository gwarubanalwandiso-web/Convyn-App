# Marketplace update — November 2026

The updated React 18/Vite JSX application is `apps/marketplace-web`. It uses React Router, React Query, Tailwind, Lucide and shadcn-style controls. It preserves the approved black/white CONVYN identity, Lato 400/700/900, square controls and thin borders. Original logo PNG files still need installation through the existing brand-asset installer; text fallback remains deliberate.

## Existing database and accounts

At the owner's direction, this release uses the existing PostgreSQL/PostGIS database and Nest authentication instead of provisioning Supabase/Base44. Keep the current `DATABASE_URL`; do not replace the database, delete volumes or run schema push. Twelve additive SQL migrations create a `marketplace` schema alongside the original Prisma tables. The checksum-protected migration runner applies them once. Existing user IDs, password hashes, sessions, organisations and original records remain intact.

The new nine-entity API is `/v1/marketplace/entities/:entity`; server functions are `/v1/marketplace/functions/:name`. It implements submitBid, acceptBid, completeBooking, scoreBids, suggestService, listOpportunities and reviewProviderVerification. Server-owned metadata, account scope, cents, transitions, expiry and pricing are revalidated inside transactions. A dedicated non-login role with row policies restricts entity queries. Private upload files are authenticated downloads, not public URLs.

The new dashboard, bookings, provider hub and administration expose retained requests/bookings. Original records keep their original lifecycle and invoice/conversation endpoints. Provider completed-job and review statistics include both histories. A shared database reservation prevents simultaneous active bookings across the two schemas, and suspension applies across both. Existing legacy providers must complete the new profile and its approval before quoting on new requests; legacy approval/category names are not silently interpreted as new approval. New submissions are not copied into the original tables. Business/enterprise and Expo clients retain their existing workflows and API contracts; the native screens have not been rebuilt around the new entity schema.

## Included journeys

- Public home with real categories, anonymised request ticker, provider directory, authentication, recovery and clean not-found pages.
- Customer registration, four-step request wizard, private image/video attachments, scheduled requests in South African time, optional AI assistance, scored quotes, explicit amount confirmation, atomic acceptance, booking progress, completion confirmation and reviews.
- Provider profiles, private credential documents, administrator approval, category/radius opportunities, editable/withdrawable quotes with expiry and component totals, active jobs, completion evidence and quoted earnings.
- Eleven administrator tabs: Overview, Requests, Bookings, Providers, Services, Reviews, People, Messages, Audit log, Account, Rules & fees. Includes service CRUD, verification, role changes/session revocation, email invitations, broadcasts, audit history and scoring/pricing settings.
- In-app notifications, durable optional SMTP outbox, private files, integer-cent pricing and deterministic eight-factor scoring. Earnings are quoted amounts; they do not establish collection or payout.

## Local setup and testing

Use Node 24 and pnpm 11.25.0. Existing `.env` files are preserved by `pnpm setup:local`.

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm build
pnpm start:marketplace
```

This starts the API on 4000, Vite preview on 4173 and the retained business/enterprise portals on 3003/3004. For an existing database, review/backup it first, use `pnpm db:migrate`, and rerun `scripts/provision-runtime-role.mjs` through owner tooling so runtime grants include the new schema. `prisma/contract-grants.sql` reapplies grants after a restore that omits ACLs.

Run `pnpm test:integration` for existing workflows, then `pnpm test:contract` for the new contract and `pnpm test:marketplace-web` for browser acceptance. They use separate local test databases and synthetic example.invalid accounts. The SMTP fixture accepts only local test addresses; the AI fixture exercises adapter validation without sending real customer data to an external service. Browser tests cover 375/768/1440px, the complete new booking/review journey and all administrator tabs.

`SEED_DEMO=true pnpm demo:marketplace` additionally requires a private `DEMO_PASSWORD` of at least 16 characters. It creates only a local database ending `_demo` or `_test` (default `convyn_demo`), with clearly fictional accounts/jobs. It refuses production and remote targets; it does not seed demo records into the existing application database.

## Optional integrations

Configure secret values on the server, never in chat/source/frontend variables. Root `.env.example` lists names. Deployment Compose passes them only to the API.

| Integration                                        | Required configuration                                                                           | Current limit                                                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Email recovery, invitations, notification delivery | SMTP_HOST, SMTP_PORT, SMTP_FROM, optional SMTP_USER/SMTP_PASSWORD; APP_ORIGIN                    | Local SMTP transport verified; real sender/delivery not configured. TLS required by default.                                                  |
| Google login                                       | GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, OAUTH_STATE_SECRET (32+ characters) | OAuth PKCE/state/nonce and verified identity adapter implemented; real Google project round trip unverified. Register the exact callback URL. |
| AI request suggestion                              | OPENAI_API_KEY, OPENAI_MODEL                                                                     | Validated structured adapter; missing configuration returns unavailable. Real model access/data handling not validated.                       |
| Private storage                                    | FILE_UPLOAD_ROOT; persistent uploads volume                                                      | Local private filesystem implemented; external object storage/replication not configured.                                                     |
| Payments/payouts                                   | Marketplace processor contract and separate implementation                                       | No charging, bank transfer, refund or payout integration.                                                                                     |

Use canonical `APP_ORIGIN=https://www.convyn.cloud` for production recovery/invitation links and Google callback routing. Do not set SMTP_REQUIRE_TLS=false for a public SMTP service. Keep API and upload storage backed up together. Email outbox delivery retries up to three attempts; stable message IDs reduce duplicates but do not guarantee exactly-once mail.

## Server cutover

The default Compose keeps the previous portals. To opt into the new customer/provider/admin application, use `infrastructure/deployment/compose.marketplace.yml` as the overlay with the existing environment, persistent database and volumes. Business/enterprise stay on their original applications. Review existing active jobs and the history panel before switching traffic.

From the repository root on the server:

```sh
export CONVYN_DEPLOY_OVERLAY="$PWD/infrastructure/deployment/compose.marketplace.yml"
bash infrastructure/deployment/backup.sh
bash infrastructure/deployment/deploy.sh
```

Follow SERVER_DEPLOYMENT.md for first-time host setup, DNS/TLS and secret generation. Preserve the overlay setting for subsequent deployment operations. Inspect deployment logs and verify all five domains, private upload download access, existing-account login, one complete booking and paired backup/restore before considering launch. The migration intentionally stops if historical data already contains overlapping active provider bookings; investigate and resolve those records without deleting history blindly.

The backup helper now produces paired database/upload archives and checksums. Restore validation restores SQL into an isolated database, reapplies entity grants and checks anonymous row restrictions; it validates the paired upload archive checksum/listing. It does not replace the live database or live files.

This cloud session has not deployed this release to the VPS. Outbound SSH to the supplied server is not permitted by its current network policy. Public DNS, certificates, production integrations, device behaviour and commercial launch acceptance remain separate operational checks.
