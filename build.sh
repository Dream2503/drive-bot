#!/usr/bin/env bash
clear
set -euo pipefail
exec > >(tee build.log) 2>&1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() {
    echo "ERROR: $*" >&2
    exit 1
}

usage() {
    cat >&2 <<EOF
Usage: $(basename "$0") <linux_server:0|1> <linux_app:0|1> <windows_server:0|1> <windows_app:0|1>

  arg1  Linux server    (PyInstaller backend for Linux)
  arg2  Linux app       (Tauri .deb, needs the Linux backend)
  arg3  Windows server  (PyInstaller backend for Windows, via Wine)
  arg4  Windows app     (Tauri NSIS installer, needs the Windows backend)

Pass 1 to build a component, 0 to skip it. Example:

  $(basename "$0") 1 1 0 0    # build Linux server + Linux app only
  $(basename "$0") 0 1 0 0    # build Linux app only (reuses last built Linux server)
  $(basename "$0") 1 1 1 1    # build everything
EOF
    exit 1
}

newest_match() {
    local dir="$1" name="$2"
    find "$dir" -maxdepth 1 -type f -name "$name" -printf '%T@ %p\n' 2>/dev/null \
        | sort -rn \
        | head -1 \
        | cut -d' ' -f2-
}

require_file() {
    [ -f "$1" ] || die "required file not found: $1"
}

version_ge() {
    [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" = "$2" ]
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

[ "$#" -eq 4 ] || usage

for arg in "$@"; do
    case "$arg" in
        0|1) ;;
        *) usage ;;
    esac
done

BUILD_LINUX_SERVER="$1"
BUILD_LINUX_APP="$2"
BUILD_WINDOWS_SERVER="$3"
BUILD_WINDOWS_APP="$4"

if [ "$BUILD_LINUX_SERVER" = 0 ] && [ "$BUILD_LINUX_APP" = 0 ] \
    && [ "$BUILD_WINDOWS_SERVER" = 0 ] && [ "$BUILD_WINDOWS_APP" = 0 ]; then
    die "nothing to build — all four flags are 0."
fi

NEED_LINUX_TOOLCHAIN=0    # rust/node/tauri needed for linux app
NEED_WINDOWS_TOOLCHAIN=0  # rust/node/tauri/xwin needed for windows app
NEED_WINE=0                # wine needed for windows server (pyinstaller under wine)

[ "$BUILD_LINUX_APP" = 1 ] && NEED_LINUX_TOOLCHAIN=1
[ "$BUILD_WINDOWS_APP" = 1 ] && NEED_WINDOWS_TOOLCHAIN=1
[ "$BUILD_WINDOWS_SERVER" = 1 ] && NEED_WINE=1

require_file "$ROOT/frontend/src-tauri/tauri.conf.json"
require_file "$ROOT/requirements.txt"
require_file "$ROOT/storelimitless-backend.spec"

VERSION=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' \
    "$ROOT/frontend/src-tauri/tauri.conf.json")

[ -n "$VERSION" ] || die "could not determine version from tauri.conf.json"

echo "==> Building StoreLimitless version: $VERSION"
echo "==> Linux server:    $([ "$BUILD_LINUX_SERVER" = 1 ] && echo yes || echo skip)"
echo "==> Linux app:       $([ "$BUILD_LINUX_APP" = 1 ] && echo yes || echo skip)"
echo "==> Windows server:  $([ "$BUILD_WINDOWS_SERVER" = 1 ] && echo yes || echo skip)"
echo "==> Windows app:     $([ "$BUILD_WINDOWS_APP" = 1 ] && echo yes || echo skip)"

sudo -v
( while true; do sudo -n true; sleep 60; kill -0 "$$" 2>/dev/null || exit; done ) &
SUDO_KEEPALIVE_PID=$!
trap 'kill "$SUDO_KEEPALIVE_PID" 2>/dev/null || true' EXIT

echo
echo "==> Cleaning previous builds for selected targets"

[ "$BUILD_LINUX_SERVER" = 1 ] && rm -rf "$ROOT/build/pyi-linux" "$ROOT/dist/linux"
[ "$BUILD_WINDOWS_SERVER" = 1 ] && rm -rf "$ROOT/build/pyi-windows" "$ROOT/dist/windows"
[ "$BUILD_LINUX_APP" = 1 ] && rm -rf "$ROOT/frontend/src-tauri/target/release/bundle"
[ "$BUILD_WINDOWS_APP" = 1 ] && rm -rf "$ROOT/frontend/src-tauri/target/x86_64-pc-windows-msvc/release/bundle"

