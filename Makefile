.PHONY: help build run test clean dev dev-fe docker-up docker-down docker-logs start backup restore

BINARY_NAME=doogle
BUILD_DIR=bin
DATA_DIR=./data/doogle

help:
	@echo ""
	@echo "  Doogle — P2P Decentralized Search Engine"
	@echo ""
	@echo "  make build          Build binary"
	@echo "  make run            Build + run"
	@echo "  make start          Production build + run"
	@echo "  make test           Run tests"
	@echo "  make dev            Docker backend + frontend hot reload"
	@echo "  make dev-fe         Frontend hot reload only"
	@echo "  make docker-up      Start Docker cluster"
	@echo "  make docker-down    Stop Docker cluster"
	@echo "  make docker-logs    Tail Docker logs"
	@echo "  make backup         Snapshot data to archive"
	@echo "  make restore BACKUP=<file>"
	@echo "  make clean          Remove build artifacts + data"
	@echo ""

# ---- Build & Run ----

build:
	@mkdir -p $(BUILD_DIR)
	go build -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd/doogle

run: build
	./$(BUILD_DIR)/$(BINARY_NAME)

start:
	@mkdir -p $(BUILD_DIR)
	go build -ldflags "-s -w" -trimpath -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd/doogle
	./$(BUILD_DIR)/$(BINARY_NAME)

test:
	go test ./... -v -count=1

clean:
	@rm -rf $(BUILD_DIR) data/

# ---- Development ----

dev:
	@echo "Starting backend in Docker..."
	docker compose up --build -d node1
	@sleep 3
	@echo "Starting frontend dev server..."
	node dev-server.mjs --api http://localhost:8080

dev-fe:
	node dev-server.mjs

# ---- Docker ----

docker-up:
	docker compose up --build -d

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

# ---- Data ----

backup:
	@if [ ! -d "$(DATA_DIR)" ]; then echo "Error: $(DATA_DIR) not found"; exit 1; fi
	@TIMESTAMP=$$(date +%Y%m%dT%H%M%S) && \
		ARCHIVE="doogle-backup-$$TIMESTAMP.tar.gz" && \
		tar -czf "$$ARCHIVE" -C $$(dirname $(DATA_DIR)) $$(basename $(DATA_DIR)) && \
		echo "Created: $$ARCHIVE ($$(du -h "$$ARCHIVE" | cut -f1))"

restore:
	@if [ -z "$(BACKUP)" ]; then echo "Usage: make restore BACKUP=<file>"; exit 1; fi
	@if [ ! -f "$(BACKUP)" ]; then echo "Error: $(BACKUP) not found"; exit 1; fi
	@if [ -d "$(DATA_DIR)" ]; then echo "Overwriting $(DATA_DIR)..."; rm -rf "$(DATA_DIR)"; fi
	@mkdir -p $$(dirname $(DATA_DIR))
	tar -xzf "$(BACKUP)" -C $$(dirname $(DATA_DIR))
	@echo "Restored from $(BACKUP)"
