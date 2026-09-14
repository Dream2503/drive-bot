#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION=$(grep '"version"' "$ROOT/frontend/src-tauri/tauri.conf.json" | head -1 | sed -E 's/.*"version": "([^"]+)".*/\1/')

echo "==> Cleaning previous builds"
rm -rf "$ROOT/build" "$ROOT/dist" "$ROOT/frontend/src-tauri/resources/backend"

echo "==> Building Python backend"
cd "$ROOT"
pyinstaller --clean storelimitless-backend.spec

echo "==> Copying backend into Tauri resources"
mkdir -p "$ROOT/frontend/src-tauri/resources/backend"
cp -r "$ROOT/dist/storelimitless-backend/"* \
      "$ROOT/frontend/src-tauri/resources/backend/"

echo "==> Building Tauri application"
cd "$ROOT/frontend"
npx tauri build

echo "==> Copying production release"
mkdir -p "$ROOT/releases/linux"
cp "$ROOT/frontend/src-tauri/target/release/bundle/deb/"*.deb \
   "$ROOT/releases/linux/"

echo
echo "==> Build complete"
echo "==> Release:"
find "$ROOT/releases/linux" \
    -name "StoreLimitless_${VERSION}_*.deb" \
    -print