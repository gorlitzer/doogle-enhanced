.PHONY: help build run test dev docker clean

BINARY  = doogle
BIN_DIR = bin

help:
	@echo ""
	@echo "  Doogle — P2P Decentralized Search Engine"
	@echo ""
	@echo "    make run                Build + launch node (API on :8080)"
	@echo "    make run ARGS='...'     Pass extra flags to the binary"
	@echo "    make test               Run all tests"
	@echo "    make dev                Docker backend + hot-reload UI on :3000"
	@echo "    make docker             Build + start 3-node cluster"
	@echo "    make build              Compile binary to bin/ without running"
	@echo "    make clean              Remove build artifacts"
	@echo ""

build:
	@mkdir -p $(BIN_DIR)
	go build -ldflags "-s -w" -trimpath -o $(BIN_DIR)/$(BINARY) ./cmd/doogle

run: build
	./$(BIN_DIR)/$(BINARY) $(ARGS)

test:
	go test ./...

dev:
	docker compose up --build -d node1
	@sleep 2
	@echo "Backend on :8080 — hot-reload UI on :3000"
	node dev-server.mjs --api http://localhost:8080

docker:
	docker compose up --build -d

clean:
	rm -rf $(BIN_DIR)
