#!/usr/bin/env bash
# Build the StoreLimitless Vite frontend locally and deploy both Vercel projects.
# Frontend: storelimitless.vercel.app
# Backend:  storelimitlessbackend.vercel.app
# No git commit or push is performed.

set -Eeuo pipefail

SYSTEM_PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
PATH="${PATH:+${PATH:}${SYSTEM_PATH}"
export PATH

log() {
    printf '\n\033[1;32m==> %s\033[0m\n' "$1"
}

fail() {
    printf 'Error: %s\n' "$1" >&2
    exit 1
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ -n "${1:-}" ]]; then
    REPO_ROOT="$(cd -- "$1" && pwd)"
elif [[ -f "$SCRIPT_DIR/frontend/package.json" ]]; then
    REPO_ROOT="$SCRIPT_DIR"
elif [[ -f "$PWD/frontend/package.json" ]]; then
    REPO_ROOT="$(cd -- "$PWD" && pwd)"
else
    cat >&2 <<'MESSAGE'
Could not find the StoreLimitless repository (expected frontend/package.json).
Place build-vercel.sh in the repository root and run ./build-vercel.sh, or pass
an explicit repository path: ./build-vercel.sh /path/to/Store-Limitless
MESSAGE
    exit 1
fi

FRONTEND_DIR="$REPO_ROOT/frontend"
BACKEND_DIR="$REPO_ROOT/backend/storelimitlessbackend"
ROOT_VERCEL_DIR="$REPO_ROOT/.vercel"
BACKEND_VERCEL_DIR="$BACKEND_DIR/.vercel"
FRONTEND_DOMAIN="${VERCEL_FRONTEND_DOMAIN:-storelimitless.vercel.app}"
BACKEND_DOMAIN="${VERCEL_BACKEND_DOMAIN:-storelimitlessbackend.vercel.app}"
BACKEND_API_URL="https://${BACKEND_DOMAIN}"
VERCEL_SCOPE="${VERCEL_SCOPE:-}"

[[ -f "$FRONTEND_DIR/package.json" ]] || fail "frontend/package.json was not found under $REPO_ROOT"
[[ -f "$FRONTEND_DIR/vercel.json" ]] || fail "frontend/vercel.json was not found; expected the StoreLimitless Vite frontend"
[[ -f "$BACKEND_DIR/package.json" ]] || fail "backend/storelimitlessbackend/package.json was not found"

for tool in node npm git; do
    command -v "$tool" >/dev/null 2>&1 || fail "Required tool '$tool' is not installed or not on PATH"
done

# Use the installed CLI when available, otherwise use npx to get the Vercel CLI.
vercel_cli() {
    if command -v vercel >/dev/null 2>&1; then
        vercel "$@"
    else
        npx --yes vercel@latest "$@"
    fi
}

log "Checking tools and Vercel authentication"
printf 'Node: %s\n' "$(node --version)"
printf 'npm:  %s\n' "$(npm --version)"
if ! vercel_cli whoami >/dev/null 2>&1; then
    echo "You are not logged into Vercel. Starting Vercel login..."
    vercel_cli login
fi

