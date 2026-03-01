.PHONY: help build run clean test proto fmt vet lint \
       dev-node1 dev-node2 dev-fe dev \
       docker docker-up docker-down docker-logs docker-clean docker-run \
       search prod start backup restore status health

BINARY_NAME=doogle
BUILD_DIR=bin
DATA_DIR=./data/doogle

# ---- Help (default target) ----

help: ## Show all available commands
	@echo ""
	@echo "  Doogle — P2P Decentralized Search Engine"
	@echo ""
	@echo "  Usage: make <target>"
	@echo ""
	@echo "  Production:"
	@echo "    make start            Production build + run"
	@echo "    make prod             Optimized binary (stripped, trimpath)"
	@echo "    make status           Check running node health"
	@echo "    make health           Build + hit status endpoint"
	@echo ""
	@echo "  Development:"
	@echo "    make build            Development build"
	@echo "    make run              Build + run (dev mode)"
	@echo "    make test             Run all tests"
	@echo "    make dev-node1        Run local node 1 (port 4001/8080)"
	@echo "    make dev-node2        Run local node 2 (port 4002/8081)"
	@echo "    make dev-fe           Frontend hot reload only"
	@echo "    make dev              Docker backend + frontend hot reload"
	@echo "    make fmt              Format Go code"
	@echo "    make vet              Run go vet"
	@echo "    make lint             Format + vet"
	@echo "    make clean            Remove build artifacts and data"
	@echo ""
	@echo "  Docker:"
	@echo "    make docker           Build Docker image"
	@echo "    make docker-up        Start compose cluster"
	@echo "    make docker-down      Stop compose cluster"
	@echo "    make docker-logs      Tail compose logs"
	@echo "    make docker-clean     Remove containers, volumes, images"
	@echo "    make docker-run       Run single node in Docker"
	@echo ""
	@echo "  Data:"
	@echo "    make backup           Snapshot data dir to timestamped archive"
	@echo "    make restore BACKUP=<file>  Restore from backup archive"
	@echo ""
	@echo "  CLI:"
	@echo "    make search ARGS=\"query\"  Search from command line"
	@echo ""

# ---- Native (requires Go 1.22+) ----

build:
	@echo "Building $(BINARY_NAME)..."
	@mkdir -p $(BUILD_DIR)
	go build -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd/doogle

prod:
	@echo "Building $(BINARY_NAME) (production)..."
	@mkdir -p $(BUILD_DIR)
	go build -ldflags "-s -w" -trimpath -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd/doogle

run: build
	./$(BUILD_DIR)/$(BINARY_NAME)

start: prod
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

# ---- Data: Backup & Restore ----

backup:
	@if [ ! -d "$(DATA_DIR)" ]; then \
		echo "Error: data directory $(DATA_DIR) does not exist"; \
		exit 1; \
	fi
	@TIMESTAMP=$$(date +%Y%m%dT%H%M%S) && \
		ARCHIVE="doogle-backup-$$TIMESTAMP.tar.gz" && \
		tar -czf "$$ARCHIVE" -C $$(dirname $(DATA_DIR)) $$(basename $(DATA_DIR)) && \
		SIZE=$$(du -h "$$ARCHIVE" | cut -f1) && \
		echo "Backup created: $$ARCHIVE ($$SIZE)"

restore:
	@if [ -z "$(BACKUP)" ]; then \
		echo "Usage: make restore BACKUP=<archive.tar.gz>"; \
		exit 1; \
	fi
	@if [ ! -f "$(BACKUP)" ]; then \
		echo "Error: archive $(BACKUP) not found"; \
		exit 1; \
	fi
	@if [ -d "$(DATA_DIR)" ]; then \
		echo "Warning: $(DATA_DIR) exists, overwriting..."; \
		rm -rf "$(DATA_DIR)"; \
	fi
	@mkdir -p $$(dirname $(DATA_DIR))
	tar -xzf "$(BACKUP)" -C $$(dirname $(DATA_DIR))
	@echo "Restored from $(BACKUP) to $(DATA_DIR)"

# ---- Health & Status ----

status:
	@curl -s http://localhost:8080/api/status | python3 -m json.tool 2>/dev/null || \
		curl -s http://localhost:8080/api/status

health: build
	@echo "Checking node health..."
	@curl -sf http://localhost:8080/api/status > /dev/null 2>&1 && \
		echo "Node is healthy" && \
		curl -s http://localhost:8080/api/status | python3 -m json.tool 2>/dev/null || \
		echo "Node is not responding on localhost:8080"

# ---- Development: Multi-node ----

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

# Single node via Docker (quick start — builds if needed)
docker-run: docker
	docker run --rm -it \
		-p 4001:4001 \
		-p 8080:8080 \
		-v doogle-data:/data \
		doogle:latest

# ---- CLI Search ----

# Quick search from command line (requires a running node)
search: build
	./$(BUILD_DIR)/$(BINARY_NAME) search $(ARGS)

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
