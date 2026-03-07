.PHONY: help setup build run run-only upgrade test dev stop stop-quiet status clean nuke release checksums patch minor major geoip

BINARY     = doogle
BIN_DIR    = bin
DIST_DIR   = dist
GO_VERSION = 1.22.5
LOCAL_GO   = .go/go/bin/go
GO         = $(shell command -v go 2>/dev/null || echo $(LOCAL_GO))

VERSION = $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT  = $(shell git rev-parse --short HEAD 2>/dev/null || echo "none")
DATE    = $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS = -s -w -X main.version=$(VERSION) -X main.commit=$(COMMIT) -X main.date=$(DATE)

help:
	@echo ""
	@echo "  Doogle — P2P Decentralized Search Engine"
	@echo ""
	@echo "    make setup              Install Go, Docker, and all prerequisites"
	@echo "    make build              Compile binary to bin/"
	@echo "    make run                Build + stop old process + launch node detached"
	@echo "    make run ARGS='...'     Pass extra flags (run ./bin/doogle --help for all flags)"
	@echo "    make upgrade            Download latest release binary + restart node"
	@echo "    make dev                Docker foreground on :7002 (Ctrl+C to stop)"
	@echo "    make stop               Gracefully stop running node (SIGTERM, 15s timeout)"
	@echo "    make status             Check if the node is running"
	@echo "    make test               Run all tests"
	@echo "    make geoip             Download GeoLite2-Country database for peer geolocation"
	@echo "    make clean              Stop node + remove build artifacts + crawl data"
	@echo "    make nuke               Clean + delete local Go runtime"
	@echo "    make release            Cross-compile binaries for all platforms to dist/"
	@echo "    make checksums          Generate SHA-256 checksums for dist/ binaries"
	@echo "    make patch              Tag + release: v0.1.0 → v0.1.1"
	@echo "    make minor              Tag + release: v0.1.0 → v0.2.0"
	@echo "    make major              Tag + release: v0.1.0 → v1.0.0"
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
	@echo "==> Building $(VERSION)..."
	@mkdir -p $(BIN_DIR)
	@HASH=$$(find web/static -type f -not -name '.DS_Store' | LC_ALL=C sort | xargs cat | shasum -a 256 | cut -c1-16); \
	  printf 'package web\n\nconst embedHash = "%s"\n' "$$HASH" > web/embed_hash.go.tmp; \
	  cmp -s web/embed_hash.go.tmp web/embed_hash.go 2>/dev/null || mv web/embed_hash.go.tmp web/embed_hash.go; \
	  rm -f web/embed_hash.go.tmp
	@$(GO) build -ldflags "$(LDFLAGS)" -trimpath -o $(BIN_DIR)/$(BINARY) ./cmd/doogle
	@echo "==> Built $(BIN_DIR)/$(BINARY) ($(VERSION))"

run: build stop-quiet
	@nohup ./$(BIN_DIR)/$(BINARY) $(ARGS) > doogle.log 2>&1 & echo "$$!" > .doogle.pid
	@echo ""
	@echo "  Doogle is running! (PID $$(cat .doogle.pid))"
	@echo ""
	@echo "    Open:   http://localhost:7002"
	@echo "    Logs:   tail -f doogle.log"
	@echo "    Stop:   make stop"
	@echo ""

upgrade:
	@if [ -x ./$(BIN_DIR)/$(BINARY) ]; then \
		echo "==> Checking for updates..."; \
		./$(BIN_DIR)/$(BINARY) update && $(MAKE) stop run-only; \
	else \
		echo "==> No binary found — building from source..."; \
		git pull; \
		$(MAKE) run; \
	fi

run-only:
	@nohup ./$(BIN_DIR)/$(BINARY) $(ARGS) > doogle.log 2>&1 & echo "$$!" > .doogle.pid
	@echo ""
	@echo "  Doogle upgraded and running! (PID $$(cat .doogle.pid))"
	@echo ""
	@echo "    Open:   http://localhost:7002"
	@echo "    Logs:   tail -f doogle.log"
	@echo "    Stop:   make stop"
	@echo ""

test:
	@echo "==> Running tests..."
	@$(GO) test ./...
	@echo "==> All tests passed."

dev:
	docker compose up --build

stop:
	@if [ -f .doogle.pid ]; then \
	  PID=$$(cat .doogle.pid); \
	  if kill -0 "$$PID" 2>/dev/null; then \
	    echo "==> Stopping Doogle (PID $$PID)..."; kill "$$PID"; \
	    i=0; while kill -0 "$$PID" 2>/dev/null && [ $$i -lt 15 ]; do sleep 1; i=$$((i+1)); done; \
	    if kill -0 "$$PID" 2>/dev/null; then echo "    Force killing..."; kill -9 "$$PID"; fi; \
	    echo "==> Stopped."; \
	  else \
	    echo "==> Nothing running (stale PID file removed)."; \
	  fi; rm -f .doogle.pid; \
	else \
	  echo "==> Nothing running."; \
	fi
	@killall $(BINARY) 2>/dev/null || true
	@docker compose down 2>/dev/null || true

