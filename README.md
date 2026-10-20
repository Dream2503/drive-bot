# StoreLimitless

StoreLimitless is a self-hosted personal cloud-storage application. It combines a React web interface, a Python service layer, PostgreSQL metadata,
Redis-backed coordination, and Discord/Telegram as remote storage providers. It supports multi-file uploads, importing one or many HTTP (S) links,
folder management, trash/restore, HTTP streaming with byte-range requests, and an FTP-compatible virtual filesystem.

The web UI is branded **DriveBot** in places, while the overall application and server are called **StoreLimitless**.

> **Scope:** This document covers the root StoreLimitless application: its internal backend, frontend, storage/transfer code, FTP interface, runtime
> data,
> and packaging workflow. The separate Python SDK source package is not part of the tracked application tree. The current build script can still
> create an
> ignored `api/src/storelimitless/bin/` directory containing copies of packaged server executables for SDK bundling; those are generated artifacts,
> not
> application source. The internal service under `backend/server/` is documented because the frontend, uploads, streaming, and FTP integration depend
> on it.

---

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Core concepts](#core-concepts)
- [Application lifecycle](#application-lifecycle)
- [Upload and storage flow](#upload-and-storage-flow)
- [Streaming and caching](#streaming-and-caching)
- [FTP interface](#ftp-interface)
- [Database model](#database-model)
- [Frontend guide](#frontend-guide)
- [Internal HTTP interface](#internal-http-interface)
- [Configuration](#configuration)
- [Development setup](#development-setup)
- [Running StoreLimitless](#running-storelimitless)
- [Build and packaged distributions](#build-and-packaged-distributions)
- [Backups and runtime data](#backups-and-runtime-data)
- [Security notes](#security-notes)
- [Troubleshooting](#troubleshooting)
- [Developer guide](#developer-guide)
- [Known boundaries and verification notes](#known-boundaries-and-verification-notes)

---

## What it does

StoreLimitless is a metadata-driven storage system. It does not treat the application machine's filesystem as the permanent home of users' cloud
files. Instead, PostgreSQL records each user's folders and file metadata, while file bytes are divided into parts and stored through a configured
provider.

The current code defines two storage providers:

- **Discord**: stores file parts as attachments/messages in a configured dump channel.
- **Telegram**: stores file parts as documents in a configured Telegram destination.

A file record keeps the provider name, byte size, MIME type, logical directory, modification time, and the ordered list of remote part links. The
original file can be reconstructed by downloading those parts in order.

The application provides these user-facing capabilities:

- Register and log in to a StoreLimitless account.
- Browse a user's virtual home directory and nested folders.
- Upload multiple local files from the browser.
- Import one or many remote links by pasting one HTTP (S) URL per line.
- Download direct HTTP (S) file URLs, import Google Drive files, and process YouTube URLs.
- Track each upload/import job through dashboard progress and status updates.
- Use keyboard shortcuts on the upload page to return to the dashboard or trigger the upload/import action.
- Rename and move files and folders, including bulk move operations.
- Move files/folders to trash, restore them, or permanently delete trash items.
- Create signed links for streaming or downloading a file.
- Stream media and other files over HTTP, including single byte-range requests for seeking.
- Connect through FTP using the same account and virtual directory tree.
- Cache recently used remote file parts locally to reduce repeat downloads.
- Export database tables to CSV through the backup utility.

## Architecture

```text
                         ┌──────────────────────────────┐
                         │ React + Vite frontend        │
                         │ sign-in, dashboard, upload,  │
                         │ preview / media player       │
                         └──────────────┬───────────────┘
                                        │ HTTP + bearer token
                                        ▼
┌───────────────────────────────────────────────────────────────────┐
│ StoreLimitless application                                        │
│                                                                   │
│ backend/server/                                                   │
│   authentication, directory/file actions, upload jobs,            │
│   public-link verification, stream/download responses             │
│                                                                   │
│ core/                                                             │
│   startup/lifecycle, provider selection, chunk transfer,          │ 
│   byte-range streaming, progress, downloads, external binaries    │
│                                                                   │
│ backend/ftp/                                                      │
│   FTP authentication and a virtual filesystem backed by models    │
└──────────────┬──────────────────────────────┬─────────────────────┘
               │                              │
               ▼                              ▼
      ┌────────────────┐            ┌──────────────────────────┐
      │ PostgreSQL     │            │ Redis                    │
      │ users, folders,│            │ model cache, upload job  │
      │ file metadata  │            │ status/session metadata  │
      └────────────────┘            └──────────────────────────┘
               │
               ▼
      ┌──────────────────────────────────────┐
      │ Data-center abstraction              │
      │ Discord / Telegram                   │
      │ ordered file parts + remote links    │
      └──────────────────────────────────────┘

FTP client ── FTP port ──► FTP virtual filesystem ──► same models/transfer flow
```

### Responsibility boundaries

- **`frontend/`** renders the user interface and makes HTTP requests. The browser does not communicate directly with Discord or Telegram.
- **`backend/server/`** is the application's internal HTTP service. It handles account authentication, folder/file operations, upload sessions,
  public-link validation, and streaming responses.
- **`backend/database/`** owns the PostgreSQL connection, database models, Redis integration, and database export utility.
- **`core/`** coordinates service startup, storage provider selection, transfer routines, supported link downloads, progress reporting, and byte-range
  reads.
- **`backend/ftp/`** exposes the same metadata and transfer functionality through a virtual FTP filesystem instead of a real host directory.
- **Discord and Telegram** hold file bytes. PostgreSQL stores the metadata needed to find, order, and reconstruct those bytes.
- **Redis** is used for cached models and short-lived coordination/state, including upload progress and active upload-session information.

---

## Repository layout

This is the current application tree. Runtime files and packaged executables may appear after the application has run or the build script has been
used;
generated caches, virtual environments, and dependency folders are deliberately omitted here.

```text
.
├── backend/
│   ├── database/
│   │   ├── backup/
│   │   │   ├── directories.csv      # Directory export
│   │   │   ├── files.csv            # File metadata export
│   │   │   └── users.csv            # User/account export
│   │   ├── backup.py                # Export database tables
│   │   ├── connection.py             # PostgreSQL pool and schema bootstrap
│   │   ├── redis_server.py           # Async Redis client and serialization
│   │   └── models/
│   │       ├── __init__.py
│   │       ├── directory.py          # Directory persistence, moves, and trash
│   │       ├── file.py               # File metadata and lifecycle operations
│   │       └── user.py               # User/account persistence
│   ├── ftp/
│   │   ├── auth.py                   # FTP authentication and permissions
│   │   ├── handler.py                # FTP command-handler integration
│   │   ├── server.py                 # FTP server thread and lifecycle
│   │   └── filesystem/
│   │       ├── __init__.py
│   │       ├── download.py           # Seekable reader for remote files
│   │       ├── filesystem.py         # Virtual filesystem operations
│   │       ├── upload.py             # Staged FTP upload adapter
│   │       └── utils.py              # FTP path/model helpers
│   └── server/
│       ├── app.py                    # FastAPI application and CORS
│       ├── frontend.py               # Packaged SPA and runtime config
│       ├── jwt_handler.py            # Bearer-token creation/validation
│       ├── security.py               # Password hashes and signed public tokens
│       ├── utils.py                  # Input validation helpers
│       └── routers/
│           ├── __init__.py            # Router composition
│           ├── accounts.py           # Registration, login, metadata
│           ├── directories.py        # Directory/file operations, search, trash
│           ├── public_routes.py      # Readiness, upload status, stream/download
│           ├── uploads.py            # Browser uploads and URL-import jobs
│           └── upload_state.py       # Redis upload-session and chunk coordination
├── core/
│   ├── config.py                     # Hosting mode, paths, logging, runtime settings
│   ├── data_center.py                # Provider factory and bounded local cache
│   ├── main.py                       # Startup, service coordination, shutdown
│   ├── stream.py                     # Remote-part reconstruction and byte ranges
│   ├── transfer.py                   # File and link upload orchestration
│   ├── utils_.py                     # Cache bookkeeping and shared helpers
│   └── utils/
│       ├── __init__.py
│       ├── binaries.py               # Redis, FFmpeg, and Cloudflare helpers
│       ├── discord_.py               # Discord storage provider
│       ├── download_.py              # Direct URL, Google Drive, and YouTube downloaders
│       ├── env.py                    # Credentials/configuration constants
│       ├── progress.py               # Progress tracking and part uploader
│       └── telegram_.py              # Telegram storage provider
├── data/
│   ├── logs.lock                     # Runtime log-file lock
│   ├── logs.log                      # Runtime application log
│   └── transfer/                     # Temporary downloads, upload staging, and cache
├── frontend/
│   ├── public/
│   │   └── vite.svg
│   ├── README.md
│   ├── src/
│   │   ├── App.jsx                   # Client-side routes
│   │   ├── main.jsx                  # React entry point
│   │   ├── index.css                 # Global styles
│   │   └── pages/
│   │       ├── AuthPage.jsx          # Sign-in and registration
│   │       ├── Dashboard.jsx         # File/folder dashboard and upload tray
│   │       ├── upFiles.jsx            # Multi-file and multi-link upload UI
│   │       └── ViewPage.jsx          # File preview and media player
│   ├── eslint.config.js
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   └── vite.config.js
├── releases/
│   ├── linux/                        # Linux release executable(s)
│   └── windows/                      # Windows release executable(s)
├── build.sh                          # Cross-platform packaging and cleanup script
├── requirements.txt                  # Python runtime dependencies
├── storelimitless-backend.spec       # PyInstaller specification
├── LICENSE
└── README.md
```

`data/` is runtime storage in source/development mode. In frozen mode, runtime data is instead placed in the operating system's StoreLimitless
application
data directory. Treat logs, CSV exports, Telegram session data, and configuration files as potentially sensitive. Generated paths such as `build/`,
`dist/`, `frontend/node_modules/`, `frontend/dist/`, `__pycache__/`, and `.pyc`/`.pyo` files are not source files and can be recreated by the build or
runtime workflow. The build script intentionally removes its disposable build outputs and Python bytecode caches after a successful build.


---

## Core concepts

### 1. Metadata versus file bytes

PostgreSQL tracks the logical file tree and records the remote part links for each file. Discord or Telegram stores the actual bytes. A file is usable
only when its database metadata and all expected remote parts agree.

This separation means:

- Renaming or moving a file normally changes metadata; it does not need to re-upload its bytes.
- A file's `links` order is significant. It represents the part order used during reconstruction.
- Losing the metadata database can make remote attachments difficult to associate with users and filenames, even if the remote messages still exist.
- Backing up the database is therefore as important as keeping the storage provider content.

Permanent deletion deserves special attention: the current `File.delete()` model method removes the PostgreSQL row and its Redis cache entry. The
supplied implementation does not show a matching deletion of the underlying Discord/Telegram attachments, so do not assume that permanently deleting a
database record also deletes the provider-side bytes. If provider cleanup is required, add and test it explicitly, including failure handling for
partial deletion.

### 2. A user's home directory

Registration creates a default logical directory at `/home`. The dashboard uses `/home` as its internal root, while the FTP filesystem presents that
directory as `/`.

The home directory is not a physical host directory. It is a row in the `directories` table. The FTP filesystem resolves paths back to the
authenticated user's `Directory` and `File` records.

### 3. Storage providers and part size

`core.data_center.DataCenter` maps a provider name to its implementation. The configured providers in this source are `Discord` and `Telegram`. A
file's `data_center` field chooses which implementation is used for upload and download.

The current source defines a maximum part size of **10 MiB** (`10 * 1024 * 1024`). The `links` array should contain one link for each stored part. The
streaming code verifies the part count against the recorded file size.

### 4. Cache and transfer files are disposable

The local part cache lives under `TRANSFER_PATH/cached`. Its current configured limit is **256 MiB**, and it uses least-recently-used eviction
bookkeeping. Cache files are not the canonical copy of user data.

In source mode, `TRANSFER_PATH` is normally `data/transfer/`; in frozen mode it is placed under the OS-specific StoreLimitless data directory. The
application resets the part cache during startup and removes transfer staging data during shutdown. Do not place durable user files, credentials, or
other application data there.

---

## Application lifecycle

Run `python -m core.main` from the repository root. The `main()` function is the process coordinator.

Before starting service processes in source mode, the application checks whether `frontend/node_modules/vite/package.json` exists. If frontend
dependencies are missing, it runs `npm ci` when `package-lock.json` is present, otherwise it runs `npm install`. It verifies that Vite is present
after
installation. Frozen/packaged execution skips this Node.js setup because the frontend is bundled.

At a high level, startup then does the following:

1. Starts a local Redis process if a Redis server is not already responding on `127.0.0.1:6379`.
2. Initializes the asynchronous Redis client and verifies connectivity.
3. Reinitializes the disposable cached-part directory.
4. Starts the Telegram client.
5. Creates the FastAPI server on port `8000`.
6. Starts the website on port `5173`. In source/development mode it launches Vite; in a frozen/packaged build it uses the bundled frontend server.
7. Starts the Discord client in a separate thread.
8. Starts the FTP server on port `2121`.
9. Waits until Discord is ready, then prints the service addresses and opens the interactive command prompt.

The app's current startup sequence relies on Discord becoming ready before it announces that the services are available. A bad Discord token,
inaccessible dump channel, missing permissions, or gateway startup failure can therefore prevent the startup sequence from reaching its ready state.

### Runtime prompt

The current `core/main.py` prompt implements these commands:

| Command  | Behavior                                                                  |
|----------|---------------------------------------------------------------------------|
| `server` | Toggle the interactive prompt display while leaving the services running. |
| `exit`   | Shut down the managed services and exit.                                  |

The current prompt is a service-control prompt, not a general file-management shell. File operations are exposed through the web UI and FTP interface.

### Shutdown

The lifecycle code requests HTTP-server shutdown, closes FTP, shuts down the Discord and Telegram clients, closes Redis, stops processes launched for
Redis/Vite/Cloudflare, and removes the temporary transfer directory. Avoid relying on unfinished files under `TRANSFER_PATH` (normally
`data/transfer/`
in source mode) surviving a shutdown.

---

## Upload and storage flow

### Browser file upload

The browser upload implementation is split between `frontend/src/pages/upFiles.jsx`, the upload routes, Redis upload-state helpers, and the core
transfer layer.

1. The frontend requests an upload job using `POST /auth/upload`, passing the selected data center, directory, and file name in headers.
2. The backend validates the requested provider, file name, and target directory.
3. A job ID is created. The pending job metadata and its temporary file path are stored in Redis with a time-to-live.
4. The frontend divides each local file into **1 MiB chunks**, sends up to **8 chunks concurrently**, and retries transient chunk failures up to the
   configured attempt limit.
5. The frontend sends byte chunks to `PUT /public/upload/{job_id}/chunk`, with `offset` and `total` query parameters.
6. The backend writes each chunk at its declared byte offset and records received ranges in Redis. The range helper merges overlapping/adjacent ranges
   and tracks the contiguous byte count from offset zero.
7. A producer task waits for incoming bytes while the upload worker passes the growing temporary file through the core upload pipeline. The transfer
   can therefore begin before the complete browser file has finished arriving.
8. The transfer layer splits the file into provider-sized parts, uploads those parts, collects their remote links, and persists final file metadata.
9. The frontend polls `GET /public/upload/{job_id}/status` for progress and the resulting file ID.

The active/pending upload metadata has an approximately one-hour Redis TTL in the current implementation. The chunk receiver also detects
interrupted/missing temporary files and reports a restart-required failure rather than silently treating the incomplete file as complete.

Temporary browser upload files are stored beneath `TRANSFER_PATH` in a per-user/job layout. In source mode this is under `data/transfer/`, the runtime
scratch space cleaned up when the application shuts down.

### Import one or many remote links

`POST /auth/upload-link` starts a background import job for a single URL. The upload page supports multiple links by accepting **one HTTP (S) URL per
line**. It trims empty lines, validates every non-empty line before submitting jobs, and creates a separate import job for each URL. The dashboard
tracks
each job separately, so progress and failures are associated with the relevant link.

The server chooses the downloader from the URL host:

- **Direct HTTP (S) file URLs** use a streamed HTTP download. The response should contain the file bytes, not an ordinary website page. The downloader
  uses
  response filename metadata when available and rejects likely HTML pages that do not look like file downloads.
- **Google Drive links** (`drive.google.com`) use the Google Drive downloader. The current implementation requests file name/size metadata through the
  Google Drive API, so the configured Google API key and access to the file are required.
- **YouTube links** (`youtube.com`, subdomains of `youtube.com`, and `youtu.be`) use `yt-dlp` and FFmpeg to download/process media.

For multiple imports, enter one URL per line, for example:

```text
https://downloads.example.org/archive.zip
https://downloads.example.org/video.mp4
```

Each line creates its own import job. Blank lines are ignored, but every non-empty URL must use HTTP or HTTPS.

Downloaded content is written to a temporary file and sent through the same storage-provider upload pipeline used for other files. Direct links to
ordinary HTML pages, authenticated downloads that the server cannot access, expired links, and unsupported provider-specific pages may fail even if
the
URL itself is syntactically valid. YouTube processing requires `yt-dlp`; FFmpeg is discovered or installed by the binary helper on supported
platforms.

### How `file_upload()` works

`core.transfer.file_upload()` chooses the provider from the file metadata, then delegates to `upload_growing_file()` in `core.utils.progress`. That
helper coordinates reading the local file, uploads individual parts, updates progress, and records the resulting remote links. Unless invoked in
intermediate mode, the function saves the completed file record and yields a final progress message containing its file ID.

The separate `link_upload()` function selects the supported downloader, streams its progress, saves the final file record, and reports completion.

### Upload progress

`core.utils.progress.Progress` is a small shared object containing a name, status message, transferred byte count, and total byte count. Redis
serializes progress so the HTTP status route can return updates to the frontend independently of the background transfer task.

`backend/server/routers/upload_state.py` contains the concurrency and session-state logic for browser chunk uploads. It tracks background tasks
strongly, coordinates range updates with a Redis lock, waits for contiguous input bytes, and cleans up session keys and temporary files when the job
ends.

---

## Streaming and caching

`core.stream.Stream` reconstructs a file from its provider parts. It validates that the stored metadata is internally consistent, then maps an
optional HTTP `Range` header to the part (s) containing the requested bytes.

Supported range forms include a normal byte range and a suffix range. Invalid or out-of-bounds ranges are rejected. The public stream route responds
with:

- `200 OK` for a full-file request.
- `206 Partial Content` when a range is requested.
- `416 Range Not Satisfiable` for an invalid/out-of-range request, with the total size in `Content-Range`.

The stream generator:

1. Finds the part containing the requested start offset.
2. Checks the local part cache.
3. Downloads the missing part from the file's configured provider.
4. Validates the downloaded part length.
5. Yields only the requested region, in output blocks of at most 1 MiB.

This arrangement lets the browser video player seek without downloading the entire file from the start, provided the client sends byte-range requests
and the remote part metadata is valid.

### Public stream versus public download

The code has separate endpoints for inline streaming and download-as-attachment. The frontend obtains a signed public token from an authenticated file
action, then uses it to request the corresponding public stream or download endpoint. The public token is signed using HMAC and binds the token to a
file ID and username.

In the current implementation, the public token payload does not include an expiration timestamp. Treat links as bearer capabilities: anyone who
obtains a valid link may be able to use it until the signing secret changes or the referenced file ceases to resolve. Add expiry/revocation behavior
before relying on links for sensitive files.

---

## FTP interface

The FTP service exposes the same StoreLimitless data through `pyftpdlib`; it does not expose the host's real root filesystem.

### Main modules

- `backend/ftp/server.py` runs the FTP listener in a daemon thread and provides a stop method.
- `backend/ftp/auth.py` checks StoreLimitless usernames/passwords and assigns the authenticated user to the FTP handler.
- `backend/ftp/handler.py` connects the protocol handler to the custom virtual filesystem and application event loop.
- `backend/ftp/filesystem/filesystem.py` maps FTP paths to the user's database-backed directories/files.
- `backend/ftp/filesystem/download.py` implements a seekable, read-only file object by requesting byte ranges from the internal stream route.
- `backend/ftp/filesystem/upload.py` wraps the local staging file and finalizes the upload when the FTP transfer closes the file.

### FTP path behavior

- An FTP user's visible `/` maps to their StoreLimitless `/home` directory.
- Directory listing, stat/size/time lookup, create-folder, rename/move, file read, and staged file write are implemented by the virtual filesystem.
- Deleting a file or directory moves it to trash rather than immediately deleting its metadata.
- Writing over an existing file moves the old record to trash and creates a new upload. Append mode is only supported where the virtual filesystem
  allows it.
- Symbolic links are not exposed, and `chmod` is explicitly unsupported.
- FTP uploads are staged locally and passed into `core.transfer.file_upload()` when the staged file closes.
- FTP reads use a 1 MiB range buffer and the same signed-token streaming logic as the web interface.

The default listener is `0.0.0.0:2121`. The current server setup does not configure a dedicated passive FTP port range. Remote FTP access through NAT,
a firewall, or a TCP tunnel may therefore require extra passive-port configuration and network rules even if the client can connect and authenticate
to the command port.

**Security:** the server currently uses plain FTP unless TLS is configured elsewhere. Plain FTP does not encrypt usernames, passwords, or file
contents. Do not expose it on an untrusted network without adding a secure transport and correct firewall/tunnel configuration.

---

## Database model

The database schema is initialized by `backend/database/connection.py` when the module connects to PostgreSQL. The connection pool uses dictionary
rows, and schema creation is performed with `CREATE TABLE IF NOT EXISTS`.

### `users`

| Column                    | Purpose                                                                     |
|---------------------------|-----------------------------------------------------------------------------|
| `username`                | Primary key and account identifier.                                         |
| `password`                | Stored password hash, not intended to contain plaintext after registration. |
| `first_name`, `last_name` | Profile fields.                                                             |
| `created_at`              | Account creation timestamp.                                                 |

Registration validates the profile fields, hashes the password, and creates the user and `/home` directory in one transaction.

### `directories`

| Column        | Purpose                                                   |
|---------------|-----------------------------------------------------------|
| `id`          | Generated directory identifier.                           |
| `path`        | Logical absolute path, such as `/home` or `/home/photos`. |
| `modified_at` | Last metadata modification time.                          |
| `deleted_at`  | Nullable trash marker.                                    |
| `username`    | Owning account; foreign key to `users`.                   |

Directory paths are unique per username. Directory moves/renames must update descendant paths as well as the selected directory row.

### `files`

| Column         | Purpose                                                |
|----------------|--------------------------------------------------------|
| `id`           | Generated file identifier.                             |
| `directory_id` | Parent directory identifier.                           |
| `name`         | Logical file name.                                     |
| `type`         | MIME type.                                             |
| `size`         | Total file size in bytes.                              |
| `modified_at`  | Last metadata modification time.                       |
| `data_center`  | Provider name, currently `Discord` or `Telegram`.      |
| `links`        | Ordered PostgreSQL `TEXT[]` of remote file-part links. |
| `deleted_at`   | Nullable trash marker.                                 |
| `username`     | Owning account.                                        |

The file record points to remote bytes; it is not the full file content itself. Keep the links array ordered and consistent with the part size and
recorded file size.

### PostgreSQL and Redis roles

PostgreSQL is the durable source of account, directory, and file metadata. Redis is used for frequently accessed model data and short-lived
operational state such as upload sessions and progress. Do not treat Redis cache/state as a substitute for database backups.

---

## Frontend guide

The frontend uses React, React Router, Vite, and Tailwind-style utility classes. Components use `.jsx` files and JSDoc comments for some type
documentation.

### Browser routes

| Route           | Page                                                       |
|-----------------|------------------------------------------------------------|
| `/`             | Sign-in and registration (`AuthPage.jsx`).                 |
| `/home`         | Dashboard root.                                            |
| `/home/*`       | Dashboard at a nested folder route.                        |
| `/dashboard`    | Legacy route that redirects to the matching `/home` route. |
| `/upload`       | File upload and remote-link import (`upFiles.jsx`).        |
| `/view/:fileId` | File preview and media player (`ViewPage.jsx`).            |

### Key frontend modules

- `AuthPage.jsx` switches between sign-in and registration and stores the bearer token in `localStorage` under `token`.
- `Dashboard.jsx` handles folder navigation, file/folder display, search, metadata display, creation, rename/move actions, trash/restore/permanent
  deletion, public links, and download actions. Upload job state is also preserved in browser storage under `storelimitless_upload_jobs`.
- `upFiles.jsx` manages local-file chunk uploads, multiple-link imports, upload job persistence, and cancellation.
- `ViewPage.jsx` obtains a public stream URL and provides a custom media player with play/pause, seeking, playback-rate, volume, fullscreen,
  picture-in-picture, and keyboard-related controls.
- `App.jsx` declares the client-side routes.
- `main.jsx` mounts React into the HTML root element; `index.css` contains global styling.

### Upload page keyboard shortcuts and multiple links

On the upload page:

- **Escape** returns to the dashboard route for the current directory.
- **Backspace** returns to the dashboard when focus is not in an editable field; normal text editing is preserved.
- **Enter** triggers the upload/import button when enabled, except inside the multi-link text area, where Enter inserts a new line. Key repeat is
  ignored
  for triggering the upload action so holding Enter does not repeatedly submit it.
- In **Link** mode, paste or type one HTTP (S) URL per line. Blank lines are ignored. The page validates all entered URLs before creating one
  server-side
  import job per link, then returns to the dashboard so the upload tray can show their progress.

The upload tray stores pending job details in browser `localStorage` under `storelimitless_upload_jobs`. The dashboard polls each job's status;
completed
jobs are removed from the tray and the directory view refreshes so newly imported files appear. Failed jobs retain their error status for diagnosis or
dismissal.

### API URL resolution

The frontend resolves the service URL from `window.STORELIMITLESS_CONFIG?.API_URL` first, then falls back to Vite's `import.meta.env.VITE_API_URL`.
The packaged frontend service in `backend/server/frontend.py` exposes `/config.js` and reads `STORELIMITLESS_API_URL` at runtime. During development,
`core/main.py` passes `VITE_API_URL` to Vite and also sets the runtime URL variables.

When changing the API URL mechanism, keep the following aligned:

1. `core/main.py` service startup and environment variables.
2. `backend/server/frontend.py` runtime configuration.
3. The `frontend/index.html` script-loading order, if it loads `/config.js`.
4. The API URL resolution in the React pages.
5. CORS origins in `backend/server/app.py` and the Cloud-mode middleware.

The browser-facing URL must be reachable from the browser itself. `127.0.0.1` always means the computer running the browser, not a remote host.

---

## Internal HTTP interface

This section documents the HTTP service that is part of the StoreLimitless application. It does **not** describe the separately packaged SDK under
`api/`.

Most `/auth/...` routes require an `Authorization: Bearer <access_token>` header. Public upload-status and file-stream routes use the `/public/...`
namespace, although the chunk receiver itself also validates the user's bearer token in the current code.

The router-composition module determines how the individual router modules are mounted. The endpoint paths below reflect the route paths used by the
supplied frontend and server modules.

### Accounts

| Method and path                              | Purpose                                                                      |
|----------------------------------------------|------------------------------------------------------------------------------|
| `POST /auth/register`                        | Validate details, hash the password, create the account, and create `/home`. |
| `POST /auth/login?username=...&password=...` | Verify credentials and return the bearer token, profile, and home directory. |
| `GET /auth/metadata`                         | Return account metadata including the calculated storage usage.              |

Access tokens use HS256 and have a 60-minute lifetime in the current code. The login endpoint currently accepts credentials in query parameters;
see [Security notes](#security-notes).

### Directory and file management

| Method and path                                   | Purpose                                           |
|---------------------------------------------------|---------------------------------------------------|
| `POST /auth/create-folder?directory=...&name=...` | Create a directory under the requested parent.    |
| `GET /auth/directory?directory=...`               | Return folder and file entries for a directory.   |
| `GET /auth/search`                                | Search the user's file/directory metadata.        |
| `GET /auth/trash`                                 | Return trashed files and directories.             |
| `PATCH /auth/file/{fid}/rename?name=...`          | Rename a file.                                    |
| `PATCH /auth/directory/{did}/rename?name=...`     | Rename a directory and rewrite descendant paths.  |
| `PATCH /auth/file/{fid}/move?directory=...`       | Move a file to another directory.                 |
| `PATCH /auth/directory/{did}/move?directory=...`  | Move a directory and its descendants.             |
| `PATCH /auth/move`                                | Bulk move the specified file/folder IDs.          |
| `DELETE /auth/file/{fid}`                         | Move a file to trash.                             |
| `DELETE /auth/directory/{did}`                    | Move a directory to trash.                        |
| `POST /auth/trash/file/{fid}/restore`             | Restore a trashed file.                           |
| `POST /auth/trash/directory/{did}/restore`        | Restore a trashed directory.                      |
| `DELETE /auth/trash/file/{fid}`                   | Permanently delete a file record from trash.      |
| `DELETE /auth/trash/directory/{did}`              | Permanently delete a directory from trash.        |
| `POST /auth/file/{fid}/public-link`               | Create a signed stream/download token for a file. |

The `/home` root is protected from being moved/renamed/deleted by the directory-management code. File and directory names are validated before path
changes.

### Upload and public-file routes

| Method and path                                                 | Purpose                                                                                         |
|-----------------------------------------------------------------|-------------------------------------------------------------------------------------------------|
| `POST /auth/upload`                                             | Create a browser-upload job. Headers include `X-Data-Center`, `X-Directory`, and `X-File-Name`. |
| `PUT /public/upload/{job_id}/chunk?offset=...&total=...`        | Send bytes for a declared file range. The current route requires the user's bearer token.       |
| `POST /auth/upload-link?link=...&data_center=...&directory=...` | Import a supported remote link in a background task.                                            |
| `GET /public/upload/{job_id}/status`                            | Read the current upload status and progress.                                                    |
| `GET /public/ready`                                             | Report whether the Discord storage client is ready.                                             |
| `GET /public/stream/{token}`                                    | Stream a file and honor the HTTP `Range` header.                                                |
| `GET /public/download/{token}`                                  | Stream a file as an attachment.                                                                 |

These tables describe the routes relevant to the supplied source; they are not intended to replace generated OpenAPI documentation from a running
instance.

---

## Configuration

### Main configuration locations

| File or setting                    | Responsibility                                                                    |
|------------------------------------|-----------------------------------------------------------------------------------|
| `core/config.py`                   | `HOST`, path locations, provider allowlist, logging, frontend distribution paths. |
| `core/utils/env.py`                | Current database/JWT/provider/API credential constants.                           |
| `backend/database/connection.py`   | Builds the PostgreSQL connection pool and creates tables.                         |
| `backend/database/redis_server.py` | Connects to Redis at `redis://localhost:6379`.                                    |
| `backend/server/frontend.py`       | Exposes runtime frontend configuration from `STORELIMITLESS_API_URL`.             |
| `core/main.py`                     | Determines local/cloud URLs, starts services, and passes `VITE_API_URL`.          |
| `backend/server/app.py`            | FastAPI CORS configuration.                                                       |

### Hosting mode

`HOST` is declared in `core/config.py` as either `LOCAL` or `CLOUD`.

- **`LOCAL`**: use the detected LAN address for the API and website URLs. The API listens on `0.0.0.0:8000`, Vite or the packaged frontend on
  `0.0.0.0:5173`, and FTP on port `2121`.
- **`CLOUD`**: start Cloudflare HTTP tunnels for the service on port `8000` and the website on port `5173`, then pass the resulting API URL to the
  frontend. The implementation uses the tunnel helper in `core/utils/binaries.py`.

The current Cloud-mode code does not create a public FTP tunnel. It still starts FTP locally on port `2121`. Redis is intended to remain private on
loopback.

### Runtime paths

`core/config.py` creates or selects these paths:

- `TRANSFER_PATH`: temporary downloads, staging files, and the disposable part cache.
- `BACKUP_DIR`: CSV backup output directory under `backend/database/backup`.
- `LOG_PATH` / `LOG_LOCK_PATH`: application log and file lock (`data/logs.log` and `data/logs.lock` in source mode).
- `TELEGRAM_SESSION`: Telethon session file path, normally under the base data directory.
- `FRONTEND_DIST`: built frontend assets used by packaged execution.

When frozen, the base data directory is under `%LOCALAPPDATA%/StoreLimitless` on Windows, or `$XDG_DATA_HOME/storeLimitless` /
`~/.local/share/storeLimitless` on Linux. In source mode, the base directory is `<repository>/data`. The source-mode `data/transfer/` subdirectory
holds transient downloads, staging files, and cached provider parts; it is not durable storage.

### Credentials and secrets

The uploaded source defines sensitive configuration values directly in `core/utils/env.py`, including the database connection string, JWT signing
secret, Google API key, and Discord/Telegram credentials. Do not copy those values into documentation, commit them to a public repository, or ship
them to other users.

**Treat credentials included in a shared archive as exposed. Rotate the affected database password, API key, bot token, and signing secret before
deployment or publication.** Then move configuration to environment variables or a secret manager and read those variables at startup. Keep secrets
out of logs and build artifacts.

A proper deployment should validate required configuration at startup and fail with a clear message when a required setting is missing, rather than
silently running with an invalid value.

---

## Development setup

### Prerequisites

- Python 3.12 is the best match for the uploaded working tree; the source uses modern typing and Python features.
- Node.js and npm for the Vite/React frontend.
- A PostgreSQL database reachable by the application.
- Redis on `127.0.0.1:6379`. The launcher attempts to use an existing server or launch one when needed.
- Discord bot credentials and access to the configured storage/dump channel.
- Telegram API credentials and a configured destination for stored documents.
- FFmpeg for YouTube media downloads. The binary helper attempts installation on supported systems if it is missing.
- Network access to the configured database, Discord, Telegram, Google Drive, YouTube, and any configured tunnel provider.

### Create a Python environment

From the repository root:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

On Windows PowerShell:

```powershell
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

### Install frontend dependencies

```bash
cd frontend
npm ci
cd ..
```

`npm ci` uses the committed lockfile and is preferable for reproducible local setup. If you intentionally change dependencies, use npm's normal
install workflow and commit both the manifest and lockfile.

### Configure services before launching

1. Set or replace the database connection details with a PostgreSQL database that the application is allowed to use.
2. Configure a strong, private JWT/public-token signing secret.
3. Configure valid Discord bot credentials and the correct dump channel.
4. Configure valid Telegram API credentials, bot token, and dump destination.
5. Confirm that Discord and Telegram clients have the permissions they need.
6. Ensure Redis is available on the configured local address.
7. Rotate any credentials that were present in a shared version of the source.

The current source keeps several values directly in `core/utils/env.py`, so changing only a `.env` file will not automatically change those constants
unless the code is updated to read that file/environment. Verify the configuration loader after moving secrets.

---

## Running StoreLimitless

### Development mode

From the repository root with the Python environment activated:

```bash
python -m core.main
```

`core.main` launches the local service stack. In source mode it automatically checks whether frontend dependencies are installed and runs `npm ci`
(when
`package-lock.json` exists) or `npm install` (when it does not) if Vite is missing. Node.js and npm must be installed on the machine for this recovery
to
work. The build script also removes `frontend/node_modules/` after a successful package build, so the next source-mode startup reinstalls it as
needed.

The launcher starts Vite itself, so do **not** start a second Vite instance on port `5173` at the same time. Frozen/packaged execution serves the
bundled
frontend and does not run npm at startup.

The startup summary prints the API, website, FTP, and Redis addresses. For another device on the same LAN, use the machine's reachable LAN address
rather than `127.0.0.1`. Cloud mode sets the runtime API URL from the public API tunnel.

### Individual frontend commands

From `frontend/`, the typical Vite scripts are defined by `package.json`. The application launcher specifically invokes:

```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

For a standalone production frontend build, use the scripts declared in the actual `package.json`, normally:

```bash
npm run build
```

Return to the repository root before launching `python -m core.main`, because module imports and paths assume the project root is the current working
directory.

### Default listener summary

| Service                  | Default address                 | Notes                                                                 |
|--------------------------|---------------------------------|-----------------------------------------------------------------------|
| Internal FastAPI service | `0.0.0.0:8000`                  | Browser HTTP requests, account actions, upload routes, stream routes. |
| Website                  | `0.0.0.0:5173`                  | Vite in source mode; bundled frontend server in frozen mode.          |
| FTP                      | `0.0.0.0:2121`                  | Plain FTP in the current server setup.                                |
| Redis                    | `127.0.0.1:6379`                | Internal cache/session/progress service; do not expose publicly.      |
| PostgreSQL               | From database connection config | The app connects using `DATABASE_URL` from its configuration module.  |

A service listening on `0.0.0.0` accepts connections through available local interfaces; firewall, router, tunnel, and host rules still determine
whether those connections are reachable from other machines.

---

## Build and packaged distributions

The root `build.sh` builds the React frontend, then packages the Python service with PyInstaller for Linux, Windows, or both. The entry point and path
logic detect whether Python is running as a frozen executable.

### Build commands

Run the script from any working directory; it resolves paths relative to itself:

```bash
# Build only the Linux server
./build.sh 1 0

# Build only the Windows server (requires Wine on Linux)
./build.sh 0 1

# Build both server targets
./build.sh 1 1

# Choose a release version label for output filenames
VERSION=0.1.1 ./build.sh 1 1
```

The two positional arguments must each be `0` or `1`; at least one target must be enabled. The script requires Python 3, `file`, and npm. The Windows
build additionally requires Wine, `wineboot`, `winepath`, and `wget`; it installs a 64-bit Windows Python runtime under its Wine prefix. Because Wine
installs may omit pip despite `Include_pip=1`, the script attempts `ensurepip` and falls back to the official `get-pip.py` bootstrap before installing
Windows dependencies.

Release executables are copied to:

- `releases/linux/StoreLimitlessServer_<VERSION>`
- `releases/windows/StoreLimitlessServer_<VERSION>.exe`

The current build script also copies target executables to `api/src/storelimitless/bin/linux/` and `api/src/storelimitless/bin/windows/` for SDK
bundling.
Those directories are generated/ignored paths and may not exist in a fresh source checkout; the script creates them when building. They are not part
of
the root application's tracked source tree shown above.

### Build cleanup

After a **successful** build, the script removes regeneratable artifacts:

- `build/`, including the temporary Linux virtual environment, Wine prefix, Windows installer/bootstrap files, and PyInstaller work directories.
- `dist/linux/`, `dist/windows/`, and the now-empty `dist/` parent.
- `frontend/node_modules/` and `frontend/dist/`.
- Project `__pycache__/` directories and `.pyc`/`.pyo` files, while pruning `.git`, `.venv`, `venv`, and `node_modules` directories.
- `build.log`, removed last after successful cleanup.

The cleanup is deliberately placed at the end of the script. If a build fails, intermediate artifacts and `build.log` are retained to help diagnose
it. The
script preserves `releases/`, the generated SDK-bundled executable copies, and existing user virtual environments. Since `frontend/node_modules/` is
removed after a successful build, source-mode startup restores the frontend dependencies automatically when Vite is missing.

### Frozen frontend runtime

The packaged startup mode differs from development:

- The frontend is served from the bundled `frontend/dist` assets instead of starting Vite.
- `backend/server/frontend.py` serves the SPA entry point and static assets.
- `/config.js` emits a runtime script assigning `window.STORELIMITLESS_CONFIG.API_URL`.
- Runtime data moves to the operating system's StoreLimitless application-data directory.
- The bundle must include the intended frontend build and required binary/runtime assets.

Do not hand-edit generated JavaScript/CSS in `frontend/dist`; make changes under `frontend/src/` and rebuild. Packaging is platform-specific, so build
and
smoke-test each target on its intended operating system where possible. A successful PyInstaller build alone does not prove that credentials, writable
directories, Redis, media tools, tunnels, or provider authentication work at runtime.

---

## Backups and runtime data

### Database backup utility

`backend/database/backup.py` exports base tables in the PostgreSQL `public` schema to `BACKUP_DIR`. Its command-line format argument supports CSV (the
default) and pretty-formatted terminal output.

From the repository root, with the application's Python dependencies and database configuration available:

```bash
python -m backend.database.backup
python -m backend.database.backup pretty
```

CSV output is useful for inspection and external archiving. This utility is an export script; do not assume it implements a full restore or migration
workflow. Test any restore procedure against a separate database before relying on it.

### What needs backing up

- PostgreSQL data, especially `users`, `directories`, and `files`.
- Configuration secrets, stored securely outside source control.
- Any required local operational state such as Telegram session files, if needed to re-authenticate the client.
- Build/release artifacts if you need to preserve a particular published release.

The part cache and transfer staging directory are disposable and should not be used as a backup source. Remote Discord/Telegram destination content is
the backing store for file bytes; keep access to those destinations and the metadata database aligned.

The repository tree includes CSV exports and runtime log/session files. Check these before publishing a repository: they may contain usernames,
filenames, metadata, tokens, logs, or session material. Do not assume a file is safe to commit just because it is not Python source.

---

## Security notes

This project should be treated as a self-hosted application that requires security hardening before public deployment.

1. **Rotate committed secrets.** The shared source contains hardcoded credentials/configuration values. Treat them as exposed, rotate them, and
   replace hardcoded constants with environment-based configuration or a secret manager.
2. **Move login credentials out of query strings.** The current frontend sends the username and password as query parameters for the login request.
   URLs may be retained by browser history, proxy/server logs, and monitoring systems. Change login to accept a JSON request body and update the
   frontend and backend together.
3. **Keep Redis private.** Redis listens on the local host and is an internal coordination service. Do not expose it directly to the internet.
4. **Do not use plain FTP over untrusted networks.** Add FTPS or another secure transport and configure passive data ports/firewall rules correctly
   before public use.
5. **Treat public links as secrets.** Signed public-link tokens do not currently contain an expiry. Add expiry and a revocation strategy if links must
   be time-limited.
6. **Use HTTPS in public deployments.** The frontend, bearer tokens, account data, and file links should not cross untrusted networks over plain HTTP.
7. **Review CORS and hosting mode.** `backend/server/app.py` has development-oriented local origins, and Cloud mode adds the selected website origin.
   Use an explicit allowlist appropriate for the deployment.
8. **Apply authorization checks to every item operation.** IDs from a client request are not proof of ownership. Keep ownership checks in the backend
   models/routes and FTP virtual filesystem.
9. **Protect backups and logs.** Database exports, logs, session files, and local transfer data may contain sensitive information.
10. **Validate the transfer lifecycle.** Monitor temporary disk usage and ensure failed/cancelled transfer jobs clean up their session keys and
    staging files.

---

## Troubleshooting

### The app never prints “Servers started”

- Check that PostgreSQL is reachable using the configured connection information.
- Check Redis on `127.0.0.1:6379`.
- Verify that Discord credentials are valid and the bot can access the configured dump channel.
- Check the log file configured by `core/config.py`.
- Remember that current startup waits for `Discord.ready`; a Discord startup failure can prevent the ready message even if another service has already
  started.

### The page loads but requests fail

- Confirm the API is listening on port `8000`.
- Check `VITE_API_URL` in development or `STORELIMITLESS_API_URL`/`/config.js` in packaged mode.
- If browsing from another device, do not use `127.0.0.1` as the server address.
- Confirm the website origin is permitted by CORS.
- Check that the bearer token in browser storage is valid and has not expired.

### Uploads stall or fail

- Check free disk space under `TRANSFER_PATH`.
- Confirm the selected data center name is exactly `Discord` or `Telegram`.
- Verify access to the configured remote dump destination.
- Check whether the temporary file still exists and whether the Redis upload session expired.
- For URL imports, check that every link uses HTTP (S). Direct links must return downloadable file content, Google Drive imports require a valid file
  link and configured Google API access, and YouTube imports require `yt-dlp` and FFmpeg.
- When importing several links, use one URL per line. Check each job's separate status in the dashboard tray if one import fails while others
  continue.
- Inspect the returned upload status and server logs for the background transfer error.

### Streaming or seeking fails

- Check that the database `size` and `links` list match the expected number of provider-sized parts.
- Check that every remote part link is still accessible to the configured provider account.
- Check the response status and `Content-Range` for range requests.
- A cache miss is normal; persistent download errors usually point to invalid metadata or provider access.
- Remember that the cache is cleared at startup, so the first read after a restart may need to fetch each required part again.

### FTP login succeeds but directory listing or transfers fail

- Confirm the FTP account exists in StoreLimitless and the password is correct.
- Confirm the client's root is the StoreLimitless virtual `/`, not the host operating system's root.
- For remote clients, configure passive FTP ports and their firewall/tunnel mappings. Reaching port `2121` alone does not guarantee that data
  connections will work.
- Check `TRANSFER_PATH` permissions and the configured storage provider.
- Do not troubleshoot remote passive transfers by exposing Redis or the PostgreSQL port.

### The packaged application cannot find the frontend

- Confirm the frontend build has been generated in `frontend/dist`.
- Confirm PyInstaller bundles the expected `frontend/dist` content.
- Check the runtime `BASE_DIR`/resource path logic in `core/config.py` and `backend/server/frontend.py`.
- Verify that `/config.js` is loaded before the compiled frontend bundle and that the API URL is correct for the target machine.

---

## Developer guide

### Where to make changes

- **New browser page or UI behavior:** `frontend/src/pages/` and `frontend/src/App.jsx`.
- **New folder/file operation:** the corresponding router in `backend/server/routers/directories.py`, plus model methods as required.
- **New account behavior:** `backend/server/routers/accounts.py`, `backend/server/jwt_handler.py`, `backend/server/security.py`, and
  `backend/database/models/user.py`.
- **Browser upload behavior:** `frontend/src/pages/upFiles.jsx`, `backend/server/routers/uploads.py`, `backend/server/routers/upload_state.py`, and
  `core/utils/progress.py`.
- **New storage provider:** implement the provider interface in a module under `core/utils/`, register it in the `DataCenter` provider factory, add
  its name/configuration, and test upload and download paths.
- **Chunk layout or streaming behavior:** `core/data_center.py`, `core/transfer.py`, `core/utils/progress.py`, and `core/stream.py`. Keep upload chunk
  sizing and stream part calculations consistent.
- **FTP semantics:** `backend/ftp/filesystem/filesystem.py` and its upload/download adapters.
- **Runtime URLs or packaging:** `core/main.py`, `core/config.py`, `backend/server/frontend.py`, the frontend environment resolution, and
  `storelimitless-backend.spec`.

### Invariants worth preserving

- A `File` belongs to a user and a parent `Directory`.
- Directory and file lookups must always be scoped to the authenticated username.
- The `/home` directory is the logical root and must not become an ordinary movable/deletable folder.
- `File.links` order must match the order of chunks used by the transfer/stream logic.
- `file.size`, `DataCenter.MAX_SIZE`, and the number of remote links must stay consistent.
- Upload job status and active session state use different Redis keys; don't remove one without understanding the producer/consumer lifecycle.
- Folder move/rename operations must update descendant paths.
- Public stream tokens and bearer tokens have distinct purposes: bearer tokens authorize account actions; public tokens authorize access to a specific
  file stream/download.
- `data/transfer/` in source mode (or the equivalent frozen data-directory path) is temporary. Canonical file bytes live in the configured storage
  provider, and canonical metadata lives in PostgreSQL.

### Recommended verification after a change

At minimum, test the affected workflow through the same path a user uses:

1. Start the services with `python -m core.main`.
2. Register a test account and log in.
3. Create a nested directory and upload a small file.
4. Check the file metadata and download the file back.
5. Upload a larger file and seek within streamed media to exercise multiple stored parts and range handling.
6. Try rename/move/trash/restore using the web UI and verify that the virtual FTP view sees the same state.
7. Test FTP list/download/upload with a client, including passive mode where remote access is required.
8. Restart the server and repeat a read to confirm that storage reconstruction does not depend on the disposable cache.
9. Run the frontend lint/build scripts that are actually declared in `frontend/package.json`.
10. Test the packaged executable separately from development mode.

Automated tests should be added for range parsing, chunk-count validation, upload-range merging, folder path rewriting, ownership/authorization,
public-token expiry, and FTP seek behavior.

---

## Known boundaries and verification notes

- The separate SDK source package is not part of the tracked application tree documented here. The current build script can generate ignored
  `api/src/storelimitless/bin/` paths to store bundled server copies for SDK distribution.
- URL imports support YouTube processing, Google Drive links, and direct HTTP (S) download URLs. A syntactically valid HTTP (S) URL is not guaranteed
  to
  be a downloadable file; ordinary HTML pages and sources requiring unavailable authentication can fail.
- The configured storage backends in the current source are Discord and Telegram; this is not a generic plug-and-play cloud-provider system yet.
- The FTP server is a virtual filesystem adapter, not a full local filesystem shell. Symbolic links and chmod are unsupported.
- Cloud mode in the current startup code opens HTTP tunnels for the API and website only. It does not provide public FTP tunneling or passive-port
  configuration.
- The database backup helper exports data; a matching tested restore/migration process is not established by the supplied code.
- The README describes the supplied source and repository tree. It is not a claim that every deployment mode or workflow has been integration-tested.

For licensing terms, see the repository's `LICENSE` file.
