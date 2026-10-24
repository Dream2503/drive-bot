# Python typing checklist

## Discovery record

- Runtime target: Python 3.13.7 (from the Windows build script and CI).
- Stack: FastAPI, Pydantic, psycopg 3 / psycopg-pool, async Redis, pyftpdlib, asyncio, Discord.py, Telethon, libtorrent, yt-dlp, gdown, Requests.
- Type checking: strict mypy is configured in `pyproject.toml`; Ruff selects `ANN`, `UP`, and `TCH`.
- CI executes compileall, Ruff annotation checks, Ruff rules, and strict mypy.
- No tracked `.pyi` files, tests, test directory, migrations, or migration files were found in the repository inventory.
- Generated Python files skipped: none found. Excluded inventory directories: virtualenvs, `.git`, `__pycache__`, `node_modules`, and build/dist folders.
- Safety note: CI must validate only; it must not automatically rewrite or push files, so annotation-related changes remain reviewable and runtime changes are not introduced by automated fixes.

## Source-file checklist

- [ ] `backend/database/backup.py`
- [ ] `backend/database/connection.py`
- [ ] `backend/database/models/__init__.py`
- [ ] `backend/database/models/directory.py`
- [ ] `backend/database/models/file.py`
- [ ] `backend/database/models/user.py`
- [ ] `backend/database/redis_server.py`
- [ ] `backend/ftp/__init__.py`
- [ ] `backend/ftp/auth.py`
- [ ] `backend/ftp/filesystem/__init__.py`
- [ ] `backend/ftp/filesystem/download.py`
- [ ] `backend/ftp/filesystem/filesystem.py`
- [ ] `backend/ftp/filesystem/upload.py`
- [ ] `backend/ftp/filesystem/utils.py`
- [ ] `backend/ftp/handler.py`
- [ ] `backend/ftp/server.py`
- [ ] `backend/server/app.py`
- [ ] `backend/server/frontend.py`
- [ ] `backend/server/jwt_handler.py`
- [ ] `backend/server/routers/__init__.py`
- [ ] `backend/server/routers/accounts.py`
- [ ] `backend/server/routers/directories.py`
- [ ] `backend/server/routers/public_routes.py`
- [ ] `backend/server/routers/upload_state.py`
- [ ] `backend/server/routers/uploads.py`
- [ ] `backend/server/security.py`
- [ ] `backend/server/utils.py`
- [ ] `backend/server/zip_stream.py`
- [ ] `core/__init__.py`
- [ ] `core/config.py`
- [ ] `core/data_center.py`
- [ ] `core/main.py`
- [ ] `core/stream.py`
- [ ] `core/transfer.py`
- [ ] `core/utils/__init__.py`
- [ ] `core/utils/binaries.py`
- [ ] `core/utils/discord_.py`
- [ ] `core/utils/download_.py`
- [ ] `core/utils/download_manager.py`
- [ ] `core/utils/download_utils.py`
- [ ] `core/utils/env.py`
- [ ] `core/utils/ingestion_queue.py`
- [ ] `core/utils/progress.py`
- [ ] `core/utils/telegram_.py`
- [ ] `core/utils/telegram_link.py`
- [ ] `core/utils/upload_manager.py`
- [ ] `core/utils_.py`

The checkbox for a module is marked only after its annotations have been reviewed and the CI type/lint checks pass. Merely reading the file or compiling it is not sufficient.
