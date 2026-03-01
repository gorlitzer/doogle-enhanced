.PHONY: help setup build run test dev docker clean

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
	@echo "    make run                Build + launch node (API on :8080)"
	@echo "    make run ARGS='...'     Pass extra flags to the binary"
	@echo "    make test               Run all tests"
	@echo "    make dev                Docker backend + hot-reload UI on :3000"
	@echo "    make docker             Build + start 3-node cluster"
	@echo "    make build              Compile binary to bin/ without running"
	@echo "    make clean              Remove build artifacts"
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
		echo "[--] docker not found (optional — only needed for make docker/dev)"; \
		echo "     Install from https://docs.docker.com/get-docker/"; \
	fi
	@# ---- Docker Compose ----
	@if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then \
		echo "[ok] docker compose: $$(docker compose version --short 2>/dev/null)"; \
	elif command -v docker >/dev/null 2>&1; then \
		echo "[--] docker compose not found (optional — needed for make docker/dev)"; \
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
	@HASH=$$(find web/static -type f | sort | xargs cat | shasum -a 256 | cut -c1-16); \
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
	docker compose up --build -d node1
	@sleep 2
	@echo "Backend on :8080 — hot-reload UI on :3000"
	node dev-server.mjs --api http://localhost:8080

docker:
	docker compose up --build -d

clean:
	rm -rf $(BIN_DIR) .go/
