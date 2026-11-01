# BuildKit secret mounts use the Docker daemon's bundled frontend.
FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*

FROM base AS build
# Proxy trust is supplied only for networked RUN steps; no session certificate is baked into an image.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json prisma.config.ts eslint.config.mjs ./
COPY apps ./apps
COPY packages ./packages
COPY prisma ./prisma
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    pnpm install --frozen-lockfile
# Generation and web compilation do not connect to this non-secret build-only URL.
ENV DATABASE_URL=postgresql://convyn_build:unused@127.0.0.1:5432/convyn_build
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN pnpm db:generate && pnpm exec turbo build --filter='@convyn/*-web' --filter=@convyn/api --concurrency=2
FROM build AS api-bundle
COPY infrastructure/docker/copy-prisma-client.mjs ./infrastructure/docker/
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    pnpm --filter @convyn/api deploy --prod --legacy /output/api && \
    node infrastructure/docker/copy-prisma-client.mjs /output/api

FROM base AS api
ENV NODE_ENV=production PORT=4000
COPY --from=api-bundle --chown=node:node /output/api/ ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
 CMD node -e "fetch('http://127.0.0.1:4000/v1/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]

FROM base AS web
ARG WEB_APP=customer-web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 WEB_APP=${WEB_APP}
COPY --from=build --chown=node:node /app/apps/${WEB_APP}/.next/standalone/ ./
COPY --from=build --chown=node:node /app/apps/${WEB_APP}/.next/static/ ./apps/${WEB_APP}/.next/static/
COPY --chown=node:node infrastructure/docker/start-web.mjs ./start-web.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
 CMD node -e "fetch('http://127.0.0.1:3000').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "start-web.mjs"]

FROM base AS tools
# Batch-only tooling image; not an externally exposed server.
COPY --from=build --chown=node:node /app/ ./
COPY --chown=node:node scripts/migrate.mjs scripts/seed-categories.mjs scripts/create-admin.mjs scripts/reset-admin-mfa.mjs scripts/provision-runtime-role.mjs ./scripts/
ENV NODE_ENV=production
USER node
CMD ["node", "scripts/migrate.mjs"]
