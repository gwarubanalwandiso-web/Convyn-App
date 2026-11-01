# CONVYN engineering conventions

Use this isolated checkout directly; do not create worktrees unless requested.
Node 24 LTS, pnpm 11.25.0, strict TypeScript. Shared packages own domain logic.
Commands: pnpm install; pnpm test; pnpm lint; pnpm typecheck; pnpm build.
Never claim unrun checks passed. See docs/IMPLEMENTATION_STATUS.md before work.
Never commit secrets. Enforce authorization and tenant scope server-side before adding business endpoints. Use integer minor units for money. Payment redirects never establish success. Missing integrations stay disabled.
Migrations must be generated, reviewed and tested against PostgreSQL before database features are marked tested. Do not use schema push in production.
Update implementation status and external dependency register after each milestone.
