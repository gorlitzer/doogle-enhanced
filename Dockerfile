# ---- Build stage ----
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git gcc musl-dev

WORKDIR /src
COPY go.mod ./
RUN go mod download || true

COPY . .
RUN go mod tidy && CGO_ENABLED=0 go build -ldflags="-s -w" -o /bin/doogle ./cmd/doogle

# ---- Runtime stage ----
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tini chromium
ENV CHROME_PATH=/usr/bin/chromium-browser

COPY --from=builder /bin/doogle /usr/local/bin/doogle

# Default data directory
RUN mkdir -p /data
VOLUME /data

# P2P port (libp2p)
EXPOSE 4001
# HTTP API
EXPOSE 8080

ENTRYPOINT ["tini", "--"]
CMD ["doogle", "--data-dir", "/data", "--port", "4001", "--api-port", "8080", "--headless"]
