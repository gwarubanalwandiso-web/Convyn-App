# Database

PostgreSQL 17 with PostGIS, accessed using Prisma 6.19.3's official JavaScript PostgreSQL adapter. The initial schema contains users, revocable sessions, provider profiles, categories, requests, bids, bookings/events, notifications, reviews and audit logs. UTC timestamptz values are used internally; South African timezone display is separate.

The SQL in `prisma/migrations/20261101000000_foundation/migration.sql` was generated with Prisma and reviewed with additional positive-money, coordinate, arrival and review constraints, booking-to-bid/request consistency, a category GIN index and a spatial expression index. Category arrays currently use application-validated IDs rather than normalized provider-service foreign keys; full coverage modelling remains pending.

## Apply migrations

Use `pnpm db:migrate`. `scripts/migrate.mjs` locks migrations with a PostgreSQL advisory lock, checks SHA-256 values of all applied SQL, rejects missing/modified applied files, and applies each new migration and its ledger record in one transaction. It records the ledger in `convyn_schema_migrations`. A second run is a no-op. Never edit an applied migration; add a new directory and SQL file.

The native engine host is not currently allowed by environment policy. Prisma's experimental JS migration runner also fails with `Column type name could not be deserialized`. Therefore **do not run `prisma migrate deploy`, `migrate dev`, or `db push` against this database**: the project deliberately uses its own ledger. Adoption of native Prisma Migrate requires a reviewed baseline and ledger transition; do not fabricate `_prisma_migrations` entries.

`prisma.config.ts` selects the JS schema engine for format, validation and schema-only diff tooling. This CLI mode is experimental; application queries use the supported JS client adapter. Generate reviewed SQL using a schema-to-schema diff after the first migration; database introspection/migration CLI paths may encounter the noted upstream bug.

Bid acceptance and booking status transitions use serializable transactions, uniqueness constraints and checked state updates. Serialization conflicts return 409 for the client to reload/retry. Reaccepting the same winning bid returns the existing booking without duplicating notifications; competing bids cannot both win.

Integration tests use local `convyn_test` with generated synthetic identities. Tests do not drop or truncate the development database. No production or remote test targets are accepted by the wrapper.

## Additive expansion migrations

`20261101010000_operations_and_organisations` adds messages, disputes, support, location consent/events, unpaid invoices, organisations/members/departments/cost centres/locations, procurement approvals and contract/SLA records. SQL triggers reject cross-tenant request/cost-centre associations, including direct database writes. Application membership/role predicates scope every tenant API read and mutation; this is not PostgreSQL row-level security.

`20261101020000_provider_scoring` adds scoring versions and auditable recommendation snapshots with bounded scores and a unique active-version constraint. Scoring configuration uses a transaction advisory lock. Serializability plus a provider-row eligibility write prevents competing requests from both reserving a single provider. Message/location writes lock the booking before state-sensitive inserts. A minute-level retention task deletes expired location observations; each observation is readable for at most two minutes or until earlier consent expiry/revocation/terminal booking state.

UNPAID invoice amounts snapshot the completed accepted quote. No migration or endpoint creates settlement, VAT, payout or refund records. Additional financial tables depend on the verified payment integration.
