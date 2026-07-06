# ---- Build stage ----
# Use a current patched Go toolchain so the compiled stdlib is free of the CVEs
# that govulncheck flags on older releases.
FROM golang:1.26-alpine AS builder

ARG VERSION=dev
ARG COMMIT=none
ARG DATE=unknown

RUN apk add --no-cache git gcc musl-dev

WORKDIR /src
COPY go.mod go.sum ./
# Download against the committed go.sum for a reproducible build. Do NOT run
# `go mod tidy` at build time — it mutates go.sum (non-reproducible, a
# supply-chain smell). A bad lockfile should fail the build loudly.
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build \
    -ldflags="-s -w -X main.version=${VERSION} -X main.commit=${COMMIT} -X main.date=${DATE}" \
    -trimpath -o /bin/doogle ./cmd/doogle

# ---- Runtime stage ----
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tini chromium curl

ENV CHROME_PATH=/usr/bin/chromium-browser

COPY --from=builder /bin/doogle /usr/local/bin/doogle

# Run as an unprivileged user. The crawler fetches arbitrary internet content
# and drives headless Chromium, so a crawler/Chromium exploit or container
# escape must not land as root. /data is owned by the app user.
RUN addgroup -S doogle && adduser -S -G doogle -h /data doogle \
    && mkdir -p /data && chown -R doogle:doogle /data
VOLUME /data
USER doogle

# P2P port (libp2p TCP + QUIC/UDP)
EXPOSE 7001/tcp
EXPOSE 7001/udp
# HTTP API + Web UI
EXPOSE 7002

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -sf http://localhost:7002/api/status || exit 1

ENTRYPOINT ["tini", "--"]
CMD ["doogle", "--data-dir", "/data", "--port", "7001", "--api-port", "7002", "--bind", "0.0.0.0", "--headless"]
