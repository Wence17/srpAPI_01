# =============================================================================
# Sub2API Next.js Web (apps/web) — production standalone image
# =============================================================================
# Build from repository root:
#   docker build -f apps/web/Dockerfile --build-arg BACKEND_URL=http://sub2api:8080 .
# =============================================================================

ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS builder

WORKDIR /app

# Monorepo root + web workspace
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci -w apps/web --include=dev

COPY apps/web apps/web

ARG BACKEND_URL=http://sub2api:8080
ENV BACKEND_URL=${BACKEND_URL}

RUN npm run build -w apps/web

FROM ${NODE_IMAGE} AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1000 sub2web && adduser -u 1000 -G sub2web -s /bin/sh -D sub2web

COPY --from=builder --chown=sub2web:sub2web /app/apps/web/.next/standalone ./
COPY --from=builder --chown=sub2web:sub2web /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=sub2web:sub2web /app/apps/web/public ./apps/web/public

USER sub2web

EXPOSE 3000

# Rewrites read BACKEND_URL when the Next server starts
ENV BACKEND_URL=http://sub2api:8080

CMD ["node", "apps/web/server.js"]
