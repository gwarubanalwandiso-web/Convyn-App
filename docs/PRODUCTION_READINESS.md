# Production readiness

**Not approved for commercial deployment.** The local core marketplace is built and tested, including web interaction and durable database records. This does not establish payment, native/mobile, operational or legal readiness.

Required launch work: verified payment/payout provider and sandbox webhooks/reconciliation; qualification document storage and external verification; email verification/recovery; MFA key management and replay controls; payment refunds and full support policy review; signed native builds/device tests; independent tenant-isolation review; backups/restore drills; public DNS/TLS validation and server-specific proxy configuration; central logging, monitoring, deployment rollback and independent security/POPIA/licensing review.

## Dependency audit

After patching Next.js, NestJS, Zod, route parsing, Multer, Sharp and PostCSS, `pnpm audit --prod` reports 0 critical, 4 high, 5 moderate and 1 low advisories in this environment's registry snapshot. Remaining high findings are deepmerge-ts in Prisma's CLI/config dependency tree, image-size in the Expo/Metro toolchain (two advisories), and decode-uri-component in Expo tooling. Moderate findings also remain. These are **not suppressed**, and `pnpm audit --prod --audit-level=high` remains a failing security gate. Compatible upstream upgrades and native regression validation are required; do not override breaking mobile dependencies blindly to hide findings.

The SQL migration runner is tested and checksum protected. Prisma's experimental JS migration CLI is not used for applying migrations; adoption of the native engine requires reviewed tooling/network configuration and ledger migration. No production environment, DNS or live payment system has been modified.

The added invoice PDFs are UNPAID service invoices, not VAT-configured tax invoices or proof of payment. Contracts/SLA targets are records, not an operational escalation engine. Mobile JavaScript exports are not store-ready signed applications. See FEATURE_COVERAGE.md for all remaining engineering scope.

Deployment packaging now includes API and standalone web images plus a Caddy edge and backup/restore tooling. Local deployment tests do not establish successful installation on an unspecified remote server or commercial acceptance. See SERVER_DEPLOYMENT.md for requirements and verification boundaries.
