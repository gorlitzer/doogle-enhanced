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

## Security

If you find a security vulnerability, please **do not open a public issue**. See [SECURITY.md](SECURITY.md) for responsible disclosure instructions.
