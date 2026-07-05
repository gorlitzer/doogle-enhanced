<p align="center">
  <img src="web/static/img/banner.png" alt="Doogle — Search everything. Own the network." width="100%" />
</p>

<h1 align="center">Doogle</h1>

<p align="center">
  <strong>Your own search engine. No Google. No tracking. No middleman.</strong><br>
  Run a node, connect to peers, search the web — together.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/go-1.22+-00ADD8?logo=go&logoColor=white" alt="Go 1.22+" />
  <img src="https://img.shields.io/badge/built%20with-Claude%20AI-blueviolet" alt="Built with Claude AI" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" />
  <img src="https://img.shields.io/badge/status-alpha-orange" alt="Alpha" />
</p>

---

> ### 🤖 Built with AI — fully transparent about it
>
> **This entire codebase was written by Claude (Anthropic).** Not "AI-assisted" — AI-written. We came up with the idea, directed the architecture, reviewed the output, and steered the decisions. Claude wrote the code. Every package, every file, every function — generated through a series of prompting sessions where we described what we wanted and iterated until it worked.
>
> We're putting this at the top because burying it would be dishonest. If you're evaluating the code: expect LLM patterns, some over-engineering, and corners that haven't been battle-tested. If you think AI-written code is inherently bad: we'd love for you to prove us wrong by finding the bugs and fixing them. If you think this is the future of how software gets built: welcome, you're home.
>
> **The humans behind this:** we got sick of Google — degraded results, ads everywhere, every query tracked and monetized. We ranted about it, then decided to build an alternative instead of just complaining. Two people, one AI, one sprint. This is what came out.

---

Doogle is a **decentralized search engine** — a single app you run on your machine that crawls the web, indexes pages locally, and shares results with other Doogle nodes. No central server. No ads. No one watching your queries.

## Get Started in 3 Commands

```bash
git clone https://github.com/gorlitzer/doogle-enhanced.git
cd doogle-enhanced
make setup && make run
```

Open **[http://localhost:7002](http://localhost:7002)** — the setup wizard walks you through the rest.

> **Just want the binary?**
> ```bash
> curl -fsSL https://raw.githubusercontent.com/gorlitzer/doogle-enhanced/main/install.sh | sh
> doogle
> ```

### Docker

```bash
docker compose up -d
```

---

## What It Does

| | |
|--|--|
| 🔍 **Search** | Type a query, get results from your local index + connected peers. Supports `site:`, `lang:`, `filetype:`, boolean operators, spelling correction, and more. |
| 🕷️ **Crawl** | Point it at seed URLs and it crawls the web — respects robots.txt, handles JavaScript pages, extracts PDFs and documents. |
| 🌐 **P2P network** | Your node automatically finds other Doogle nodes on the internet. No manual setup. Crawl work is split across peers so nobody duplicates effort. *(Heads-up: participating in the public P2P network reveals your node's IP address to peers — see [Privacy](#privacy) below.)* |
| 🤖 **Smart ranking** | Results are ranked by quality, freshness, trust, and relevance — not by who paid. Optional neural search via [Ollama](https://ollama.com). |
| 🛡️ **Trust & safety** | Peer reputation system, spam reporting, Sybil resistance, consensus-based domain blocking. |
| ⚙️ **Admin dashboard** | Live crawl feed, network graph, stats, 6 themes, full node control — all in the browser. |

---

## Add a Second Node

Every extra node you run expands the network. Nodes find each other automatically:

```bash
./bin/doogle --port 7003 --api-port 7004 --data-dir ./data/node2
```

No bootstrap config needed — they'll discover each other within ~60 seconds.

---

## Neural Search (Optional)

For true semantic search ("car" also finds "automobile"):

```bash
ollama pull all-minilm
./bin/doogle --ollama
```

Without `--ollama`, search still works great for keyword queries.

---

## Current State — Honest Assessment

We shipped this before it was "finished." Here's exactly where things stand:

| Area | State | Notes |
|------|-------|-------|
| Crawl → index → search | ✅ Works | Core pipeline is solid |
| P2P discovery & routing | ✅ Works | Auto-discovers via IPFS public DHT |
| Trust & safety system | ⚠️ Code complete | Zero adversarial testing done |
| LTR ranking model | ⚠️ Code complete | Needs real click data — blind without production traffic |
| Neural search quality | ⚠️ Works | Quality vs TF-IDF unvalidated at scale |
| 50+ node stress test | ❌ Never done | DHT routing untested at real scale |
| Integration tests | ❌ Missing | Only unit tests — no full pipeline test |
| Dark web / Tor | ❌ Not started | Design only, blocked on legal review |
| Linux / Windows / Android | ⚠️ Unverified | Compiles cross-platform, not confirmed running |

---

## Help Us Build It

We ran out of time and handed it to the community. **You're welcome here** — coder, vibe-coder, first-timer, or bot. No gatekeeping.

### Where to start

- **Run it on Linux or Windows** and report what breaks
- **Stress test P2P** — spin up 10+ nodes and watch it fail
- **Write an integration test** for the full crawl→index→search pipeline
- **Add HTTPS** to the API server (currently HTTP-only, risky for public nodes)
- **Add a `systemd` service file** for Linux deployments
- **Test backup/restore** (`doogle dump` / `doogle restore`) end-to-end
- **Adversarial trust testing** — simulate a Sybil attack, does the PoW gate hold?

→ Full breakdown in [CONTRIBUTING.md](CONTRIBUTING.md)

---

## Docs

| | |
|--|--|
| [Running a Node](docs/running-a-node.md) | Setup, config flags, monitoring, troubleshooting |
| [API Reference](docs/api-reference.md) | All HTTP endpoints |
| [Architecture](docs/architecture.md) | How it works under the hood |
| [Fleet Management](docs/fleet.md) | Running multiple nodes together |
| [Developer Guide](docs/developer-guide.md) | Contributing, building, testing |
| [Roadmap](docs/roadmap.md) | What's done, what's in progress, what's planned |

---

## Third-Party Data

Uses GeoLite2 data by MaxMind (not bundled — run `make geoip` to download). Subject to [MaxMind's EULA](https://www.maxmind.com/en/geolite2/eula).

## Privacy

We're transparent about this: **"no tracking" means Doogle doesn't log, profile, or monetize your searches — it does *not* mean network-level anonymity.**

Running a node on the public P2P network **reveals your IP address to peers.** That's inherent to peer-to-peer: to trade search results or crawl work, peers connect to your node and therefore see its address. By default the node also advertises itself into the public IPFS DHT and tries to open a reachable port.

You can *reduce* (not eliminate) this with `--dht-client-mode`, a VPN, or by running from an IP you don't mind revealing. Onion routing (Tor) is a roadmap goal but **not implemented today** — don't assume anonymity. Full details: [Privacy in the node guide](docs/running-a-node.md#-privacy-your-node-reveals-its-ip-address-to-peers).

## Security

Found a vulnerability? See [SECURITY.md](SECURITY.md) — please don't open a public issue.

## License

[MIT](LICENSE)
