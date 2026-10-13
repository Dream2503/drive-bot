#!/usr/bin/env bash

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="${VERSION:-0.1.0}"

exec > >(tee "$ROOT/build.log") 2>&1

die() {
    echo "ERROR: $*" >&2
    exit 1
}

usage() {
    echo "Usage: $0 <linux_server:0|1> <windows_server:0|1>"
    echo "Example: $0 1 0"
    echo "Example: $0 1 1"
    exit 1
}

[[ $# -eq 2 ]] || usage

for arg in "$@"; do
    [[ "$arg" == "0" || "$arg" == "1" ]] || usage
done

BUILD_LINUX="$1"
BUILD_WINDOWS="$2"

[[ "$BUILD_LINUX" == "1" || "$BUILD_WINDOWS" == "1" ]] \
    || die "Nothing to build."

SPEC="$ROOT/storelimitless-backend.spec"
REQUIREMENTS="$ROOT/requirements.txt"
FRONTEND="$ROOT/frontend"

[[ -f "$SPEC" ]] || die "Missing PyInstaller spec: $SPEC"
[[ -f "$REQUIREMENTS" ]] || die "Missing requirements.txt"
[[ -f "$FRONTEND/package.json" ]] || die "Missing frontend/package.json"

command -v npm >/dev/null 2>&1 \
    || die "Node.js and npm are required to build the frontend."

mkdir -p "$ROOT/build" "$ROOT/releases/linux" "$ROOT/releases/windows"

echo "========================================"
echo "StoreLimitless Server Build"
echo "Version: $VERSION"
echo "Linux server:   $BUILD_LINUX"
echo "Windows server: $BUILD_WINDOWS"
echo "========================================"

# --------------------------------------------------
# Build frontend
# --------------------------------------------------

echo
echo "==> Building React frontend"

cd "$FRONTEND"

if [[ ! -d node_modules ]]; then
    npm ci || npm install
fi

npm run build

cd "$ROOT"

[[ -f "$FRONTEND/dist/index.html" ]] \
    || die "Frontend build failed: frontend/dist/index.html not found."

echo "==> Frontend build complete"

# --------------------------------------------------
# Linux server
# --------------------------------------------------

if [[ "$BUILD_LINUX" == "1" ]]; then
    echo
    echo "==> Building Linux server"

    command -v python3 >/dev/null 2>&1 \
        || die "python3 is required."
    command -v file >/dev/null 2>&1 \
        || die "'file' is required."

    LINUX_VENV="$ROOT/build/venv-linux"

    python3 -m venv "$LINUX_VENV"
    "$LINUX_VENV/bin/python" -m pip install --upgrade pip
    "$LINUX_VENV/bin/python" -m pip install -r "$REQUIREMENTS"
    "$LINUX_VENV/bin/python" -m pip install pyinstaller

    rm -rf "$ROOT/build/pyi-linux" "$ROOT/dist/linux"
    mkdir -p "$ROOT/dist/linux"

    "$LINUX_VENV/bin/python" -m PyInstaller \
        --clean \
        --noconfirm \
        --workpath "$ROOT/build/pyi-linux" \
        --distpath "$ROOT/dist/linux" \
        "$SPEC"

    LINUX_BINARY="$ROOT/dist/linux/StoreLimitlessServer"

    [[ -f "$LINUX_BINARY" ]] \
        || die "Linux executable was not generated."

    file "$LINUX_BINARY" | grep -q 'ELF .* executable' \
        || die "Linux output is not an ELF executable."

    LINUX_RELEASE="$ROOT/releases/linux"
    cp "$LINUX_BINARY" "$LINUX_RELEASE/StoreLimitlessServer_$VERSION"
    chmod +x "$LINUX_RELEASE/StoreLimitlessServer_$VERSION"

    echo "==> Linux executable ready:"
    echo "$LINUX_RELEASE/StoreLimitlessServer_$VERSION"
fi

# --------------------------------------------------
# Windows server
# Build this on Windows or use a verified Windows
# Python/PyInstaller build environment.
# --------------------------------------------------

if [[ "$BUILD_WINDOWS" == "1" ]]; then
    echo
    echo "==> Building Windows server"

    if [[ "$(uname -s)" != MINGW* && "$(uname -s)" != MSYS* && "$(uname -s)" != CYGWIN* ]]; then
        die "Build the Windows executable on Windows with Windows Python/PyInstaller. A Linux PyInstaller build cannot produce a Windows executable."
    fi

    command -v python >/dev/null 2>&1 \
        || die "Windows Python is required."
    command -v file >/dev/null 2>&1 \
        || die "'file' is required."

    python -m pip install --upgrade pip
    python -m pip install -r "$REQUIREMENTS"
    python -m pip install pyinstaller

    rm -rf "$ROOT/build/pyi-windows" "$ROOT/dist/windows"
    mkdir -p "$ROOT/dist/windows"

    python -m PyInstaller \
        --clean \
        --noconfirm \
        --workpath "$ROOT/build/pyi-windows" \
        --distpath "$ROOT/dist/windows" \
        "$SPEC"

    WINDOWS_BINARY="$ROOT/dist/windows/storelimitless-backend.exe"

    [[ -f "$WINDOWS_BINARY" ]] \
        || die "Windows executable was not generated."

    file "$WINDOWS_BINARY" | grep -qi 'PE32' \
        || die "Windows output is not a Windows executable."

    WINDOWS_RELEASE="$ROOT/releases/windows"
    cp "$WINDOWS_BINARY" "$WINDOWS_RELEASE/StoreLimitlessServer_$VERSION.exe"

    echo "==> Windows executable ready:"
    echo "$WINDOWS_RELEASE/StoreLimitlessServer_$VERSION.exe"
fi

echo
echo "========================================"
echo "Build complete"
echo "========================================"

find "$ROOT/releases" -maxdepth 1 -type d -print
find "$ROOT/releases/linux" "$ROOT/releases/windows" -maxdepth 1 -type f -print
