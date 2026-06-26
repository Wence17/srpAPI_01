# =============================================================================
# Sub2API Multi-Stage Dockerfile (API only)
# =============================================================================
# The Next.js UI is built separately (apps/web/Dockerfile) and run as a
# companion `web` service in docker-compose. This image is the Go API +
# gateway only.
# =============================================================================

ARG GOLANG_IMAGE=golang:1.26.4-alpine
ARG ALPINE_IMAGE=alpine:3.20
ARG GOPROXY=https://goproxy.cn,direct
ARG GOSUMDB=sum.golang.google.cn

# -----------------------------------------------------------------------------
# Stage 1: Backend Builder
# -----------------------------------------------------------------------------
FROM ${GOLANG_IMAGE} AS backend-builder

ARG VERSION=docker
ARG COMMIT=docker
ARG DATE
ARG GOPROXY
ARG GOSUMDB

ENV GOPROXY=${GOPROXY}
ENV GOSUMDB=${GOSUMDB}

RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /app/backend

COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download

COPY apps/api/ ./

RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w -X main.Commit=${COMMIT} -X main.Date=${DATE:-$(date -u +%Y-%m-%dT%H:%M:%SZ)} -X main.BuildType=release" \
    -o /app/sub2api \
    ./cmd/server

# -----------------------------------------------------------------------------
# Stage 2: Final Runtime Image
# -----------------------------------------------------------------------------
FROM ${ALPINE_IMAGE}

LABEL maintainer="Wei-Shaw <github.com/Wei-Shaw>"
LABEL description="Sub2API - AI API Gateway Platform (API)"
LABEL org.opencontainers.image.source="https://github.com/Wei-Shaw/sub2api"

RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    curl \
    su-exec \
    && rm -rf /var/cache/apk/*

RUN addgroup -g 1000 sub2api && \
    adduser -u 1000 -G sub2api -s /bin/sh -D sub2api

WORKDIR /app

COPY --from=backend-builder /app/sub2api /app/sub2api

RUN mkdir -p /app/data && chown -R sub2api:sub2api /app

COPY deploy/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget -q -T 5 -O /dev/null http://localhost:${SERVER_PORT:-8080}/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["/app/sub2api"]
