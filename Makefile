.PHONY: build run clean test proto fmt vet docker docker-up docker-down docker-logs

BINARY_NAME=doogle
BUILD_DIR=bin

# ---- Native (requires Go 1.22+) ----

build:
	@echo "Building $(BINARY_NAME)..."
	@mkdir -p $(BUILD_DIR)
	go build -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd/doogle

run: build
	./$(BUILD_DIR)/$(BINARY_NAME)

clean:
	@rm -rf $(BUILD_DIR)
	@rm -rf data/

test:
	go test ./... -v -count=1

proto:
	protoc --go_out=. --go_opt=paths=source_relative proto/doogle.proto

fmt:
	go fmt ./...

vet:
	go vet ./...

lint: fmt vet
	@echo "Lint passed"

# Run two local nodes for testing (native)
dev-node1: build
	./$(BUILD_DIR)/$(BINARY_NAME) --port 4001 --api-port 8080 --data-dir ./data/node1

dev-node2: build
	./$(BUILD_DIR)/$(BINARY_NAME) --port 4002 --api-port 8081 --data-dir ./data/node2 --bootstrap /ip4/127.0.0.1/tcp/4001

# ---- Docker (no Go required) ----

docker:
	docker build -t doogle:latest .

docker-up:
	docker compose up --build -d

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

docker-clean:
	docker compose down -v --rmi local

# Single node via Docker (quick start)
docker-run:
	docker run --rm -it \
		-p 4001:4001 \
		-p 8080:8080 \
		-v doogle-data:/data \
		doogle:latest

# ---- Development (hot reload) ----

# Frontend only — hot reload, API calls will 502 unless backend is running
dev-fe:
	node dev-server.mjs

# Full stack — Docker backend + frontend hot reload
dev:
	@echo "Starting backend in Docker..."
	docker compose up --build -d node1
	@sleep 3
	@echo "Starting frontend dev server with hot reload..."
	node dev-server.mjs --api http://localhost:8080