mkdir -p \
    "$ROOT/dist/linux" \
    "$ROOT/dist/windows" \
    "$ROOT/releases/linux" \
    "$ROOT/releases/windows" \
    "$ROOT/frontend/src-tauri/resources/backend"

echo
echo "==> Checking build prerequisites"

if ! command -v apt-get >/dev/null 2>&1; then
    die "This build script requires Debian/Ubuntu."
fi

sudo dpkg --add-architecture i386
sudo apt-get update

# Core packages needed no matter what we're building.
CORE_PKGS=(build-essential curl wget file git pkg-config python3 python3-pip python3-venv unzip)

# GUI/Tauri packages, only needed to build an application bundle (Linux or Windows).
APP_PKGS=(clang libssl-dev libwebkit2gtk-4.1-dev libxdo-dev libayatana-appindicator3-dev librsvg2-dev nsis lld llvm)

APT_PKGS=("${CORE_PKGS[@]}")

if [ "$NEED_LINUX_TOOLCHAIN" = 1 ] || [ "$NEED_WINDOWS_TOOLCHAIN" = 1 ]; then
    APT_PKGS+=("${APP_PKGS[@]}")
fi

sudo apt-get install -y "${APT_PKGS[@]}"

if [ "$NEED_LINUX_TOOLCHAIN" = 1 ] || [ "$NEED_WINDOWS_TOOLCHAIN" = 1 ]; then
    command -v makensis >/dev/null 2>&1 \
        || die "NSIS installation failed."
fi

WINE_MIN_VERSION="9.13"
WINE_BIN=""
WINEBOOT_BIN="wineboot"

if [ "$NEED_WINE" = 1 ]; then
    echo
    echo "==> Checking Wine (>= $WINE_MIN_VERSION required)"

    wine_version() {
        "$1" --version 2>/dev/null \
            | sed -E 's/^wine-([0-9]+(\.[0-9]+)*).*/\1/'
    }

    wine_is_new_enough() {
        local bin="$1" ver
        command -v "$bin" >/dev/null 2>&1 || return 1
        ver="$(wine_version "$bin")"
        [ -n "$ver" ] || return 1
        version_ge "$ver" "$WINE_MIN_VERSION"
    }

    if ! wine_is_new_enough wine && ! wine_is_new_enough wine64; then
        echo "==> Installing Wine from the WineHQ repository"

        . /etc/os-release
        DISTRO_CODENAME="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"

        [ -n "$DISTRO_CODENAME" ] \
            || die "could not determine distro codename."

        sudo mkdir -pm755 /etc/apt/keyrings

        sudo wget -qO /etc/apt/keyrings/winehq-archive.key \
            https://dl.winehq.org/wine-builds/winehq.key \
            || die "could not download WineHQ signing key."

        sudo wget -qNP /etc/apt/sources.list.d/ \
            "https://dl.winehq.org/wine-builds/ubuntu/dists/${DISTRO_CODENAME}/winehq-${DISTRO_CODENAME}.sources" \
            || die "WineHQ has no repository for '$DISTRO_CODENAME'."

        sudo apt-get update

        sudo apt-get remove -y \
            wine wine64 wine32 wine-stable \
            2>/dev/null || true

        sudo apt-get install -y --install-recommends winehq-stable \
            || die "WineHQ installation failed."
    fi

    if wine_is_new_enough wine; then
        WINE_BIN="wine"
    elif wine_is_new_enough wine64; then
        WINE_BIN="wine64"
    else
        FOUND_WINE="$(wine_version wine 2>/dev/null || true)"
        die "Wine >= $WINE_MIN_VERSION is required (found: ${FOUND_WINE:-none})."
    fi

    command -v "$WINEBOOT_BIN" >/dev/null 2>&1 \
        || die "wineboot is unavailable."

    echo "==> Wine: $("$WINE_BIN" --version)"

    export WINEDEBUG=-all
    export WINEDLLOVERRIDES="mscoree,mshtml="
    export WINEPREFIX="${WINEPREFIX:-$HOME/.wine}"

    "$WINEBOOT_BIN" --init >/dev/null 2>&1 || true
    "$WINEBOOT_BIN" --update >/dev/null 2>&1 || true
    "$WINEBOOT_BIN" --wait >/dev/null 2>&1 || true