# Keep all local Vercel links and pulled frontend environment variables out of Git.
if git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    GIT_EXCLUDE="$(git -C "$REPO_ROOT" rev-parse --git-path info/exclude)"
    if [[ "$GIT_EXCLUDE" != /* ]]; then GIT_EXCLUDE="$REPO_ROOT/$GIT_EXCLUDE"; fi
    mkdir -p "$(dirname -- "$GIT_EXCLUDE")"
    touch "$GIT_EXCLUDE"
    for exclude_pattern in '/.vercel/' '/frontend/.vercel/' '/backend/storelimitlessbackend/.vercel/' '/frontend/.env.production.local'; do
        if ! grep -Fqx "$exclude_pattern" "$GIT_EXCLUDE"; then
            printf '%s\n' "$exclude_pattern" >> "$GIT_EXCLUDE"
        fi
    done
fi

project_name_from_link() {
    local project_json="$1"
    [[ -f "$project_json" ]] || return 0
    node -e 'try { process.stdout.write(String(require(process.argv[1]).projectName || "")); } catch {}' "$project_json"
}

# Reuse each directory's existing link by default. Internal Vercel project slugs
# need not match production aliases (the frontend is linked to "drive-bot").
FRONTEND_LINKED_PROJECT="$(project_name_from_link "$ROOT_VERCEL_DIR/project.json" 2>/dev/null || true)"
BACKEND_LINKED_PROJECT="$(project_name_from_link "$BACKEND_VERCEL_DIR/project.json" 2>/dev/null || true)"
FRONTEND_PROJECT="${VERCEL_FRONTEND_PROJECT:-$FRONTEND_LINKED_PROJECT}"
BACKEND_PROJECT="${VERCEL_BACKEND_PROJECT:-$BACKEND_LINKED_PROJECT}"
printf 'Frontend Vercel project: %s (domain %s)\n' "${FRONTEND_PROJECT:-select existing project}" "$FRONTEND_DOMAIN"
printf 'Backend Vercel project:  %s (domain %s)\n' "${BACKEND_PROJECT:-select existing project}" "$BACKEND_DOMAIN"

# Link each local directory to the intended EXISTING Vercel project. Inspect first
# so a typo or wrong team cannot silently create a third project under --yes.
ensure_project_link() {
    local project_dir="$1" project_name="$2"
    local project_json="$project_dir/.vercel/project.json" current_name=""
    local -a inspect_args=(project inspect "$project_name")
    local -a link_args=(link --yes --project "$project_name")

    if [[ -n "$VERCEL_SCOPE" ]]; then
        inspect_args+=(--scope "$VERCEL_SCOPE")
        link_args+=(--scope "$VERCEL_SCOPE")
    fi

    if [[ -f "$project_json" ]]; then
        current_name="$(project_name_from_link "$project_json")"
        if [[ -n "$project_name" && "${current_name,,}" == "${project_name,,}" ]]; then
            log "Verified $project_dir is linked to Vercel project '$project_name'"
            return
        fi
        if [[ -z "$project_name" ]]; then
            project_name="$current_name"
        fi
        if [[ -n "$project_name" ]]; then
            log "Local link points to '${current_name:-an unknown project}'; switching to '$project_name'"
        fi
    fi

    if [[ -z "$project_name" ]]; then
        # No local link exists yet. Do not guess the project slug from its domain.
        # Let the user select the existing Vercel project in the CLI prompt.
        log "No existing Vercel link found for $project_dir."
        log "Select the EXISTING project that owns $BACKEND_DOMAIN; do not create a new project."
        local -a interactive_link_args=(link)
        if [[ -n "$VERCEL_SCOPE" ]]; then interactive_link_args+=(--scope "$VERCEL_SCOPE"); fi
        (cd "$project_dir" && vercel_cli "${interactive_link_args[@]}")
        [[ -f "$project_json" ]] || fail "Vercel did not create $project_json after project selection."
        project_name="$(project_name_from_link "$project_json")"
        [[ -n "$project_name" ]] || fail "Could not read the selected Vercel project name from $project_json."
        log "Selected existing Vercel project '$project_name'"
        return
    fi

    if ! (cd "$project_dir" && vercel_cli "${inspect_args[@]}") >/dev/null; then
        fail "Could not verify existing Vercel project '$project_name'. Check the project name, account, and VERCEL_SCOPE. No new project was intentionally created."
    fi

    log "Linking $project_dir to existing Vercel project '$project_name'"
    (cd "$project_dir" && vercel_cli "${link_args[@]}")
    [[ -f "$project_json" ]] || fail "Vercel did not create $project_json"
    current_name="$(project_name_from_link "$project_json")"
    [[ "${current_name,,}" == "${project_name,,}" ]] || fail "Project link mismatch: expected '$project_name', received '${current_name:-unknown}'"
}

log "Verifying and linking the two separate Vercel projects"
mkdir -p "$ROOT_VERCEL_DIR"
ensure_project_link "$REPO_ROOT" "$FRONTEND_PROJECT"
ensure_project_link "$BACKEND_DIR" "$BACKEND_PROJECT"

log "Installing locked frontend dependencies"
(cd "$FRONTEND_DIR" && npm ci)

log "Pulling the frontend production environment variables"
env_pull_args=(env pull frontend/.env.production.local --environment=production --yes)
if [[ -n "$VERCEL_SCOPE" ]]; then env_pull_args+=(--scope "$VERCEL_SCOPE"); fi
(cd "$REPO_ROOT" && vercel_cli "${env_pull_args[@]}")
chmod 600 "$FRONTEND_DIR/.env.production.local" 2>/dev/null || true

log "Building the Vite frontend locally for $FRONTEND_DOMAIN"
# Force the stable backend domain into the production bundle even if an old Vercel
# environment variable still points directly at a temporary Cloudflare tunnel.
(cd "$FRONTEND_DIR" && VITE_API_URL="$BACKEND_API_URL" npm run build)
[[ -f "$FRONTEND_DIR/dist/index.html" ]] || fail "Vite did not produce frontend/dist/index.html; production deployment stopped"

log "Preparing Vercel static Build Output for the frontend"
rm -rf "$ROOT_VERCEL_DIR/output"
mkdir -p "$ROOT_VERCEL_DIR/output/static"
cp -a "$FRONTEND_DIR/dist/." "$ROOT_VERCEL_DIR/output/static/"

# Build Output API v3: static files first, then React Router SPA paths to index.html.
cat > "$ROOT_VERCEL_DIR/output/config.json" <<'JSON'
{
  "version": 3,
  "routes": [
    { "handle": "filesystem" },
    { "src": "/(.*)", "dest": "/index.html" }
  ]
}
JSON

[[ -f "$ROOT_VERCEL_DIR/output/config.json" ]] || fail "Failed to create frontend Vercel output configuration"
[[ -f "$ROOT_VERCEL_DIR/output/static/index.html" ]] || fail "Frontend Vercel output is missing index.html"

# Vercel's CLI prints the deployment URL to stdout. Assign the required production
# alias explicitly after deploying, so the two projects cannot swap domains silently.
deploy_and_alias() {
    local project_dir="$1"
    local label="$2"
    local domain="$3"
    shift 3
    local deployment_output=""
    local deployment_url=""

    log "Deploying $label to Vercel production"
    if ! deployment_output="$(cd "$project_dir" && vercel_cli "$@" 2>&1)"; then
        printf '%s\n' "$deployment_output" >&2
        fail "$label deployment failed. Check the Vercel build output above."
    fi
    printf '%s\n' "$deployment_output"

    # Vercel output may include both a deployment URL and domain aliases. Filter
    # both target aliases so alias set receives the unique deployment URL.
    deployment_url="$(printf '%s\n' "$deployment_output" \
        | grep -Eo 'https://[A-Za-z0-9.-]+\.vercel\.app' \
        | grep -Fvx "https://${FRONTEND_DOMAIN}" \
        | grep -Fvx "https://${BACKEND_DOMAIN}" \
        | tail -n 1 || true)"
    [[ -n "$deployment_url" ]] || fail "Could not extract the unique Vercel deployment URL for $label from the deploy output."
    printf 'Deployment URL: %s\n' "$deployment_url"

    log "Assigning $domain to $label"
    if [[ -n "$VERCEL_SCOPE" ]]; then
        (cd "$project_dir" && vercel_cli alias set "$deployment_url" "$domain" --scope "$VERCEL_SCOPE")
    else
        (cd "$project_dir" && vercel_cli alias set "$deployment_url" "$domain")
    fi
}

# Deploy the Next.js API proxy first, then ship the static frontend pointed at it.
deploy_and_alias "$BACKEND_DIR" "StoreLimitless backend" "$BACKEND_DOMAIN" deploy --prod --yes
deploy_and_alias "$REPO_ROOT" "StoreLimitless frontend" "$FRONTEND_DOMAIN" deploy --prebuilt --prod --yes

cat <<MESSAGE

Both production deployment commands completed:
  Frontend: https://${FRONTEND_DOMAIN}
  Backend:  https://${BACKEND_DOMAIN}

The frontend was built locally with Vite. The backend was deployed from:
  ${BACKEND_DIR}
No git commit or git push was performed.
MESSAGE