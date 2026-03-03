# Contributing to Doogle

## Getting Started

### 1. GitHub Token

You need a personal access token to pull releases from the private repo.

1. Go to **https://github.com/settings/tokens**
2. Click **Generate new token (classic)**
3. Select the `repo` scope
4. Copy the token

Save it on your machine:

```sh
mkdir -p ~/.doogle
echo 'ghp_YOUR_TOKEN' > ~/.doogle/token
chmod 600 ~/.doogle/token
```

Or export it as an environment variable:

```sh
export GITHUB_TOKEN=ghp_YOUR_TOKEN
```

### 2. Install Doogle

**Option A — Install script (recommended):**

```sh
sh install.sh
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

### 3. Run

```sh
doogle                                    # if installed via install.sh
./bin/doogle                              # if built from source
./bin/doogle --seed "https://example.com" # with initial seed URLs
```

Open http://localhost:7002 — the setup wizard walks you through the rest.

### 4. Update

```sh
doogle update           # download + replace with latest release
doogle update --check   # just check if an update is available
```

### 5. Check Version

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
```

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