fi

if [ "$NEED_LINUX_TOOLCHAIN" = 1 ] || [ "$NEED_WINDOWS_TOOLCHAIN" = 1 ]; then
    if ! command -v rustup >/dev/null 2>&1; then
        echo "==> Installing Rust"
        curl --proto '=https' --tlsv1.2 -sSf \
            https://sh.rustup.rs | sh -s -- -y
    fi

    source "$HOME/.cargo/env" 2>/dev/null || true

    command -v cargo >/dev/null 2>&1 \
        || die "cargo is not available."

    if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
        echo "==> Installing Node.js"

        curl -fsSL \
            https://deb.nodesource.com/setup_22.x \
            | sudo -E bash -

        sudo apt-get install -y nodejs
    fi

    echo "==> Node: $(node --version)"
    echo "==> npm: $(npm --version)"
fi

if [ "$NEED_WINDOWS_TOOLCHAIN" = 1 ]; then
    if ! command -v cargo-xwin >/dev/null 2>&1; then
        echo "==> Installing cargo-xwin"
        cargo install --locked cargo-xwin
    fi

    echo "==> cargo-xwin: $(cargo-xwin --version)"

    if ! rustup target list --installed \
        | grep -q '^x86_64-pc-windows-msvc$'; then

        echo "==> Installing Windows Rust target"
        rustup target add x86_64-pc-windows-msvc
    fi
fi

BUILD_VENV="$ROOT/build/venv"

if [ "$BUILD_LINUX_SERVER" = 1 ]; then
    echo
    echo "==> Preparing Linux Python build environment"

    python3 -m venv "$BUILD_VENV"

    "$BUILD_VENV/bin/python" -m pip install --upgrade pip
    "$BUILD_VENV/bin/python" -m pip install -r "$ROOT/requirements.txt"
    "$BUILD_VENV/bin/python" -m pip install pyinstaller

    echo "==> Linux Python: $("$BUILD_VENV/bin/python" --version)"
    echo "==> Linux PyInstaller: $("$BUILD_VENV/bin/python" -m PyInstaller --version)"
fi

if [ "$BUILD_WINDOWS_SERVER" = 1 ]; then
    echo
    echo "==> Checking Windows Python"

    windows_python_ok() {
        "$WINE_BIN" python --version >/dev/null 2>&1 \
            && "$WINE_BIN" python -m pip --version >/dev/null 2>&1
    }

    if ! windows_python_ok; then
        if "$WINE_BIN" python --version >/dev/null 2>&1; then
            echo "==> Windows Python present but pip is missing"
        else
            echo "==> Windows Python not found"
            echo "==> Downloading Windows Python"

            PYTHON_VERSION="3.13.7"
            PYTHON_INSTALLER="$ROOT/build/python-${PYTHON_VERSION}-amd64.exe"
            PYTHON_URL="https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-amd64.exe"

            wget -q --show-progress \
                "$PYTHON_URL" \
                -O "$PYTHON_INSTALLER"

            [ -s "$PYTHON_INSTALLER" ] \
                || die "downloaded Python installer is empty."

            file "$PYTHON_INSTALLER" | grep -qi 'PE32' \
                || die "downloaded Python installer is not a Windows executable."

            "$WINE_BIN" "$PYTHON_INSTALLER" \
                /quiet \
                InstallAllUsers=0 \
                PrependPath=1 \
                Include_pip=1 \
                Include_test=0

            "$WINEBOOT_BIN" --wait >/dev/null 2>&1 || true

            rm -f "$PYTHON_INSTALLER"
        fi

        "$WINE_BIN" python --version >/dev/null 2>&1 \
            || die "Windows Python installation failed."

        if ! "$WINE_BIN" python -m pip --version >/dev/null 2>&1; then
            echo "==> Bootstrapping pip via ensurepip"

            "$WINE_BIN" python -m ensurepip \
                --upgrade \
                --default-pip \
                >/dev/null 2>&1 || true
        fi

        if ! "$WINE_BIN" python -m pip --version >/dev/null 2>&1; then
            echo "==> Falling back to get-pip.py"

            GET_PIP="$ROOT/build/get-pip.py"

            wget -q --show-progress \
                https://bootstrap.pypa.io/get-pip.py \
                -O "$GET_PIP" \
                || die "could not download get-pip.py."

            [ -s "$GET_PIP" ] \
                || die "downloaded get-pip.py is empty."

            "$WINE_BIN" python "$GET_PIP" \
                || die "get-pip.py failed under Wine."

            rm -f "$GET_PIP"
        fi
    fi

    windows_python_ok \
        || die "Windows Python is installed but pip is unavailable."

    echo "==> Windows Python: $("$WINE_BIN" python --version)"
    echo "==> Windows pip: $("$WINE_BIN" python -m pip --version)"

    echo
    echo "==> Installing Windows Python dependencies"

    "$WINE_BIN" python -m pip install --upgrade pip
    "$WINE_BIN" python -m pip install -r "$ROOT/requirements.txt"
    "$WINE_BIN" python -m pip install pyinstaller

    echo "==> Windows PyInstaller: $("$WINE_BIN" python -m PyInstaller --version)"
