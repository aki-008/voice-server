#!/usr/bin/env bash
set -euo pipefail

# Resolve the project from this script's own location so it works from any
# checkout path (this repo lives in "Voice server", not $HOME/voice-server)
# and from any current working directory.
PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

usage() {
    cat <<'EOF'
Usage: ./start_server.sh [--language <code>]

  --language <code>  Default transcription language: a BCP-47 code such as
                     en-US or es-ES, or "auto" to let the model detect it.
                     Equivalent to setting STT_LANGUAGE. `nemo-speech serve`
                     has no language flag, so the value is applied per session
                     via session.update; the client UI can override it.
EOF
}

LANGUAGE=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --language|-l)
            if [[ $# -lt 2 || -z "$2" ]]; then
                echo "Error: --language requires a value." >&2
                exit 1
            fi
            LANGUAGE="$2"
            shift 2
            ;;
        --language=*)
            LANGUAGE="${1#*=}"
            if [[ -z "$LANGUAGE" ]]; then
                echo "Error: --language requires a value." >&2
                exit 1
            fi
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Error: unknown argument: $1" >&2
            usage >&2
            exit 1
            ;;
    esac
done

if [[ -n "$LANGUAGE" ]]; then
    export STT_LANGUAGE="$LANGUAGE"
fi

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
if [[ -n "$LANGUAGE" ]]; then
    echo "Default transcription language: $LANGUAGE"
fi
exec npm run dev:server
