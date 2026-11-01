# Architecture

A pnpm/Turbo monorepo contains five Next portals, two API-connected Expo applications, NestJS API, an optional BullMQ worker and shared packages. Customer/provider/admin portals share real account and marketplace components. Business/enterprise portals now provide tenant-scoped procurement, employee/department/location/cost-centre management, contract/SLA records and budget reporting.

Nest enforces role and resource ownership; PostgreSQL is durable state. API mutations validate unknown fields with Zod. Serializable transactions and database uniqueness enforce one booking per request; updates use explicit lifecycle transitions. Customer completion is distinct from provider completion. Payment settlement is not inferred from bookings.

Prisma uses the official JS PostgreSQL adapter to avoid native engine downloads. Generated SQL is applied by a documented transactional, advisory-locked checksum runner because Prisma 6's experimental migration adapter fails on a PostgreSQL metadata type. A reviewed ledger transition is necessary before adopting native Prisma Migrate.

The provider feed filters category, open state and radius using PostGIS before limiting results to 100. Cursor pagination remains pending. Notifications and conversation messages persist in PostgreSQL. External delivery and WebSockets are pending; clients refresh durable state explicitly.

Design placeholders are labelled and configurable. Shared pricing uses BigInt internally and safe integer boundaries. Matching is explainable deterministic scoring, integrated with the API, persisted snapshots and admin-versioned weights; it is not an operational LLM service. Incomplete integrations never simulate payments, location tracking or sent messages.
