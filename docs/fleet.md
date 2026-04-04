# Fleet Management

Every Doogle node is **fleet-ready by default** — it runs as a coordinator out of the box with zero extra config. If you never add workers, it behaves exactly like a normal standalone node with no overhead. When you're ready to scale, just point workers at it.

**Why?** If you're running multiple nodes across different servers, you don't want to SSH into each one to check status. Your node's built-in fleet dashboard shows all workers, their stats, and lets you access each worker's full admin UI through a secure tunnel.

**How it works:** Your node acts as a secure reverse proxy into each worker's local API. Workers bind their HTTP port to `127.0.0.1` (not reachable from the network). The only way to reach a worker remotely is through the coordinator's encrypted libp2p tunnel. All communication is signed with a shared fleet secret using HMAC-SHA256.

## Adding Workers

```bash
# 1. Start your node (fleet secret is in the logs + data/fleet.secret)
make run

# 2. On another machine, start a worker (use the secret from step 1)
make run ARGS='--fleet-role worker --fleet-coordinator /ip4/<YOUR_IP>/tcp/7001/p2p/<PEER_ID> --fleet-secret <hex> --port 7003 --api-port 7004 --data-dir ./data/worker1'

# 3. Open your node's UI → Admin → Actions → Fleet section for credentials
#    Or Admin → Fleet for the live worker dashboard
```

## CLI Flags

| Flag | Description |
|------|-------------|
| `--fleet-role` | `coordinator` (default), `worker`, or `standalone` (disables fleet) |
| `--fleet-coordinator` | Coordinator multiaddr (required for workers) |
| `--fleet-secret` | Shared secret hex (auto-generated if omitted) |

## Security Layers

| Layer | Protection |
|-------|-----------|
| Fleet Secret | 256-bit HMAC-SHA256 signs all fleet messages |
| API Token | Derived bearer token required on all `/api/fleet/*` endpoints |
| Localhost Token | Fleet API token is only returned to localhost requests — never exposed over the network |
| Transport | End-to-end encrypted libp2p streams (Noise/TLS) |
| Identity | Coordinator and workers verify each other's peer IDs |
| Binding | Workers auto-bind API to `127.0.0.1` in fleet mode |
| Backup Safety | `fleet.secret` is excluded from `/api/admin/dump` backups |
