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
    echo "Example: $0 0 1"
    echo "Example: $0 1 1"
    exit 1
}

[[ $# -eq 2 ]] || usage

for arg in "$@"; do
    [[ "$arg" == "0" || "$arg" == "1" ]] || usage
done

BUILD_LINUX="$1"
BUILD_WINDOWS="$2"

if [[ "$BUILD_LINUX" != "1" && "$BUILD_WINDOWS" != "1" ]]; then
    die "Nothing to build."
fi

SPEC="$ROOT/storelimitless-backend.spec"
REQUIREMENTS="$ROOT/requirements.txt"
FRONTEND="$ROOT/frontend"
FRONTEND_DIST="$FRONTEND/dist"

command -v python3 >/dev/null 2>&1 \
    || die "python3 is required."

command -v file >/dev/null 2>&1 \
    || die "'file' is required."

command -v npm >/dev/null 2>&1 \
    || die "npm is required to build the frontend."

[[ -f "$SPEC" ]] || die "Missing PyInstaller spec: $SPEC"
[[ -f "$REQUIREMENTS" ]] || die "Missing requirements.txt"
[[ -f "$FRONTEND/package.json" ]] || die "Missing frontend/package.json"

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

(
    cd "$FRONTEND"

    if [[ -f package-lock.json ]]; then
        npm ci
    else
        npm install
    fi

    npm run build
)

[[ -f "$FRONTEND_DIST/index.html" ]] \
    || die "Frontend build failed: frontend/dist/index.html not found."

echo "==> Frontend build ready: $FRONTEND_DIST"

mkdir -p "$ROOT/build" "$ROOT/dist/linux" "$ROOT/dist/windows"
mkdir -p "$ROOT/releases/linux" "$ROOT/releases/windows"
mkdir -p "$ROOT/api/src/storelimitless/bin/linux"
mkdir -p "$ROOT/api/src/storelimitless/bin/windows"

# --------------------------------------------------
# Linux server
# --------------------------------------------------

if [[ "$BUILD_LINUX" == "1" ]]; then
    echo
    echo "==> Building Linux server"

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
        || die "Linux executable was not generated. Check the executable name in the PyInstaller spec."

    file "$LINUX_BINARY" | grep -q 'ELF .* executable' \
        || die "Linux output is not an ELF executable."

    LINUX_RELEASE="$ROOT/releases/linux/StoreLimitlessServer_$VERSION"
    LINUX_BIN="$ROOT/api/src/storelimitless/bin/linux/StoreLimitlessServer_$VERSION"

    cp "$LINUX_BINARY" "$LINUX_RELEASE"
    cp "$LINUX_BINARY" "$LINUX_BIN"

    chmod +x "$LINUX_RELEASE" "$LINUX_BIN"

    echo "==> Linux executable ready:"
    echo "$LINUX_RELEASE"
    echo "$LINUX_BIN"
fi

# --------------------------------------------------
# Windows server
# Build Windows Python/PyInstaller using Wine.
# --------------------------------------------------

if [[ "$BUILD_WINDOWS" == "1" ]]; then
    echo
    echo "==> Building Windows server using Wine"

    command -v wine >/dev/null 2>&1 \
        || command -v wine64 >/dev/null 2>&1 \
        || die "Wine is required. Install Wine before building the Windows server."

    command -v wineboot >/dev/null 2>&1 \
        || die "wineboot is required."

    command -v winepath >/dev/null 2>&1 \
        || die "winepath is required."

    command -v wget >/dev/null 2>&1 \
        || die "wget is required to download Windows Python."

    if command -v wine >/dev/null 2>&1; then
        WINE_BIN="wine"
    else
        WINE_BIN="wine64"
    fi

    export WINEDEBUG=-all
    export WINEDLLOVERRIDES="mscoree,mshtml="

    export WINEPREFIX="$ROOT/build/wine-windows"
    export WINEARCH=win64

    mkdir -p "$WINEPREFIX"

    if [[ ! -f "$WINEPREFIX/system.reg" ]]; then
        echo "==> Initializing 64-bit Wine prefix"

        "$WINE_BIN" wineboot --init \
            || die "Could not initialize the Wine prefix."
    fi

    "$WINE_BIN" wineboot --wait >/dev/null 2>&1 || true

    WINDOWS_PYTHON="$WINEPREFIX/drive_c/StoreLimitlessPython/python.exe"
    PYTHON_VERSION="3.13.7"
    PYTHON_INSTALLER="$ROOT/build/python-${PYTHON_VERSION}-amd64.exe"
    PYTHON_URL="https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-amd64.exe"

    if [[ ! -f "$WINDOWS_PYTHON" ]]; then
        echo "==> Downloading Windows Python $PYTHON_VERSION"

        wget -q --show-progress "$PYTHON_URL" \
            -O "$PYTHON_INSTALLER"

        [[ -s "$PYTHON_INSTALLER" ]] \
            || die "Windows Python installer download failed."

        file "$PYTHON_INSTALLER" | grep -qi 'PE32' \
            || die "Downloaded Python installer is not a Windows executable."

        echo "==> Installing Windows Python"

        "$WINE_BIN" "$PYTHON_INSTALLER" \
            /quiet \
            InstallAllUsers=0 \
            TargetDir='C:\StoreLimitlessPython' \
            PrependPath=0 \
            Include_pip=1 \
            Include_test=0 \
            || die "Windows Python installation failed."

        "$WINE_BIN" wineboot --wait >/dev/null 2>&1 || true
    fi

    [[ -f "$WINDOWS_PYTHON" ]] \
        || die "Windows Python was not found after installation."

    echo "==> Windows Python:"
    "$WINE_BIN" "$WINDOWS_PYTHON" --version

    # Wine installations can complete without making pip available, even when
    # Include_pip=1 was requested. Bootstrap it before installing dependencies.
    if ! "$WINE_BIN" "$WINDOWS_PYTHON" -m pip --version >/dev/null 2>&1; then
        echo "==> pip is missing; attempting to bootstrap it with ensurepip"
        "$WINE_BIN" "$WINDOWS_PYTHON" -m ensurepip --upgrade || true
    fi

    if ! "$WINE_BIN" "$WINDOWS_PYTHON" -m pip --version >/dev/null 2>&1; then
        echo "==> ensurepip did not provide pip; downloading get-pip.py"
        GET_PIP="$ROOT/build/get-pip.py"
        GET_PIP_URL="https://bootstrap.pypa.io/get-pip.py"

        wget -q --show-progress "$GET_PIP_URL" -O "$GET_PIP" \
            || die "Could not download get-pip.py."

        [[ -s "$GET_PIP" ]] || die "get-pip.py download was empty."

        GET_PIP_WINDOWS="$(winepath -w "$GET_PIP")"
        "$WINE_BIN" "$WINDOWS_PYTHON" "$GET_PIP_WINDOWS" \
            || die "Could not bootstrap pip for Windows Python."
    fi

    "$WINE_BIN" "$WINDOWS_PYTHON" -m pip --version \
        || die "pip is still unavailable in the Windows Python installation."

    echo "==> Installing Windows Python dependencies"
    "$WINE_BIN" "$WINDOWS_PYTHON" -m pip install --upgrade pip

    WINDOWS_REQUIREMENTS="$(winepath -w "$REQUIREMENTS")"

    "$WINE_BIN" "$WINDOWS_PYTHON" -m pip install \
        -r "$WINDOWS_REQUIREMENTS"

    "$WINE_BIN" "$WINDOWS_PYTHON" -m pip install pyinstaller

    echo "==> Windows PyInstaller:"
    "$WINE_BIN" "$WINDOWS_PYTHON" -m PyInstaller --version

    rm -rf "$ROOT/build/pyi-windows" "$ROOT/dist/windows"
    mkdir -p "$ROOT/dist/windows"

    WINDOWS_SPEC="$(winepath -w "$SPEC")"
    WINDOWS_WORKPATH="$(winepath -w "$ROOT/build/pyi-windows")"
    WINDOWS_DISTPATH="$(winepath -w "$ROOT/dist/windows")"

    echo "==> Running Windows PyInstaller"

    "$WINE_BIN" "$WINDOWS_PYTHON" -m PyInstaller \
        --clean \
        --noconfirm \
        --workpath "$WINDOWS_WORKPATH" \
        --distpath "$WINDOWS_DISTPATH" \
        "$WINDOWS_SPEC"

    WINDOWS_BINARY="$ROOT/dist/windows/StoreLimitlessServer.exe"

    [[ -f "$WINDOWS_BINARY" ]] \
        || die "Windows executable was not generated. Check the executable name in the PyInstaller spec."

    file "$WINDOWS_BINARY" | grep -qi 'PE32' \
        || die "Windows output is not a Windows executable."

    WINDOWS_RELEASE="$ROOT/releases/windows/StoreLimitlessServer_$VERSION.exe"
    WINDOWS_BIN="$ROOT/api/src/storelimitless/bin/windows/StoreLimitlessServer_$VERSION.exe"

    cp "$WINDOWS_BINARY" "$WINDOWS_RELEASE"
    cp "$WINDOWS_BINARY" "$WINDOWS_BIN"

    echo "==> Windows executable ready:"
    echo "$WINDOWS_RELEASE"
    echo "$WINDOWS_BIN"
fi

echo
echo "========================================"
echo "Build complete"
echo "========================================"

echo
echo "==> Linux releases:"
find "$ROOT/releases/linux" -maxdepth 1 -type f -print

echo
echo "==> Windows releases:"
find "$ROOT/releases/windows" -maxdepth 1 -type f -print

echo
echo "==> SDK server binaries:"
find "$ROOT/api/src/storelimitless/bin" -maxdepth 2 -type f -print

# --------------------------------------------------
# Remove artifacts that this script can regenerate.
# Keep release executables and SDK-bundled binaries.
# This runs only after a successful build, so failed builds retain logs
# and intermediate files to help diagnose the failure.
# --------------------------------------------------

echo
echo "==> Removing temporary build artifacts"

rm -rf -- \
    "$ROOT/build" \
    "$ROOT/dist/linux" \
    "$ROOT/dist/windows" \
    "$FRONTEND/node_modules" \
    "$FRONTEND_DIST"

# Remove the temporary dist parent only if it is now empty.
rmdir "$ROOT/dist" 2>/dev/null || true

# Remove Python bytecode caches generated while importing project modules.
# Preserve virtual environments and Git metadata; their caches are not project artifacts.
echo "==> Removing Python bytecode caches"
find "$ROOT" \
    -type d \( -name .git -o -name .venv -o -name venv -o -name node_modules \) -prune -o \
    -type d -name '__pycache__' -prune -exec rm -rf -- {} +
find "$ROOT" \
    -type d \( -name .git -o -name .venv -o -name venv -o -name node_modules \) -prune -o \
    -type f \( -name '*.pyc' -o -name '*.pyo' \) -exec rm -f -- {} +

echo "==> Removed build/, dist/linux, dist/windows, frontend/node_modules, frontend/dist"
echo "==> Removed project __pycache__, .pyc, and .pyo files"
echo "==> Keeping releases/, api/src/storelimitless/bin/, and virtual environments"
echo "==> Build artifacts cleanup complete"

# The log is useful when the build fails, but not needed after a successful build.
# Remove it last because tee is still writing this shell's output to the log.
rm -f -- "$ROOT/build.log"