# Silent variant used by run/clean to avoid noise.
stop-quiet:
	@if [ -f .doogle.pid ]; then \
	  PID=$$(cat .doogle.pid); \
	  if kill -0 "$$PID" 2>/dev/null; then \
	    echo "==> Stopping Doogle (PID $$PID)..."; kill "$$PID"; \
	    i=0; while kill -0 "$$PID" 2>/dev/null && [ $$i -lt 15 ]; do sleep 1; i=$$((i+1)); done; \
	    if kill -0 "$$PID" 2>/dev/null; then kill -9 "$$PID"; fi; \
	    echo "==> Stopped."; \
	  fi; rm -f .doogle.pid; \
	fi
	@killall $(BINARY) 2>/dev/null || true
	@docker compose down 2>/dev/null || true

status:
	@if [ -f .doogle.pid ]; then \
	  PID=$$(cat .doogle.pid); \
	  if kill -0 "$$PID" 2>/dev/null; then \
	    echo ""; \
	    echo "  Doogle is running (PID $$PID)"; \
	    echo ""; \
	    echo "    Open:   http://localhost:7002"; \
	    echo "    Logs:   tail -f doogle.log"; \
	    echo "    Stop:   make stop"; \
	    VER=$$(curl -sf http://localhost:7002/api/status 2>/dev/null | grep -o '"version":"[^"]*"' | head -1 | cut -d'"' -f4); \
	    if [ -n "$$VER" ]; then echo "    Version: $$VER"; fi; \
	    echo ""; \
	  else \
	    echo ""; \
	    echo "  Doogle is not running (stale PID $$PID)"; \
	    rm -f .doogle.pid; \
	    echo "    Start:  make run"; \
	    echo ""; \
	  fi; \
	else \
	  echo ""; \
	  echo "  Doogle is not running"; \
	  echo "    Start:  make run"; \
	  echo ""; \
	fi

clean: stop-quiet
	@echo "==> Removing build artifacts and crawl data..."
	@rm -rf $(BIN_DIR)/ $(DIST_DIR)/ .doogle.pid doogle.log data/
	@echo "==> Clean complete."

nuke: clean
	@echo ""
	@echo "WARNING: This will also DELETE the local Go runtime (.go/)."
	@echo "You will need to run 'make setup' again."
	@echo "Press Ctrl+C within 5 seconds to abort."
	@sleep 5
	@rm -rf .go/
	@echo "==> Nuke complete. Run 'make setup' to reinstall."

geoip:
	@mkdir -p data
	@echo "==> Downloading GeoLite2-Country database..."
	@curl -sL "https://git.io/GeoLite2-Country.mmdb" -o data/GeoLite2-Country.mmdb
	@echo "==> GeoLite2-Country.mmdb downloaded to data/"

release:
	@echo "==> Cross-compiling $(VERSION) for all platforms..."
	@mkdir -p $(DIST_DIR)
	GOOS=darwin  GOARCH=amd64 CGO_ENABLED=0 $(GO) build -ldflags "$(LDFLAGS)" -trimpath -o $(DIST_DIR)/$(BINARY)-darwin-amd64  ./cmd/doogle
	GOOS=darwin  GOARCH=arm64 CGO_ENABLED=0 $(GO) build -ldflags "$(LDFLAGS)" -trimpath -o $(DIST_DIR)/$(BINARY)-darwin-arm64  ./cmd/doogle
	GOOS=linux   GOARCH=amd64 CGO_ENABLED=0 $(GO) build -ldflags "$(LDFLAGS)" -trimpath -o $(DIST_DIR)/$(BINARY)-linux-amd64   ./cmd/doogle
	GOOS=linux   GOARCH=arm64 CGO_ENABLED=0 $(GO) build -ldflags "$(LDFLAGS)" -trimpath -o $(DIST_DIR)/$(BINARY)-linux-arm64   ./cmd/doogle
	GOOS=android GOARCH=arm64 CGO_ENABLED=0 $(GO) build -ldflags "$(LDFLAGS)" -trimpath -o $(DIST_DIR)/$(BINARY)-android-arm64 ./cmd/doogle
	@echo "==> Binaries:"
	@ls -lh $(DIST_DIR)/

checksums:
	@cd $(DIST_DIR) && shasum -a 256 $(BINARY)-* > checksums.txt
	@echo "==> Checksums:"
	@cat $(DIST_DIR)/checksums.txt

define bump_version
	@CURRENT=$$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0"); \
	MAJOR=$$(echo $$CURRENT | sed 's/^v//' | cut -d. -f1); \
	MINOR=$$(echo $$CURRENT | sed 's/^v//' | cut -d. -f2); \
	PATCH=$$(echo $$CURRENT | sed 's/^v//' | cut -d. -f3); \
	case $(1) in \
		patch) PATCH=$$((PATCH + 1)) ;; \
		minor) MINOR=$$((MINOR + 1)); PATCH=0 ;; \
		major) MAJOR=$$((MAJOR + 1)); MINOR=0; PATCH=0 ;; \
	esac; \
	NEXT="v$$MAJOR.$$MINOR.$$PATCH"; \
	echo "$$CURRENT → $$NEXT"; \
	git tag -a $$NEXT -m "Release $$NEXT" && \
	git push origin $$NEXT && \
	echo "Tagged and pushed $$NEXT — release workflow started."
endef

patch:
	$(call bump_version,patch)

minor:
	$(call bump_version,minor)

major:
	$(call bump_version,major)
