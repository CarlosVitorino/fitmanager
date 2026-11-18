# syntax=docker/dockerfile:1.7
#
# One file, two images.
#   web   the Astro server: the built bundle and production dependencies only.
#   jobs  migrations and the settle sidecar. They run TypeScript from scripts/ with tsx, so this image
#         keeps the sources, the migrations folder and the full dependency tree.
#
#   docker build --target web  -t fitmanager-web  .
#   docker build --target jobs -t fitmanager-jobs .

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
ENV CI=true

# Manifests first, so a source change does not reinstall every dependency.
FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --no-audit --no-fund

FROM deps AS build
# The public hostname Astro trusts X-Forwarded-Proto for (astro.config.mjs). Build-time only.
ARG PUBLIC_HOSTNAME=fit.huntingapps.io
ENV PUBLIC_HOSTNAME=${PUBLIC_HOSTNAME}
COPY . .
RUN npm run build

# ---------------------------------------------------------------- web
FROM node:${NODE_VERSION}-bookworm-slim AS web
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321
WORKDIR /app
# Root-owned on purpose: the server writes nothing to disk, so `node` only gets read access.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/login').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/server/entry.mjs"]

# ---------------------------------------------------------------- jobs
FROM deps AS jobs
ENV NODE_ENV=production
COPY . .
USER node
CMD ["node_modules/.bin/tsx", "scripts/settle.ts"]
