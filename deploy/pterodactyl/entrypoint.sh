#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Pterodactyl runtime entrypoint for the Vaded Gaming bot + backend egg.
#
# Invoked by the egg startup command as the non-root "container" user with
# CWD=/home/container. Validates the environment, optionally runs migrations,
# then exec's the panel supervisor (scripts/start-panel.mjs) so signals from
# Wings reach it directly. The supervisor runs bot + backend in fail-fast
# mode: if either child dies, the whole container exits non-zero and the
# panel restarts it — no half-alive stack.
#
# The frontend is deliberately absent: it lives on Vercel. The backend binds
# the server's single allocation ($SERVER_PORT) and nothing else needs a port.
# -----------------------------------------------------------------------------
set -uo pipefail

cd /home/container || exit 1

echo "[entrypoint] node $(node -v) | $(date -u +%Y-%m-%dT%H:%M:%SZ) | vaded-gaming bot+backend"

# --- Validate required environment -------------------------------------------
# DISCORD_TOKEN / CLIENT_ID / DATABASE_URL: required by ensureEnvironment()
# for both apps. CLIENT_SECRET / WEBAPP_SESSION_SECRET / SPOTIFY_* / REDIS_HOST:
# required by the backend (validateBackendEnvironment() + session middleware +
# Discord OAuth token exchange). Failing here, by name, beats a stack trace
# from deep inside the app.
MISSING=()
for VAR in DISCORD_TOKEN CLIENT_ID CLIENT_SECRET DATABASE_URL \
           WEBAPP_SESSION_SECRET SPOTIFY_CLIENT_ID SPOTIFY_CLIENT_SECRET REDIS_HOST; do
    if [ -z "${!VAR:-}" ]; then
        MISSING+=("$VAR")
    fi
done
if [ "${#MISSING[@]}" -gt 0 ]; then
    echo "" >&2
    echo "[entrypoint] FATAL: missing required environment variable(s):" >&2
    for VAR in "${MISSING[@]}"; do
        echo "[entrypoint]   - $VAR" >&2
    done
    echo "[entrypoint] Set them in the panel's Startup tab (admins: also check egg variable visibility) and restart." >&2
    exit 1
fi

if [ -z "${SERVER_PORT:-}" ]; then
    echo "[entrypoint] FATAL: SERVER_PORT is not set. This script must run inside Pterodactyl (Wings injects SERVER_PORT from the primary allocation)." >&2
    exit 1
fi

# --- Derived / defaulted environment ------------------------------------------
# Backend port resolution is PORT -> WEBAPP_PORT -> 3000 (packages/backend/src/
# server.ts); pin both to the allocation so nothing falls back to 3000.
export NODE_ENV="${NODE_ENV:-production}"
export PORT="$SERVER_PORT"
export WEBAPP_PORT="$SERVER_PORT"
export WEBAPP_HOST="${WEBAPP_HOST:-0.0.0.0}"

# Prisma CLI (migrate deploy) reads DIRECT_URL, falling back to DATABASE_URL
# (prisma/prisma.config.ts). Make the fallback explicit for clarity in logs.
export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"

# Single-listener policy: the bot's Prometheus metrics server (:9091) is off
# unless the METRICS_DISABLED egg variable is explicitly set to "false".
export METRICS_DISABLED="${METRICS_DISABLED:-true}"

# Static yt-dlp provisioned by install.sh; streamBridge.ts resolves it via
# YT_DLP_PATH. Missing binary is a warning, not a boot failure — everything
# except yt-dlp-backed sources still works.
if [ -z "${YT_DLP_PATH:-}" ]; then
    if [ -x /home/container/.bin/yt-dlp ]; then
        export YT_DLP_PATH=/home/container/.bin/yt-dlp
    else
        echo "[entrypoint] WARNING: /home/container/.bin/yt-dlp not found — YouTube/SoundCloud playback via yt-dlp will fail. Reinstall the server to restore it." >&2
    fi
fi

