# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Doogle, please report it responsibly.

**Do NOT open a public issue.**

Instead, email security concerns to: **security@doogle.dev** (or open a private security advisory on GitHub).

Please include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix timeline**: Depends on severity, but critical issues are prioritized

## Scope

The following are in scope:

- Doogle node binary (`cmd/doogle/`)
- HTTP API (`internal/api/`)
- P2P protocols (`internal/p2p/`)
- Crawler (`internal/crawler/`)
- Web frontend (`web/static/`)

## Out of Scope

- Third-party dependencies (report upstream)
- Issues in user-modified configurations
- Denial of service via expected resource usage (e.g., crawling large sites)

## Supported Versions

Only the latest release is supported with security updates.

## Disclosure Policy

We follow coordinated disclosure. After a fix is released, we will:

1. Credit the reporter (unless they prefer anonymity)
2. Publish a security advisory on GitHub
3. Include details in the release notes
