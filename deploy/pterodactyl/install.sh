#!/bin/bash
# -----------------------------------------------------------------------------
# Pterodactyl installation script for the Vaded Gaming bot + backend egg.
#
# Runs AS ROOT inside the egg's install container (node:24-bookworm-slim),
# with the server volume mounted at /mnt/server. Native modules compiled here
# (glibc 2.36) run fine on the nodejs_24 yolk runtime image (node:24-trixie-slim,
# glibc 2.41).
#
# This file is the canonical source of the egg's scripts.installation.script.
# If you edit it, re-embed it into deploy/pterodactyl/egg-vaded-gaming.json
# (the egg carries a verbatim copy — Pterodactyl cannot reference files).
#
# Consumes (egg variables, injected as plain env vars):
#   GIT_REPO      (required) https clone URL
#   GIT_REF       branch or tag, default "main"
#   GIT_USERNAME  optional, for private repos
#   GIT_TOKEN     optional, for private repos (PAT)
#
# Deliberately NOT done here: anything involving packages/frontend. The
# dashboard is deployed on Vercel; this server only ever runs bot + backend.
# -----------------------------------------------------------------------------
set -euo pipefail

log() { echo "[install] $1"; }

# Wings allocates a pseudo-TTY for install containers but never feeds it
# input. Without this, `git clone`/`git fetch` on a private repo with no
# credentials set doesn't error — it silently blocks forever waiting for a
# username on that TTY, which is the single most common cause of an install
# that looks "stuck" with no further log output. Forcing this to 0 makes a
# missing-credentials case fail fast with a clear message instead of hanging.
export GIT_TERMINAL_PROMPT=0

# Pterodactyl injects EVERY declared egg variable into the install container's
# environment too, not just the runtime one — including NODE_ENV, whose egg
# default is "production" (correct for the running app: it gates secure
# cross-origin cookies). `npm ci`/`npm run build` under NODE_ENV=production
# silently skip devDependencies, so typescript/tsup/etc. never get installed
# and the workspace builds fail or fall back to whatever stray typescript
# happens to be hoisted at the repo root (reproduced: this is what caused
# `tsc -b` in packages/shared to fail with "TS5103: Invalid value for
# '--ignoreDeprecations'" — it ran against a wrong, non-workspace typescript).
# Force development mode for the whole install regardless of the egg
# variable; entrypoint.sh sets its own NODE_ENV independently at runtime, so
# this has no effect on the running app.
export NODE_ENV=development

: "${GIT_REPO:?GIT_REPO is required (https URL of the repository to deploy)}"
GIT_REF="${GIT_REF:-main}"

export DEBIAN_FRONTEND=noninteractive
log "Installing build prerequisites (git, curl, C toolchain for native deps)..."
apt-get update -qq
# build-essential + python3: @discordjs/opus has no prebuilt for Node 24's ABI
# and source-compiles; mediaplex/@snazzah/davey fetch napi prebuilds but keep
# the toolchain available as their fallback path too.
apt-get install -y -qq --no-install-recommends \
    git ca-certificates curl build-essential python3 python3-dev

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
log "Node.js $(node -v) / npm $(npm -v) in install container"
if [ "$NODE_MAJOR" -lt 22 ] || [ "$NODE_MAJOR" -ge 27 ]; then
    echo "[install] FATAL: this project requires Node >=22 <27 (package.json engines);" \
         "the install container has Node $NODE_MAJOR. Fix the egg's install container image." >&2
    exit 1
fi

# --- Fetch the repository ----------------------------------------------------
cd /mnt/server

CLONE_URL="$GIT_REPO"
if [ -n "${GIT_USERNAME:-}" ] && [ -n "${GIT_TOKEN:-}" ]; then
    # Inject credentials for private repos. NOTE: they persist in .git/config
    # on the server volume; prefer a fine-grained, read-only deploy token.
    CLONE_URL="$(echo "$GIT_REPO" | sed "s#https://#https://${GIT_USERNAME}:${GIT_TOKEN}@#")"
fi

GIT_AUTH_HINT="If ${GIT_REPO} is a private repository, set the GIT_USERNAME and GIT_TOKEN egg variables (a read-only PAT) and reinstall."

if [ -d .git ]; then
    log "Existing checkout found — updating to ${GIT_REF} (reinstall)"
    git remote set-url origin "$CLONE_URL"
    git fetch --depth 1 origin "$GIT_REF" \
        || { echo "[install] FATAL: git fetch failed (repo unreachable, ref '${GIT_REF}' not found, or auth rejected). ${GIT_AUTH_HINT}" >&2; exit 1; }
    git checkout -f FETCH_HEAD
