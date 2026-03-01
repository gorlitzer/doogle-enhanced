.PHONY: help build run test fmt lint clean nuke dev watch docker docker-stop docker-logs backup restore

BINARY  = doogle
BIN_DIR = bin
DATA    = ./data/doogle

# ---- Help ----

help:
	@echo ""
	@echo "  Doogle — P2P Decentralized Search Engine"
	@echo ""
	@echo "  Build & Run"
	@echo "    make build              Compile optimized binary to bin/"
	@echo "    make run                Build + launch node (API on :8080)"
	@echo "    make run ARGS='--port 4002'  Pass extra flags to the binary"
	@echo "    make test               Run all tests"
	@echo "    make fmt                Format Go source files (gofmt)"
	@echo "    make lint               Static analysis (go vet)"
	@echo ""
	@echo "  Frontend Development"
	@echo "    make dev                Start Docker backend + hot-reload UI on :3000"
	@echo "    make watch              Hot-reload UI only (run 'make run' in another terminal first)"
	@echo ""
	@echo "  Docker Cluster (3 nodes)"
	@echo "    make docker             Build images + start 3-node cluster"
	@echo "    make docker-stop        Stop cluster and free ports"
	@echo "    make docker-logs        Tail all node logs"
	@echo ""
	@echo "  Data"
	@echo "    make backup             Snapshot data/ to timestamped .tar.gz"
	@echo "    make restore BACKUP=<file>  Restore data/ from archive"
	@echo ""
	@echo "  Cleanup"
	@echo "    make clean              Remove bin/ only (data is preserved)"
	@echo "    make nuke               Remove bin/ AND data/ (destroys index + identity)"
	@echo ""

# ---- Build & Run ----

build:
	@mkdir -p $(BIN_DIR)
	go build -ldflags "-s -w" -trimpath -o $(BIN_DIR)/$(BINARY) ./cmd/doogle

run: build
	./$(BIN_DIR)/$(BINARY) $(ARGS)

test:
	go test ./...

fmt:
	gofmt -w -s .

lint:
	go vet ./...

# ---- Cleanup ----

clean:
	rm -rf $(BIN_DIR)

nuke: clean
	@printf "\033[31mThis will permanently delete ALL crawled data, indexes, and identity keys.\033[0m\n"
	@printf "Type 'yes' to confirm: " && read ans && [ "$$ans" = "yes" ] || (echo "Aborted."; exit 1)
	rm -rf data/
	@echo "Done. All data removed."

# ---- Frontend Development ----

dev:
	@echo "Starting backend in Docker..."
	docker compose up --build -d node1
	@sleep 3
	@echo "Backend running on :8080 — starting hot-reload UI on :3000..."
	node dev-server.mjs --api http://localhost:8080

watch:
	@echo "Starting hot-reload UI on :3000 (proxying API to :8080)..."
	node dev-server.mjs

# ---- Docker ----

docker:
	docker compose up --build -d

docker-stop:
	docker compose down

docker-logs:
	docker compose logs -f

# ---- Data ----

backup:
	@if [ ! -d "$(DATA)" ]; then echo "Error: $(DATA) not found — nothing to back up."; exit 1; fi
	@TIMESTAMP=$$(date +%Y%m%dT%H%M%S) && \
		ARCHIVE="doogle-backup-$$TIMESTAMP.tar.gz" && \
		tar -czf "$$ARCHIVE" -C $$(dirname $(DATA)) $$(basename $(DATA)) && \
		echo "Created: $$ARCHIVE ($$(du -h "$$ARCHIVE" | cut -f1))"

restore:
	@if [ -z "$(BACKUP)" ]; then echo "Usage: make restore BACKUP=<file>"; exit 1; fi
	@if [ ! -f "$(BACKUP)" ]; then echo "Error: $(BACKUP) not found"; exit 1; fi
	@if [ -d "$(DATA)" ]; then \
		printf "\033[33mWARNING: $(DATA) exists and will be overwritten.\033[0m\n"; \
		printf "Type 'yes' to confirm: " && read ans && [ "$$ans" = "yes" ] || (echo "Aborted."; exit 1); \
		rm -rf "$(DATA)"; \
	fi
	@mkdir -p $$(dirname $(DATA))
	tar -xzf "$(BACKUP)" -C $$(dirname $(DATA))
	@echo "Restored from $(BACKUP)"
