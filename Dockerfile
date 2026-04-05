# ---- Build stage ----
FROM golang:1.22-alpine AS builder

ARG VERSION=dev
ARG COMMIT=none
ARG DATE=unknown

RUN apk add --no-cache git gcc musl-dev

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download || true

COPY . .
RUN go mod tidy && CGO_ENABLED=0 go build \
    -ldflags="-s -w -X main.version=${VERSION} -X main.commit=${COMMIT} -X main.date=${DATE}" \
    -trimpath -o /bin/doogle ./cmd/doogle

# ---- Runtime stage ----
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tini chromium curl

ENV CHROME_PATH=/usr/bin/chromium-browser

COPY --from=builder /bin/doogle /usr/local/bin/doogle

# Default data directory
RUN mkdir -p /data
VOLUME /data

# P2P port (libp2p TCP + QUIC/UDP)
EXPOSE 7001/tcp
EXPOSE 7001/udp
# HTTP API + Web UI
EXPOSE 7002

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -sf http://localhost:7002/api/status || exit 1

ENTRYPOINT ["tini", "--"]
CMD ["doogle", "--data-dir", "/data", "--port", "7001", "--api-port", "7002", "--bind", "0.0.0.0", "--headless"]
