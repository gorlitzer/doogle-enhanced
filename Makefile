.PHONY: help setup build run test dev stop clean nuke fleet-worker fleet-stop

BINARY     = doogle
BIN_DIR    = bin
GO_VERSION = 1.22.5
LOCAL_GO   = .go/go/bin/go
GO         = $(shell command -v go 2>/dev/null || echo $(LOCAL_GO))

help:
	@echo ""
	@echo "  Doogle — P2P Decentralized Search Engine"
	@echo ""
	@echo "    make setup              Install Go, Docker, and all prerequisites"
	@echo "    make build              Compile binary to bin/"
	@echo "    make run                Build + launch node (fleet-ready on 0.0.0.0:7002)"
	@echo "    make run ARGS='...'     Pass extra flags to the binary"
	@echo "    make dev                Docker detached on :7002 (stop with: make stop)"
	@echo "    make stop               Stop docker containers"
	@echo "    make test               Run all tests"
	@echo "    make clean              Remove binary and node data"
	@echo "    make nuke               Full reset: clean + remove in-repo Go runtime"
	@echo ""
	@echo "  Fleet (add workers to your node — see Admin > Fleet for secret + token)"
	@echo ""
	@echo "    make fleet-worker COORD=... SECRET=...  Join a worker to this node"
	@echo "    make fleet-stop                         Stop all fleet workers"
	@echo ""

setup:
	@echo "==> Checking prerequisites..."
	@echo ""
	@# ---- Git ----
	@if command -v git >/dev/null 2>&1; then \
		echo "[ok] git: $$(git --version)"; \
	else \
		echo "[!!] git not found"; \
		echo "     Install from https://git-scm.com/downloads"; \
		echo ""; \
	fi
	@# ---- Go ----
	@if command -v go >/dev/null 2>&1; then \
		echo "[ok] go:  $$(go version)"; \
	else \
		echo "[..] Go not found — installing $(GO_VERSION) locally..."; \
		mkdir -p .go; \
		OS=$$(uname -s | tr '[:upper:]' '[:lower:]'); \
		ARCH=$$(uname -m); \
		case "$$ARCH" in x86_64) ARCH=amd64;; aarch64|arm64) ARCH=arm64;; esac; \
		curl -fsSL "https://go.dev/dl/go$(GO_VERSION).$$OS-$$ARCH.tar.gz" | tar -xz -C .go; \
		echo "[ok] go:  $$($(LOCAL_GO) version) (installed to .go/)"; \
	fi
	@# ---- Docker ----
	@if command -v docker >/dev/null 2>&1; then \
		echo "[ok] docker: $$(docker --version | head -1)"; \
	else \
		echo "[--] docker not found (optional — only needed for make dev)"; \
		echo "     Install from https://docs.docker.com/get-docker/"; \
	fi
	@# ---- Docker Compose ----
	@if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then \
		echo "[ok] docker compose: $$(docker compose version --short 2>/dev/null)"; \
	elif command -v docker >/dev/null 2>&1; then \
		echo "[--] docker compose not found (optional — needed for make dev)"; \
	fi
	@# ---- curl ----
	@if command -v curl >/dev/null 2>&1; then \
		echo "[ok] curl: $$(curl --version | head -1)"; \
	else \
		echo "[--] curl not found (needed for Go auto-install)"; \
	fi
	@echo ""
	@echo "==> Setup complete. Run: make run"

build:
	@mkdir -p $(BIN_DIR)
	@HASH=$$(find web/static -type f -not -name '.DS_Store' | LC_ALL=C sort | xargs cat | shasum -a 256 | cut -c1-16); \
	  printf 'package web\n\nconst embedHash = "%s"\n' "$$HASH" > web/embed_hash.go.tmp; \
	  cmp -s web/embed_hash.go.tmp web/embed_hash.go 2>/dev/null || mv web/embed_hash.go.tmp web/embed_hash.go; \
	  rm -f web/embed_hash.go.tmp
	$(GO) build -ldflags "-s -w" -trimpath -o $(BIN_DIR)/$(BINARY) ./cmd/doogle

run: build
	@-pkill -f '$(BIN_DIR)/$(BINARY)' 2>/dev/null; sleep 0.2
	./$(BIN_DIR)/$(BINARY) $(ARGS)

test:
	$(GO) test ./...

dev:
	docker compose up --build -d
	@sleep 2
	@echo "Running detached on :7002 — stop with: make stop"

stop:
	@pkill -f '$(BIN_DIR)/$(BINARY)' 2>/dev/null || true
	@docker compose down 2>/dev/null || true
	@echo "Stopped."

clean:
	@-docker compose down -v 2>/dev/null
	rm -rf $(BIN_DIR) data/

nuke: clean
	rm -rf .go/

# ---- Fleet Workers ----

COORD   ?=
SECRET  ?=
W_NAME  ?= worker1
W_PORT  ?= 7003
W_API   ?= 7004
W_DATA  ?= ./data/fleet-worker1

fleet-worker: build
	@if [ -z "$(COORD)" ] || [ -z "$(SECRET)" ]; then \
		echo "Usage: make fleet-worker COORD=/ip4/.../tcp/.../p2p/<ID> SECRET=<hex>"; \
		echo ""; \
		echo "  Optional: W_NAME=worker1 W_PORT=7003 W_API=7004 W_DATA=./data/fleet-worker1"; \
		exit 1; \
	fi
	./$(BIN_DIR)/$(BINARY) --fleet-role worker --name $(W_NAME) \
		--fleet-coordinator "$(COORD)" --fleet-secret "$(SECRET)" \
		--port $(W_PORT) --api-port $(W_API) --data-dir $(W_DATA) $(ARGS)

fleet-stop:
	@pkill -f '$(BIN_DIR)/$(BINARY).*--fleet-role' 2>/dev/null || true
	@echo "Fleet workers stopped."
