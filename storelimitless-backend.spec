# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path

ROOT = Path(SPECPATH).resolve()
FRONTEND_DIST = ROOT / "frontend" / "dist"

if not FRONTEND_DIST.is_dir():
    raise FileNotFoundError(
        f"Frontend build not found: {FRONTEND_DIST}\n"
        "Build it first with: cd frontend && npm install && npm run build"
    )

frontend_datas = [
    (str(path), str(Path("frontend") / path.relative_to(FRONTEND_DIST).parent))
    for path in FRONTEND_DIST.rglob("*")
    if path.is_file()
]

a = Analysis(
    ["core/main.py"],
    pathex=[str(ROOT)],
    binaries=[],
    datas=frontend_datas,
    hiddenimports=[
        "passlib.handlers.bcrypt",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="StoreLimitlessServer",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)