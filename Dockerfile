# ---- Build stage ----
FROM golang:1.22-alpine AS builder

ARG VERSION=dev
ARG COMMIT=none
ARG DATE=unknown

RUN apk add --no-cache git gcc musl-dev

WORKDIR /src
COPY go.mod ./
RUN go mod download || true

COPY . .
RUN go mod tidy && CGO_ENABLED=0 go build \
    -ldflags="-s -w -X main.version=${VERSION} -X main.commit=${COMMIT} -X main.date=${DATE}" \
    -o /bin/doogle ./cmd/doogle

# ---- Runtime stage ----
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tini chromium
ENV CHROME_PATH=/usr/bin/chromium-browser

COPY --from=builder /bin/doogle /usr/local/bin/doogle

# Default data directory
RUN mkdir -p /data
VOLUME /data

# P2P port (libp2p)
EXPOSE 7001
# HTTP API
EXPOSE 7002

ENTRYPOINT ["tini", "--"]
CMD ["doogle", "--data-dir", "/data", "--port", "7001", "--api-port", "7002", "--headless"]
