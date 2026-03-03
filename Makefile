.PHONY: help setup build run restart test dev stop clean nuke

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
	@echo "    make run                Build + stop old process + launch node detached"
	@echo "    make run ARGS='...'     Pass extra flags (run ./bin/doogle --help for all flags)"
	@echo "    make restart            Alias for 'make run' (rebuild + restart)"
	@echo "    make dev                Docker foreground on :7002 (Ctrl+C to stop)"
	@echo "    make stop               Gracefully stop running node (SIGTERM, 15s timeout)"
	@echo "    make test               Run all tests"
	@echo "    make clean              Stop node + delete crawl data in data/"
	@echo "    make nuke               Full reset: clean + remove in-repo Go runtime"
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

run: build stop
	@nohup ./$(BIN_DIR)/$(BINARY) $(ARGS) > doogle.log 2>&1 & echo "$$!" > .doogle.pid
	@echo ""
	@echo "  Doogle is running! (PID $$(cat .doogle.pid))"
	@echo ""
	@echo "    Open:   http://localhost:7002"
	@echo "    Logs:   tail -f doogle.log"
	@echo "    Stop:   make stop"
	@echo ""

restart: run

test:
	$(GO) test ./...

dev:
	docker compose up --build

stop:
	@if [ -f .doogle.pid ]; then \
	  PID=$$(cat .doogle.pid); \
	  if kill -0 "$$PID" 2>/dev/null; then \
	    echo "Stopping PID $$PID..."; kill "$$PID"; \
	    i=0; while kill -0 "$$PID" 2>/dev/null && [ $$i -lt 15 ]; do sleep 1; i=$$((i+1)); done; \
	    if kill -0 "$$PID" 2>/dev/null; then echo "Forcing kill"; kill -9 "$$PID"; fi; \
	  fi; rm -f .doogle.pid; fi
	@pkill -f '$(BIN_DIR)/$(BINARY)' 2>/dev/null || true
	@docker compose down 2>/dev/null || true
	@echo "Stopped."

clean: stop
	@echo "WARNING: This will DELETE all crawl data in data/"
	@echo "Press Ctrl+C within 5 seconds to abort."
	@sleep 5
	rm -rf data/ doogle.log

nuke: clean
	rm -rf .go/