# --- Optional self-update ------------------------------------------------------
if [ "${AUTO_UPDATE:-0}" = "1" ] || [ "${AUTO_UPDATE:-0}" = "true" ]; then
    echo "[entrypoint] AUTO_UPDATE enabled — pulling ${GIT_REF:-main} and rebuilding (this can take several minutes)..."
    if git pull --ff-only; then
        # Subshell so NODE_ENV=development (needed for the same reason as
        # install.sh: `npm ci`/`npm run build` under NODE_ENV=production
        # skip devDependencies, which breaks the typescript build — see
        # install.sh's comment) doesn't leak out and override the
        # NODE_ENV=production already exported above for the app launch below.
        (
            export NODE_ENV=development
            export YOUTUBE_DL_SKIP_DOWNLOAD=1
            npm ci --legacy-peer-deps --no-audit --no-fund \
                --include-workspace-root \
                --workspace packages/shared \
                --workspace packages/bot \
                --workspace packages/backend \
            && npm run db:generate \
            && npm run build:shared \
            && npm run build --workspace=packages/bot \
            && npm run build --workspace=packages/backend \
            && cp -a packages/shared/src/generated/. packages/shared/dist/generated/ \
            && npm prune --omit=dev --legacy-peer-deps \
                --workspace packages/shared \
                --workspace packages/bot \
                --workspace packages/backend
        ) || { echo "[entrypoint] FATAL: AUTO_UPDATE rebuild failed — fix the build or set AUTO_UPDATE=0 to boot the previous build." >&2; exit 1; }
    else
        # A failed pull is easy to miss: the stack still boots, just on stale
        # code, so a fix you just pushed silently isn't running and every
        # symptom looks like the bug was never fixed. Say so unmissably and
        # name the actual causes (see the git error printed directly above).
        echo "[entrypoint] ==================================================================" >&2
        echo "[entrypoint] WARNING: git pull FAILED — see the git error immediately above." >&2
        echo "[entrypoint] Booting the PREVIOUSLY BUILT code: anything you just pushed is NOT" >&2
        echo "[entrypoint] running. Common causes:" >&2
        echo "[entrypoint]   * 'untracked working tree files would be overwritten' — a file was" >&2
        echo "[entrypoint]     copied in by hand (SFTP/file manager) at a path that is now" >&2
        echo "[entrypoint]     tracked upstream. Move or delete that path, then restart." >&2
        echo "[entrypoint]   * local edits to tracked files — 'git checkout -- <path>' to drop." >&2
        echo "[entrypoint]   * private repo without GIT_USERNAME / GIT_TOKEN set." >&2
        echo "[entrypoint] ==================================================================" >&2
    fi
fi

# --- Database migrations (gated) ------------------------------------------------
if [ "${RUN_MIGRATIONS:-true}" = "true" ] || [ "${RUN_MIGRATIONS:-true}" = "1" ]; then
    echo "[entrypoint] RUN_MIGRATIONS=true — running prisma migrate deploy..."
    if ! npx prisma migrate deploy --config prisma/prisma.config.ts; then
        echo "[entrypoint] FATAL: prisma migrate deploy failed. Check DATABASE_URL/DIRECT_URL and that the database is reachable from this node. The backend refuses to start on an unmigrated schema, so stopping here." >&2
        exit 1
    fi
else
    echo "[entrypoint] RUN_MIGRATIONS is off — skipping prisma migrate deploy."
fi

# --- Launch --------------------------------------------------------------------
# Fail-fast supervisor: bot + backend compiled dists, either child exiting
# takes the whole process down non-zero. PANEL_READY_LINE is the egg's
# config.startup.done string — printed only after the bot logs "Logged in as"
# AND the backend logs "Web application started on".
export PANEL_SERVICES="${PANEL_SERVICES:-bot,backend}"
export PANEL_DIST="${PANEL_DIST:-true}"
export PANEL_FAIL_FAST="${PANEL_FAIL_FAST:-true}"
export PANEL_READY_LINE="${PANEL_READY_LINE:-[panel] stack online: bot ready and API listening}"

echo "[entrypoint] starting supervisor: services=${PANEL_SERVICES} port=${SERVER_PORT}"
exec node scripts/start-panel.mjs
