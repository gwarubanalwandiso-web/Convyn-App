# API

REST prefix `/v1`; OpenAPI is generated at `/docs` and `/docs-json`. The generated document lists routes; detailed Zod payload schemas still need to be added to OpenAPI and used for generated clients. Protected routes require an opaque bearer access token. BigInt monetary values serialize as decimal strings in minor currency units.

| Routes                                                                      | Access / purpose                                                                          |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| GET health, ready                                                           | Liveness and PostgreSQL readiness                                                         |
| POST auth/register, auth/login                                              | Customer/provider registration; passwords hashed with Argon2id; admin login requires TOTP |
| POST auth/refresh                                                           | HttpOnly refresh cookie and `X-Convyn-Client: 1`; atomic token rotation                   |
| GET auth/me; POST auth/logout, auth/revoke-all                              | Session identity and revocation                                                           |
| GET categories, notifications                                               | Authenticated categories and own notification feed                                        |
| GET providers/me; POST providers/verification; PATCH providers/availability | Provider-scoped profile, review submission and approved availability                      |
| GET admin/verifications; POST admin/verifications/:id                       | Administrator verification queue and guarded review transitions                           |
| POST/GET service-requests                                                   | Customer publication and own requests                                                     |
| GET opportunities                                                           | Approved, available provider; category/radius filtered and exact coordinates redacted     |
| POST service-requests/:id/bids                                              | Eligible provider submits price, arrival, comments and expiry                             |
| GET service-requests/:id/bids                                               | Owning customer compares valid bids                                                       |
| POST bids/:id/accept                                                        | Owning customer atomically accepts one eligible bid                                       |
| GET bookings                                                                | Own customer/provider bookings and permitted details                                      |
| POST bookings/:id/status                                                    | Assigned provider fulfils; owning customer confirms completion                            |
| POST bookings/:id/reviews                                                   | Owning customer reviews a completed booking once                                          |
| GET admin/audit                                                             | Administrator-only acceptance/verification audit records                                  |

Zod rejects malformed and unknown mutation fields. Authentication endpoints allow ten requests per route per minute; other routes allow 120. Limits are per-process and need shared production enforcement. Lists currently cap at 100, without cursor pagination. Errors use Nest's statusCode/message envelope; inaccessible resource IDs return 404. Payments are not integrated and no endpoint can manufacture a payment confirmation.

Browser access tokens are held in memory. The refresh cookie is HttpOnly, SameSite Strict, Secure in production and restricted to `/v1/auth`. CORS allows the configured portal origins. UI session restoration and automatic refresh are pending; users sign in again after expiry/reload.

## Operational and organisation routes

All inherit the bearer-session guard. UUIDs, fields, party ownership and organisation membership/roles are checked server-side.

| Routes                                                                                         | Scope                                                                                                                            |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| POST service-request-drafts; PATCH service-requests/:id; POST service-requests/:id/publish     | Owning customer; only unpublished individual drafts can be edited/published                                                      |
| PATCH bids/:id; POST bids/:id/withdraw                                                         | Owning provider; unaccepted request only                                                                                         |
| POST bookings/:id/cancel                                                                       | Booking parties before work starts; persists reason/events, clears location data                                                 |
| GET/POST bookings/:id/messages; POST bookings/:id/messages/read                                | Booking parties; idempotency via sender/client UUID; cancelled conversations read-only                                           |
| GET/POST bookings/:id/dispute                                                                  | Booking parties; one case per booking                                                                                            |
| GET/POST support                                                                               | Own support tickets                                                                                                              |
| GET admin/support, admin/disputes, admin/dashboard; POST admin/support/:id, admin/disputes/:id | Privileged operations with audit/notifications; no implied payment action                                                        |
| POST notifications/:id/read                                                                    | Own notification                                                                                                                 |
| POST bookings/:id/tracking-consent, bookings/:id/location; GET bookings/:id/location           | Assigned provider grants/revokes consent and submits observations; only booking parties can read current authorised observations |
| POST bookings/:id/invoice; GET invoices/:id/pdf                                                | Parties to completed booking; idempotent UNPAID invoice, binary PDF response                                                     |
| GET providers/earnings                                                                         | Own completed quoted amounts; actual paid amount is null because payouts are not integrated                                      |
| GET/POST organisations; GET organisations/:id                                                  | Own memberships; customer creates owner membership                                                                               |
| POST organisations/:id/members, departments, cost-centres, locations, contracts                | Organisation OWNER/ADMIN; only OWNER grants elevated roles                                                                       |
| GET/POST organisations/:id/requests                                                            | Members; procurement is unpublished until approval                                                                               |
| POST organisations/:id/approvals/:approvalId                                                   | OWNER/ADMIN/APPROVER; approval must belong to that organisation; only PENDING can be decided                                     |
| GET organisations/:id/report                                                                   | OWNER/ADMIN/APPROVER; scoped budgets and unpaid invoice totals                                                                   |
| GET/POST admin/scoring                                                                         | Administrator; complete eight-dimensional weights total 100 and create immutable rule versions                                   |
| GET service-requests/:id/recommendations                                                       | Owning customer; valid bidders ranked with disclosed actual evidence, snapshots persisted                                        |

An organisation bid cannot be accepted above its approved request budget. Providers are limited to one active booking in the initial individual-provider implementation. Contracts currently record terms, dates, response targets and escalation address; automated SLA enforcement is not implemented. Opportunity spatial/radius filtering now runs in PostGIS before the 100-record limit. No cursor pagination or WebSocket transport exists yet.