else
    log "Cloning ${GIT_REPO} (${GIT_REF})..."
    git clone --depth 1 --branch "$GIT_REF" "$CLONE_URL" . \
        || { echo "[install] FATAL: git clone failed (repo unreachable, ref '${GIT_REF}' not found, or auth rejected). ${GIT_AUTH_HINT}" >&2; exit 1; }
fi
git config --global --add safe.directory /mnt/server || true

# --- Install workspace dependencies (shared + bot + backend ONLY) ------------
# - No --ignore-scripts: @discordjs/opus (root allowScripts), prisma engines,
#   mediaplex and @snazzah/davey all need their install scripts.
# - YOUTUBE_DL_SKIP_DOWNLOAD: youtube-dl-exec's postinstall would download its
#   own yt-dlp; we ship a pinned static binary below instead (same approach as
#   the project Dockerfile).
# - --legacy-peer-deps mirrors the project's own Dockerfile/npm usage.
log "Installing npm dependencies for root + shared + bot + backend..."
export YOUTUBE_DL_SKIP_DOWNLOAD=1
npm ci --legacy-peer-deps --no-audit --no-fund \
    --include-workspace-root \
    --workspace packages/shared \
    --workspace packages/bot \
    --workspace packages/backend

# --- Prisma client + builds ---------------------------------------------------
# prisma generate does not connect to a database; scripts/db-generate.mjs
# supplies a placeholder DATABASE_URL when none is set.
log "Generating Prisma client..."
npm run db:generate

log "Building packages: shared -> bot -> backend..."
npm run build:shared
npm run build --workspace=packages/bot
npm run build --workspace=packages/backend

# The prisma-client generator emits runtime assets (wasm/js) into
# packages/shared/src/generated that tsc does not carry into dist. The
# project's Docker images overlay src/generated onto dist/generated; mirror
# that here so shared/dist imports resolve at runtime.
log "Overlaying generated Prisma runtime assets into shared/dist..."
mkdir -p packages/shared/dist/generated
cp -a packages/shared/src/generated/. packages/shared/dist/generated/

# --- Prune dev dependencies ---------------------------------------------------
# Safe because the runtime path is compiled dist + the prisma CLI, and prisma
# is a *production* dependency at the repo root (needed for migrate deploy).
#
# MUST repeat the same --workspace scoping as the npm ci above: an unscoped
# `npm prune` reconciles against the FULL root package.json workspace list
# (all of packages/*, including frontend), and since frontend was never
# installed, prune doesn't just skip it — it INSTALLS frontend's entire
# dependency tree (react, vite, tsparticles, ...) to "fix" the mismatch.
# Reproduced and confirmed: unscoped prune here pulled in 875MB of frontend
# deps, a direct violation of "never install the frontend" for this egg.
log "Pruning dev dependencies..."
npm prune --omit=dev --legacy-peer-deps \
    --workspace packages/shared \
    --workspace packages/bot \
    --workspace packages/backend

# --- Static yt-dlp binary -----------------------------------------------------
# The nodejs_24 yolk ships ffmpeg but not yt-dlp. streamBridge.ts resolves the
# binary via YT_DLP_PATH (exported by deploy/pterodactyl/entrypoint.sh to this
# location, matching the path bot/scripts/ensureYtDlp.mjs uses).
ARCH="$(uname -m)"
case "$ARCH" in
    aarch64|arm64) YTDLP_ASSET="yt-dlp_linux_aarch64" ;;
    *)             YTDLP_ASSET="yt-dlp_linux" ;;
esac
log "Downloading static yt-dlp (${YTDLP_ASSET})..."
mkdir -p .bin
if curl -fsSL --connect-timeout 10 --max-time 180 -o .bin/yt-dlp \
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YTDLP_ASSET}"; then
    chmod 755 .bin/yt-dlp
else
    # Non-fatal: only YouTube/SoundCloud playback via yt-dlp is affected, and
    # the entrypoint prints a warning when the binary is missing.
    echo "[install] WARNING: yt-dlp download failed; YouTube playback will not work" \
         "until /home/container/.bin/yt-dlp exists." >&2
fi

mkdir -p downloads logs

# --- Ownership ----------------------------------------------------------------
# Wings re-chowns the volume to the runtime user after install, but do it here
# too so a manual/failed-midway install never leaves root-owned files behind.
# uid/gid 1000 matches the "container" user in ghcr.io/ptero-eggs/yolks images.
log "Fixing ownership..."
chown -R 1000:1000 /mnt/server || true

log "Install complete. Startup will run deploy/pterodactyl/entrypoint.sh."
exit 0
