#!/usr/bin/env bash
set -euo pipefail

# Resolve the project from this script's own location so it works from any
# checkout path (this repo lives in "Voice server", not $HOME/voice-server)
# and from any current working directory.
PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f "$PROJECT_DIR/package.json" ]]; then
    echo "Error: package.json not found in $PROJECT_DIR." >&2
    exit 1
fi

for bin in node npm; do
    if ! command -v "$bin" > /dev/null 2>&1; then
        echo "Error: $bin is not installed or not in your PATH." >&2
        exit 1
    fi
done

cd "$PROJECT_DIR"

# Only install when the dependency tree is missing or older than the manifests.
needs_install() {
    local stamp="node_modules/.package-lock.json"

    [[ -d node_modules ]] || return 0
    [[ -f "$stamp" ]] || stamp="node_modules" # npm < 7 has no stamp file

    [[ package.json -nt "$stamp" ]] && return 0
    [[ -f package-lock.json && package-lock.json -nt "$stamp" ]] && return 0
    return 1
}

if needs_install; then
    echo "Installing dependencies in $PROJECT_DIR..."
    if ! npm install --no-audit --no-fund; then
        echo "Error: npm install failed." >&2
        exit 1
    fi
    echo "Dependencies installed."
else
    echo "Dependencies are up to date."
fi

echo "Starting server..."
echo "open port http://127.0.0.1:8080/"
exec npm run dev:server
