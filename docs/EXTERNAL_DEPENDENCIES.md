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

MFA recovery uses existing Argon2, otplib and Prisma dependencies; no external recovery service or public reset endpoint is added.

Administrator MFA enforcement is temporarily disabled by user request. Login and initial admin creation no longer require otplib; existing optional console enrollment/recovery utilities still use it. No new dependency or external service added.

## CONVYN visual identity

Lato web WOFF2 fonts are vendored from `@fontsource/lato` 5.3.0 and native TTF fonts from `@expo-google-fonts/lato` 0.4.1, with their SIL Open Font License files. Fonts are self-hosted; there is no external browser font request. The existing resolved Expo font package 14.0.12 is now explicitly declared for both apps. Original logo PNG bytes remain pending upload; no logo CDN or new component library is introduced. See BRAND_IMPLEMENTATION.md.

## Existing-database marketplace update (2026-11-01)

The user selected the existing PostgreSQL database rather than a new Supabase project. No Supabase credentials are required. Vite, React Query, Radix/shadcn-style controls, Lucide and React Router are bundled frontend dependencies. New backend packages are nodemailer (SMTP), file-type (content inspection) and jose (Google identity verification); their patched versions are pinned in the frozen lockfile. React Router was updated to 7.18.2 for its current security fix.

Private authenticated filesystem storage is implemented and persists through the Compose uploads volume; external object storage remains unconfigured. SMTP recovery, invitations and notification delivery have passed through a local test server, but real SMTP credentials and sender configuration remain absent. Google OAuth and the optional OpenAI request helper require server secrets; their external service round trips are unverified. Missing integrations remain unavailable, with no fabricated AI result or delivery success. All credentials remain server-side.

The configured package proxy works for frozen installation and new Docker image builds. GitHub publishing uses the existing connected remote. Outbound SSH to the VPS is not granted by the current managed network policy. Existing native signing/device and payment-provider dependencies remain outstanding. Original logo uploads remain pending; approved font/style tokens are retained. See MARKETPLACE_UPDATE.md for exact variable names and deployment limits.
