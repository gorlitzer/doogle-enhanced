#!/bin/sh
# Doogle installer — downloads the latest release binary for your platform.
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/gorlitzer/doogle-enhanced/main/install.sh | sh
set -e

REPO_OWNER="gorlitzer"
REPO_NAME="doogle-enhanced"
API_BASE="https://api.github.com"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"

# ---- Helpers ----

die() { echo "error: $*" >&2; exit 1; }

detect_os() {
    case "$(uname -s)" in
        Darwin) echo "darwin" ;;
        Linux)  echo "linux"  ;;
        *)      die "unsupported OS: $(uname -s)" ;;
    esac
}

detect_arch() {
    case "$(uname -m)" in
        x86_64|amd64)       echo "amd64" ;;
        aarch64|arm64)      echo "arm64" ;;
        *)                  die "unsupported architecture: $(uname -m)" ;;
    esac
}

# ---- Main ----

main() {
    OS=$(detect_os)
    ARCH=$(detect_arch)
    ASSET_NAME="doogle-${OS}-${ARCH}"

    echo "Doogle installer"
    echo "  Platform: ${OS}/${ARCH}"
    echo ""

    # Fetch latest release
    echo "Fetching latest release..."
    RELEASE_JSON=$(curl -fsSL \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "${API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest") \
        || die "failed to fetch release info"

    TAG=$(echo "${RELEASE_JSON}" | grep -o '"tag_name":"[^"]*"' | head -1 | cut -d'"' -f4)
    [ -z "${TAG}" ] && die "could not determine latest version"
    echo "Latest version: ${TAG}"

    # Find download URL for the asset
    DOWNLOAD_URL=$(echo "${RELEASE_JSON}" | \
        grep -o "\"browser_download_url\":\"[^\"]*${ASSET_NAME}\"" | \
        head -1 | cut -d'"' -f4)
    [ -z "${DOWNLOAD_URL}" ] && die "no binary found for ${ASSET_NAME}"

    # Download binary
    TMPFILE=$(mktemp)
    echo "Downloading ${ASSET_NAME}..."
    curl -fsSL -o "${TMPFILE}" "${DOWNLOAD_URL}" \
        || { rm -f "${TMPFILE}"; die "download failed"; }

    chmod +x "${TMPFILE}"

    # Install
    if [ -w "${INSTALL_DIR}" ]; then
        mv "${TMPFILE}" "${INSTALL_DIR}/doogle"
    else
        echo "Installing to ${INSTALL_DIR} (requires sudo)..."
        sudo mv "${TMPFILE}" "${INSTALL_DIR}/doogle"
    fi

    echo ""
    echo "Installed doogle ${TAG} to ${INSTALL_DIR}/doogle"

    # Verify
    if command -v doogle >/dev/null 2>&1; then
        doogle version
    else
        echo ""
        echo "Note: ${INSTALL_DIR} may not be in your PATH."
        echo "Add it with: export PATH=\"${INSTALL_DIR}:\$PATH\""
    fi
}

main