fi

if [ "$NEED_LINUX_TOOLCHAIN" = 1 ] || [ "$NEED_WINDOWS_TOOLCHAIN" = 1 ]; then
    echo
    echo "==> Checking frontend dependencies"

    cd "$ROOT/frontend"

    if [ ! -d "node_modules" ]; then
        echo "==> Installing frontend dependencies"
        npm install
    fi

    npx tauri --version >/dev/null 2>&1 \
        || die "Tauri CLI is unavailable."

    echo "==> Tauri: $(npx tauri --version)"

    cd "$ROOT"
fi

# ---------------------------------------------------------------------------
# [1/4] Linux server
# ---------------------------------------------------------------------------

if [ "$BUILD_LINUX_SERVER" = 1 ]; then
    echo
    echo "==> [1/4] Building Linux server"

    "$BUILD_VENV/bin/python" -m PyInstaller \
        --clean \
        --workpath "$ROOT/build/pyi-linux" \
        --distpath "$ROOT/dist/linux" \
        "$ROOT/storelimitless-backend.spec"

    LINUX_BACKEND="$ROOT/dist/linux/storelimitless-backend"

    [ -f "$LINUX_BACKEND" ] \
        || die "Linux backend build failed."

    file "$LINUX_BACKEND" | grep -q 'ELF .* executable' \
        || die "Linux backend is not a valid ELF executable."

    cp "$LINUX_BACKEND" \
        "$ROOT/releases/linux/StoreLimitlessServer_$VERSION"

    echo "==> Linux server built: $ROOT/releases/linux/StoreLimitlessServer_$VERSION"
else
    echo
    echo "==> [1/4] Skipping Linux server build"
fi

# ---------------------------------------------------------------------------
# [2/4] Linux application
# ---------------------------------------------------------------------------

if [ "$BUILD_LINUX_APP" = 1 ]; then
    echo
    echo "==> [2/4] Building Linux application"

    LINUX_BACKEND_FOR_APP="$ROOT/dist/linux/storelimitless-backend"

    if [ ! -f "$LINUX_BACKEND_FOR_APP" ]; then
        LINUX_BACKEND_FOR_APP="$ROOT/releases/linux/StoreLimitlessServer_$VERSION"
    fi

    [ -f "$LINUX_BACKEND_FOR_APP" ] \
        || die "no Linux backend available to bundle — build it first (arg1=1)."

    rm -f "$ROOT/frontend/src-tauri/resources/backend/"*

    cp "$LINUX_BACKEND_FOR_APP" \
        "$ROOT/frontend/src-tauri/resources/backend/storelimitless-backend"

    chmod +x \
        "$ROOT/frontend/src-tauri/resources/backend/storelimitless-backend"

    cd "$ROOT/frontend"

    npx tauri build --bundles deb

    LINUX_PACKAGE=$(newest_match \
        "$ROOT/frontend/src-tauri/target/release/bundle/deb" \
        "*.deb")

    [ -n "$LINUX_PACKAGE" ] \
        || die "Linux .deb was not produced."

    cp "$LINUX_PACKAGE" \
        "$ROOT/releases/linux/"

    cd "$ROOT"

    echo "==> Linux application built: $LINUX_PACKAGE"
