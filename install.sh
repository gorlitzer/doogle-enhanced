#!/bin/sh
# Doogle installer — downloads the latest release binary for your platform.
# Usage:
#   GITHUB_TOKEN=ghp_... sh install.sh
#   curl -fsSL <url>/install.sh | GITHUB_TOKEN=ghp_... sh
set -e

REPO_OWNER="gorlitzer"
REPO_NAME="doogle-enhanced"
API_BASE="https://api.github.com"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
TOKEN_DIR="${HOME}/.doogle"
TOKEN_FILE="${TOKEN_DIR}/token"

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

# ---- Token resolution ----

resolve_token() {
    # 1. Environment variable
    if [ -n "${GITHUB_TOKEN}" ]; then
        echo "${GITHUB_TOKEN}"
        return
    fi

    # 2. Token file
    if [ -f "${TOKEN_FILE}" ]; then
        TOKEN=$(cat "${TOKEN_FILE}" | tr -d '[:space:]')
        if [ -n "${TOKEN}" ]; then
            echo "${TOKEN}"
            return
        fi
    fi

    # 3. Interactive prompt
    printf "GitHub token (ghp_...): " >&2
    read -r TOKEN
    [ -z "${TOKEN}" ] && die "token is required for private repo access"

    # Save for future use
    mkdir -p "${TOKEN_DIR}"
    echo "${TOKEN}" > "${TOKEN_FILE}"
    chmod 600 "${TOKEN_FILE}"
    echo "Token saved to ${TOKEN_FILE}" >&2

    echo "${TOKEN}"
}

# ---- Main ----

main() {
    OS=$(detect_os)
    ARCH=$(detect_arch)
    ASSET_NAME="doogle-${OS}-${ARCH}"

    echo "Doogle installer"
    echo "  Platform: ${OS}/${ARCH}"
    echo ""

    TOKEN=$(resolve_token)

    # Fetch latest release
    echo "Fetching latest release..."
    RELEASE_JSON=$(curl -fsSL \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "${API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest") \
        || die "failed to fetch release info (check your token)"

    TAG=$(echo "${RELEASE_JSON}" | grep -o '"tag_name":"[^"]*"' | head -1 | cut -d'"' -f4)
    [ -z "${TAG}" ] && die "could not determine latest version"
    echo "Latest version: ${TAG}"

    # Find asset ID
    ASSET_ID=$(echo "${RELEASE_JSON}" | \
        grep -B2 "\"name\":\"${ASSET_NAME}\"" | \
        grep '"id":' | head -1 | \
        grep -o '[0-9]*')
    [ -z "${ASSET_ID}" ] && die "no binary found for ${ASSET_NAME}"

    # Download via API URL (required for private repos)
    TMPFILE=$(mktemp)
    echo "Downloading ${ASSET_NAME}..."
    curl -fsSL \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Accept: application/octet-stream" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        -o "${TMPFILE}" \
        "${API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/releases/assets/${ASSET_ID}" \
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
