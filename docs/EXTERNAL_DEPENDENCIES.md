# External dependency register

| Dependency                | Requirement                                                       | State                                                                                       |
| ------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Package registry / GitHub | Use configured proxy with command sandbox escalation where needed | Package installation and frozen repeat install pass; remote Git write not exercised         |
| Prisma native engines     | binaries.prisma.sh network setting if native tooling is adopted   | Not required by the current JS client/SQL runner workflow; native host still denied         |
| PostgreSQL / PostGIS      | Local Compose service                                             | Healthy; migration, seed and real API integration pass                                      |
| Redis                     | Local Compose service                                             | Healthy; external-delivery worker remains unconfigured                                      |
| Chromium                  | Installed executable or Playwright download policy                | System Chromium E2E passes; bundled download host is denied                                 |
| Approved CONVYN identity  | Approved logo and exact tokens                                    | Missing; labelled text placeholder only                                                     |
| Google Maps               | Restricted project keys, billing and consent                      | Not configured                                                                              |
| Payment processor         | Marketplace/payout capability and contract review                 | Not selected; no payment collection                                                         |
| Object storage            | Private bucket, credentials and signed URL policy                 | Not configured                                                                              |
| Email / SMS / push        | Provider accounts and sender approval                             | Not configured; in-app notifications and conversations persist locally                      |
| Google / Apple auth       | Registered OAuth applications                                     | Not configured                                                                              |
| AI provider               | Credentials and data handling validation                          | Not configured                                                                              |
| Mobile distribution       | Apple/Google accounts, development builds and devices             | Not configured; API-connected Android/iOS bundles export; device/signing validation pending |
| Commercial launch         | Security, POPIA, licensing, payments and operations review        | Outstanding                                                                                 |

Never record credential values in this register or source control.

## Host firewall management

Optional Ubuntu `ufw` package, installed through signed OS repositories on the server. `infrastructure/deployment/firewall.sh` uses its CLI without adding a network service. Docker-published ports and hosting-provider firewall rules require separate management. No new npm dependency.

The firewall `setup` command installs UFW through the server’s configured apt repositories if missing. It requires root, network access to those repositories and provider-console recovery access before activation; it does not configure the provider firewall.