else
    echo
    echo "==> [2/4] Skipping Linux application build"
fi

# ---------------------------------------------------------------------------
# [3/4] Windows server
# ---------------------------------------------------------------------------

if [ "$BUILD_WINDOWS_SERVER" = 1 ]; then
    echo
    echo "==> [3/4] Building Windows server"

    "$WINE_BIN" python -m PyInstaller \
        --clean \
        --workpath "$ROOT/build/pyi-windows" \
        --distpath "$ROOT/dist/windows" \
        "$ROOT/storelimitless-backend.spec"

    WINDOWS_BACKEND="$ROOT/dist/windows/storelimitless-backend.exe"

    [ -f "$WINDOWS_BACKEND" ] \
        || die "Windows backend build failed."

    file "$WINDOWS_BACKEND" | grep -qi 'PE32' \
        || die "Windows backend is not a valid Windows executable."

    echo
    echo "==> Verifying Windows backend bundle contents"

    "$WINE_BIN" pyi-archive_viewer -l "$WINDOWS_BACKEND" > "$ROOT/build/windows-bundle-list.txt" 2>&1 \
        || die "Could not inspect Windows backend archive."

    cat "$ROOT/build/windows-bundle-list.txt"

    cp "$WINDOWS_BACKEND" \
        "$ROOT/releases/windows/StoreLimitlessServer_$VERSION.exe"

    echo "==> Windows server built: $ROOT/releases/windows/StoreLimitlessServer_$VERSION.exe"
else
    echo
    echo "==> [3/4] Skipping Windows server build"
fi

# ---------------------------------------------------------------------------
# [4/4] Windows application
# ---------------------------------------------------------------------------

if [ "$BUILD_WINDOWS_APP" = 1 ]; then
    echo
    echo "==> [4/4] Building Windows NSIS application"

    WINDOWS_BACKEND_FOR_APP="$ROOT/dist/windows/storelimitless-backend.exe"

    if [ ! -f "$WINDOWS_BACKEND_FOR_APP" ]; then
        WINDOWS_BACKEND_FOR_APP="$ROOT/releases/windows/StoreLimitlessServer_$VERSION.exe"
    fi

    [ -f "$WINDOWS_BACKEND_FOR_APP" ] \
        || die "no Windows backend available to bundle — build it first (arg3=1)."

    rm -f "$ROOT/frontend/src-tauri/resources/backend/"*

    cp "$WINDOWS_BACKEND_FOR_APP" \
        "$ROOT/frontend/src-tauri/resources/backend/storelimitless-backend.exe"

    require_file "$ROOT/frontend/src-tauri/resources/backend/storelimitless-backend.exe"

    file "$ROOT/frontend/src-tauri/resources/backend/storelimitless-backend.exe" | grep -qi 'PE32' \
        || die "Windows backend resource is not a valid Windows executable."

    echo "==> Windows backend resource verified."

    cd "$ROOT/frontend"

    npx tauri build \
        --runner cargo-xwin \
        --target x86_64-pc-windows-msvc \
        --bundles nsis

    NSIS_INSTALLER=$(newest_match \
        "$ROOT/frontend/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis" \
        "*-setup.exe")

    [ -n "$NSIS_INSTALLER" ] \
        || die "Windows NSIS installer was not produced."

    file "$NSIS_INSTALLER" | grep -Eqi 'PE32|MS-DOS executable' \
        || die "Windows NSIS installer is not a valid Windows executable."

    cp "$NSIS_INSTALLER" \
        "$ROOT/releases/windows/"

    cd "$ROOT"

    echo "==> Windows application built: $NSIS_INSTALLER"
else
    echo
    echo "==> [4/4] Skipping Windows application build"
fi

echo
echo "========================================"
echo "==> StoreLimitless $VERSION build complete"
echo "========================================"

echo
echo "==> Linux releases:"
find "$ROOT/releases/linux" -maxdepth 1 -type f -print

echo
echo "==> Windows releases:"
find "$ROOT/releases/windows" -maxdepth 1 -type f -print

echo
echo "==> All releases:"
find "$ROOT/releases" -maxdepth 2 -type f -print