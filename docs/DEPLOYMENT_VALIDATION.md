# Deployment validation — 1 November 2026

Validated in the managed cloud workspace, not on the customer's unspecified server.

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

## Outstanding target-specific requirements

The user supplied `www.convyn.cloud` and `admin@convyn.cloud`. The origin server IP/hostname, SSH username/port, Linux distribution, verified host key and working secure access remain missing. No remote package installation, public DNS mutation, server firewall modification or public certificate issuance has occurred. Administrator creation is pending secure credentials: the current CLI requires a 16+ character password and an enrolled TOTP secret. No chat password was installed or written into repository/image configuration.

The full application production gaps and four high dependency findings remain documented in `PRODUCTION_READINESS.md` and `FEATURE_COVERAGE.md`; local container success does not clear those gates.
