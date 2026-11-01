# CONVYN visual identity

The five Next portals share `packages/ui/src/brand.css`, reusable brand components, authentication/workspace shells, metrics, outlined status labels, empty states and a responsive table primitive. Existing routes and role-specific request, booking, messaging, invoice, support, admin and procurement controls are preserved. No API, permission or database behavior changes in this milestone. Administrator login remains password-only as previously requested.

## Typography and assets

Lato 400/700/900 is bundled locally: Next uses `next/font/local` with licensed WOFF2 files; both Expo apps use `expo-font` and licensed TTF files. No runtime font CDN is required. Sources: `@fontsource/lato` 5.3.0 and `@expo-google-fonts/lato` 0.4.1. License files are alongside each font set. Expo font loading uses the already-resolved `expo-font` 14.0.12, now an explicit dependency.

The four supplied images are visible in conversation, but their original downloadable bytes have not been made available to the executor. Do not reconstruct them from screenshots, generate substitutes, crop their canvases or apply effects. Until the original files are installed, brand components render plain CONVYN text rather than broken image links. Favicon/app icon and original-logo loading verification remain pending.

Place the original files in a private temporary directory using these names:

- `convyn-wordmark-solid.png`
- `convyn-wordmark-outline.png`
- `convyn-mark-black.png`
- `convyn-mark-white.png`

Then run:

```sh
node scripts/install-brand-assets.mjs /path/to/original-pngs
pnpm format
EXPO_OFFLINE=1 pnpm build --concurrency=2
```

The installer validates PNG headers, copies the originals byte-for-byte to all five public brand directories, installs Next icon/apple-icon files and both Expo app icons, and enables the web/native asset manifests. It changes no image pixels. The solid white wordmark appears on black headers/authentication panels; compact marks appear only as opaque interface elements. Outline is available as an explicit secondary variant. No logo is a background, watermark or low-opacity overlay. The Docker web runtime now copies the public directory so installed originals survive container deployment.

## Route and workflow coverage

Each portal currently has one `/` application route with authentication and role-scoped workflow sections, plus a branded not-found screen. No existing routes are removed or renamed. Sidebar links navigate to actual sections and become horizontally scrollable navigation on mobile.

- Customer: sign-in/registration, requests, drafts, quote comparison, bookings/lifecycle, messaging, invoice download, reviews, support and notifications.
- Provider: sign-in/registration, verification/availability, eligible opportunities, bidding, booking progress, earnings, messaging, support and notifications.
- Admin: sign-in, provider approvals, operations metrics, scoring configuration, support/dispute queues and notifications.
- Business/enterprise: sign-in, organisation selection/creation, employees, departments, locations, cost centres, procurement/approvals, contracts/SLAs, reports, support and notifications. Section empty states preserve navigation when no organisation is selected.
- Both native apps retain their API-connected screens, SecureStore sessions and location controls, with sharp monochrome controls, bundled Lato, and scrollable navigation.

Metrics use fetched account or organisation data; no synthetic business figures are displayed. Integration limitations remain visible where they affect a workflow (for example unpaid invoices).

## Validation

See the implementation-status milestone for final results. Browser checks cover public and signed-in roots at 390, 768 and 1440 pixels, navigation targets, keyboard skip links, sharp inputs, font family, overflow and available image loading. Existing booking and business/enterprise procurement journeys run against an isolated database. Native export is not device certification. Public VPS deployment is not verified by these local checks.

## Changed files by area

- Each `apps/{customer,provider,admin,business,enterprise}-web/app/`: shared stylesheet import, font/metadata layout, root page, and new branded `not-found.tsx`; public brand directories prepared for originals.
- `packages/ui/src/`: new `brand.tsx`, asset manifest, `brand.css`, `shell.tsx`, `empty-state.tsx`, `record-table.tsx`, and `not-found.tsx`; existing marketplace/organisation/admin/support components use the shared layouts and primitives.
- `packages/design-tokens/`: monochrome/zero-radius/Lato tokens and licensed web font files.
- `packages/mobile-ui/`: shared native controls, font loader, asset manifest, licensed TTF files and explicit Expo font peer dependency.
- Both native apps: branded app names, root typography providers and explicit Expo font dependencies; lockfile updated without changing the already-resolved font version.
- `infrastructure/docker/Dockerfile`: copy web public assets into runtime images.
- `scripts/install-brand-assets.mjs`: original-file installation, metadata icons, native icons and manifests.
- `tests/e2e/branding.spec.ts`: all-portal public/authenticated responsive checks; existing marketplace test now checks hidden empty alerts without weakening lifecycle assertions.
- `docs/IMPLEMENTATION_STATUS.md`, `docs/EXTERNAL_DEPENDENCIES.md` and this document: coverage, licenses, verification and remaining asset/deployment limits.

Final checks passed: 22 package type checks, formatter, ESLint, domain tests, 128 API assertions with integrity/concurrency/privacy checks, all five browser tests, five web/API builds and both Android/iOS native exports. Desktop and mobile screenshots were visually reviewed. Original logo/icon loading and fresh branded container/VPS deployment remain unverified.
