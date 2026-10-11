# Contributing to Doogle

## Getting Started

### 1. Install Doogle

**Option A — Install script (recommended):**

```sh
curl -fsSL https://raw.githubusercontent.com/gorlitzer/doogle-enhanced/main/install.sh | sh
```

This detects your OS/arch, downloads the latest binary, and installs it to `/usr/local/bin`.

To install elsewhere: `INSTALL_DIR=~/bin sh install.sh`

**Option B — Build from source:**

```sh
git clone https://github.com/gorlitzer/doogle-enhanced.git
cd doogle-enhanced
make setup    # checks/installs Go if needed
make build
```

### 2. Run

```sh
doogle                                    # if installed via install.sh
./bin/doogle                              # if built from source
./bin/doogle --seed "https://example.com" # with initial seed URLs
```

Open http://localhost:7002 — the setup wizard walks you through the rest.

### 3. Update

```sh
doogle update           # download + replace with latest release
doogle update --check   # just check if an update is available
```

### 4. Check Version

```sh
doogle version
doogle version --json
```

## Development

```sh
make setup     # install prerequisites
make build     # compile binary
make run       # build + launch detached
make test      # run all tests
make stop      # stop running node
make status    # check if the node is running
```

## GeoIP Data

Doogle uses MaxMind's GeoLite2-Country database for peer geolocation. This data is **not bundled** with the source code due to licensing requirements.

To download the database:

```sh
make geoip
```

Usage of GeoLite2 data is subject to [MaxMind's End User License Agreement](https://www.maxmind.com/en/geolite2/eula). By downloading and using this data, you agree to their terms.

## Fleet Workers

To join as a fleet worker, you need the coordinator's peer ID, IP, and fleet secret:

```sh
./bin/doogle \
  --fleet-role worker \
  --fleet-coordinator /ip4/<COORDINATOR_IP>/tcp/7001/p2p/<PEER_ID> \
  --fleet-secret <HEX_SECRET> \
  --port 7003 --api-port 7004 \
  --data-dir ./data/worker1
```

The coordinator provides the fleet secret in their logs and in `data/fleet.secret`.

## Where Help Is Most Needed

Straight talk: we shipped this before it was done because the idea is good and sitting on it wasn't going to help anyone. Below is an honest list of what's actually incomplete or unvalidated. Not marketing. Not stretch goals. The real gaps.

Pick something and go. If you're not sure where to start, open an issue and ask.

### Testing gaps (real testing, not just running unit tests)

| Gap | How to help |
|-----|------------|
| P2P stress test | Spin up 50+ nodes (Docker Compose scales easily) and observe DHT routing, shard distribution, and gossip propagation. Report anything weird. |
| LTR ranking validation | Run the node, generate real search traffic, then inspect `data/ltr_model.json` after training. Does ranking actually improve? |
| Neural search quality | Run the same 20+ queries with and without `--ollama`. Does semantic matching add real value? |
| Crawl stability | Point it at a large seed list and let it run 24h+ unattended. Check memory/CPU, look for goroutine leaks. |
| Trust / Sybil resistance | Write a test that spins up a cluster with a malicious peer flooding URL announcements. Does the PoW gate and rate limiter hold? |
| Integration tests | `internal/` has no test that exercises crawl → indexer → search in one shot. Add one. |

### Platform testing

Doogle is only verified on macOS. Reports and fixes for these platforms are very welcome:

- Linux amd64 / arm64 (likely works, not confirmed)
- Windows (Makefile is Unix-only — needs a `Makefile.win` or PowerShell equivalent)
- Android / Termux

### Deployment hardening

- `systemd` unit file for Linux
- HTTPS/TLS on the API server (port 7002 is plain HTTP)
- Production tuning guide (worker count, rate limits, index size thresholds)

### Good first issues (lower effort)

- Add a `--log-level` flag (currently hardcoded to tint logger defaults)
- Add response-time headers to the API
- Write a seed URL list for bootstrapping a fresh node
- Test the `doogle dump` / `doogle restore` backup cycle and document edge cases

---

## Security

If you find a security vulnerability, please **do not open a public issue**. See [SECURITY.md](SECURITY.md) for responsible disclosure instructions.
