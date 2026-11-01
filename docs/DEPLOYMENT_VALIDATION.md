# Deployment validation — 1 November 2026

Validated in the managed cloud workspace. The supplied VPS has not been accessed or updated.

| Check                                 | Result                                                                                                                                                                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host Docker / Compose                 | Docker 28.4.0 and Compose 2.40.3 available                                                                                                                                                                                                |
| Host requirement/config preflight     | Pass against the workspace; Ubuntu bootstrap syntax checked, not run on a remote Ubuntu host                                                                                                                                              |
| Container images                      | API, five standalone Next portals and batch tooling built; Node 24.22.2 runtime                                                                                                                                                           |
| Runtime                               | Nine isolated services healthy; API/web run as non-root with private backend ports                                                                                                                                                        |
| API database privileges               | `convyn_app` is not superuser and cannot create databases/roles or read the migration ledger; booking reads/writes work                                                                                                                   |
| Actual server Caddy configuration     | Native Caddy validation passed; public ACME issuance not attempted                                                                                                                                                                        |
| Local HTTPS and application behaviour | 34 curl assertions passed with explicit trust in the generated test CA; all five portal pages, Secure/HttpOnly/SameSite cookies, MFA, provider review, quoting, matching, acceptance, messages, fulfilment, review and unpaid PDF invoice |
| Same-origin browser API build         | No development `localhost:4000` fallback remains in the compiled customer chunks                                                                                                                                                          |
| Repeat deployment                     | Pass using existing images, pre-migration backup, all three migration checksums, category seed and restricted-role provisioning                                                                                                           |
| Backup and restoration                | Custom-format dump and portable SHA-256 generated; restored into a unique temporary database; three migrations/PostGIS verified; only temporary database removed                                                                          |
| Rollback command                      | Image-selection/health mechanics exercised using a same-binary previous-tag alias; cross-version database compatibility is release-specific and not established by this test                                                              |
| Source checks                         | Formatting, lint, workspace type checks and shell syntax checked; see current task results                                                                                                                                                |

## Download outage and cached artifact use

After the initial images were built, the managed package proxy began returning HTTP 503 with an upstream connection error for new registry requests. A fresh final tooling-image rebuild could not complete its download phase. To finish isolated runtime validation without weakening TLS/signature/checksum checks, the unchanged, already-verified dependency image was reused and the repository's new runtime-role provisioner copied into that local tooling image. This is not evidence of a successful clean build against the unavailable registry. Rebuild the complete images from the final checkout when package access is restored or on the supplied server with working registry access.

Docker Hub frontend lookup was also transiently unavailable; the Dockerfile now uses the Docker daemon's bundled BuildKit frontend. Proxy CA certificates are mounted only for networked build steps and are not included in runtime images. Docker-internal routing bypasses the external proxy only for explicitly named local services; the loopback health probe clears proxy variables for that single local request.

## Marketplace update validation

The new marketplace web, API and batch-tooling images built successfully through the managed proxy with CA verification. An isolated `convyn_marketplace_test` Compose project uses separate database, uploads and Caddy volumes and loopback HTTPS port 19443. All nine services became healthy. The API runs as non-root with the restricted `convyn_app` database login; entity operations switch to the row-scoped contract role.

The certificate-verified container journey passed 27 assertions through all five HTTPS hostnames, public deep links, customer/provider registration, administrator provisioning/approval, private PNG upload/download, unauthorized file denial, file persistence after an API restart, quoting, integer commission/payout, acceptance, fulfilment, customer closure and review. The test is `tests/integration/deployment-contract.mjs`; it intentionally requires the isolated project environment, test overlay and trusted local Caddy CA under the ignored deployment `.runtime` directory. It must never target a public production host.

Paired SQL/upload backup succeeded. SQL restored into a temporary database with all **15** migration ledger entries; the restore helper reapplied contract grants and verified anonymous request visibility is zero. The paired private-upload archive checksum and listing passed. This validates the helper's current scope; full file extraction/cross-region disaster recovery is not established. Live database and files were untouched by the restore test.

Disposable Docker build cache was cleared after the workspace filled during the first isolated migration attempt. Retrying the transactional migration succeeded without deleting database volumes. Allow adequate space for Docker's storage driver, all images, database growth and backups; the nominal 12 GiB build minimum is insufficient for multiple complete VFS test deployments.

## Outstanding target-specific requirements

The user supplied the server address and administrator account details earlier. The managed environment's current TCP policy grants no outbound SSH destinations, so server access remains blocked. No remote package installation, public DNS mutation, server firewall modification or public certificate issuance has occurred. Administrator provisioning requires a private 16+ character password; MFA enforcement remains temporarily disabled at the owner's request. No chat password was installed or committed.

The full application production gaps and four high dependency findings remain documented in `PRODUCTION_READINESS.md` and `FEATURE_COVERAGE.md`; local container success does not clear those gates.
