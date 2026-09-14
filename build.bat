$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "==> Cleaning previous builds"
Remove-Item "$ROOT\build" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$ROOT\dist" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$ROOT\frontend\src-tauri\resources\backend" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "==> Building Python backend"
Set-Location $ROOT
pyinstaller --clean storelimitless-backend.spec

Write-Host "==> Copying backend into Tauri resources"
New-Item -ItemType Directory "$ROOT\frontend\src-tauri\resources\backend" -Force | Out-Null
Copy-Item "$ROOT\dist\storelimitless-backend\*" "$ROOT\frontend\src-tauri\resources\backend\" -Recurse -Force

Write-Host "==> Building Tauri application"
Set-Location "$ROOT\frontend"
npx tauri build

Write-Host "==> Copying production release"
New-Item -ItemType Directory "$ROOT\releases\windows" -Force | Out-Null

Copy-Item "$ROOT\frontend\src-tauri\target\release\bundle\msi\*.msi" \
          "$ROOT\releases\windows\" -Force

Copy-Item "$ROOT\frontend\src-tauri\target\release\bundle\nsis\*.exe" \
          "$ROOT\releases\windows\" -Force

Write-Host "==> Build complete"