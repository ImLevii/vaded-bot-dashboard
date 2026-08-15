# Pterodactyl egg — Vaded Gaming (bot + backend API)

One Pterodactyl server that runs **both** the Discord bot and the Express backend API,
supervised by `scripts/start-panel.mjs` in fail-fast mode: if either process dies, the
container exits non-zero and the panel restarts the whole stack — never a half-alive
state where the API answers but the bot is gone (or vice versa).

**Explicitly out of scope:** `packages/frontend`. The dashboard stays on Vercel. This egg
does not install, build, or serve it, and needs exactly **one** allocation — the backend
binds `0.0.0.0:$SERVER_PORT`.

Files in this directory:

| File | Purpose |
| --- | --- |
| `egg-vaded-gaming.json` | PTDL_v2 egg export — import this in the panel |
| `install.sh` | Canonical install script (embedded verbatim in the egg JSON) |
| `entrypoint.sh` | Runtime entrypoint the egg's startup command invokes |
| `.generate-egg.mjs` | Regenerates the egg JSON after editing `install.sh` (`node deploy/pterodactyl/.generate-egg.mjs`) |

---

## Install steps

1. **Panel admin → Nests → Import Egg** → upload `egg-vaded-gaming.json` into a nest.
2. **Provision PostgreSQL** (see next section) and, optionally, Redis.
3. **Create the server** from the egg:
   - Docker image: `ghcr.io/ptero-eggs/yolks:nodejs_24` (default; Node 22 offered as fallback).
   - One allocation. Its port is the backend's public API port.
   - Memory: **1.5 GB minimum, 2 GB recommended.** The bot alone sits around 500 MB+ at
     cold boot (see `ecosystem.config.cjs`), plus the backend and one `prisma migrate` run.
   - Disk: **5 GB+** (node_modules for three workspaces plus builds).
   - Fill the variables (below). `DISCORD_TOKEN` and `GIT_TOKEN` are admin-only
     (`user_viewable: false`) — the server owner cannot see or set them.
4. The install script clones the repo, installs deps for **shared + bot + backend only**,
   runs `prisma generate`, builds shared → bot → backend, prunes dev deps, and drops a
   static `yt-dlp` into `.bin/`. Expect 5–10 minutes on first install.
5. Start the server. First boot runs `prisma migrate deploy` (because
   `RUN_MIGRATIONS=true` by default), then the panel shows **Running** once this line
   appears — it is the egg's `done` string, printed only after the bot has logged
   `Logged in as …` **and** the backend has logged `Web application started on …`:

   ```
   [panel] stack online: bot ready and API listening
   ```

## Database: pointing DATABASE_URL somewhere real

> **Pterodactyl's built-in "database host" feature is MySQL/MariaDB. This app is
> PostgreSQL (see `prisma/schema.prisma`). You cannot use the panel's Databases tab for
> this egg.** Use one of:
>
> - A managed Postgres (Neon, Supabase, etc.):
>   `postgresql://user:password@host:5432/db?sslmode=require`
> - A Postgres you run on the node/homelab, reachable from the Wings machine.
>
> With a **pooled** provider URL (Neon `-pooler`, Supabase pgBouncer), also set
> `DIRECT_URL` to the non-pooled URL — `prisma migrate deploy` goes through it
> (`prisma/prisma.config.ts`); the runtime keeps using `DATABASE_URL`. When `DIRECT_URL`
> is empty the entrypoint falls back to `DATABASE_URL`.

## Variables

### Required

| Variable | Notes |
| --- | --- |
| `DISCORD_TOKEN` | Bot token. Admin-only (not viewable/editable by the owner). |
| `CLIENT_ID` | Discord application ID. |
| `CLIENT_SECRET` | Discord OAuth2 secret — backend exchanges dashboard login codes with it. |
| `DATABASE_URL` | PostgreSQL connection string (see above). |
| `WEBAPP_SESSION_SECRET` | ≥32 chars, `openssl rand -hex 32`. Session cookies for the dashboard. |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | **Required at boot** — `validateBackendEnvironment()` in `packages/shared/src/config/environment.ts` hard-fails without them. Create a free app at developer.spotify.com. |
| `REDIS_HOST` | Must be **non-empty** (same validator). Default `localhost`. |
| `GIT_REPO` / `GIT_REF` | What the installer clones. Defaults: this repo, `main`. |
| `WEBAPP_FRONTEND_URL` | Comma-separated dashboard origin(s) — CORS allowlist + post-login redirect target. Default `https://vaded-bot-dashboard.vercel.app`. |

### About Redis being "required"

The code requires the `REDIS_HOST` **variable** to exist, but tolerates the **server**
being unreachable: the backend logs `Redis shared client unavailable. Backend starting
with fallback behavior.` and the bot uses its in-memory fallback. So:

- **Have Redis?** Set `REDIS_URL` (`rediss://default:pass@host:port/0` — takes precedence,
  parsed by `packages/shared/src/services/redis/config.ts`) or `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`.
- **No Redis?** Leave `REDIS_HOST=localhost`. The stack boots in degraded mode:
  rate-limit counters, bullmq queues, and music-session restore lose cross-restart
  persistence. Fine for testing; run a real Redis for production.

### Optional

| Variable | Default | Notes |
| --- | --- | --- |
| `DIRECT_URL` | *(empty → `DATABASE_URL`)* | Non-pooled URL for migrations. |
| `WEBAPP_BACKEND_URL` | *(empty)* | Public origin of this backend; default base for the Spotify callback. |
| `WEBAPP_REDIRECT_URI` | *(empty)* | Discord OAuth callback override — see wiring section. |
| `DEVELOPER_USER_IDS` | *(empty)* | Comma-separated Discord IDs with dashboard dev access. |
| `RUN_MIGRATIONS` | `true` | Gates `prisma migrate deploy` on boot. Idempotent; set `false` to pin the schema. |
| `AUTO_UPDATE` | `0` | `1` = git pull + reinstall + rebuild on every boot (minutes, not seconds). |
| `LOG_LEVEL` | `2` | Clamped to 2–4 by egg rules: below info-level, the ready markers never print and the panel would stay "starting" forever. |
| `NODE_ENV` | `production` | Keep `production`: cross-origin cookies to Vercel need `Secure` + `SameSite=None`, which the session middleware only sets in production. |
| `METRICS_DISABLED` | `true` | Keeps the bot's Prometheus listener (`:9091`) off so `$SERVER_PORT` is the only listener. |
| `REDIS_URL`, `REDIS_PORT`, `REDIS_PASSWORD` | — | See Redis section. |
| `SENTRY_DSN`, `LASTFM_API_KEY`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | *(empty)* | Feature integrations, all optional. |
| `NODE_OPTIONS` | *(empty)* | e.g. `--max-old-space-size=768`. |
| `YT_DLP_COOKIES_PATH` | *(empty)* | Netscape `cookies.txt` for YouTube bot-checks — common need on datacenter IPs like Pterodactyl nodes. Upload the file, then set e.g. `/home/container/.bin/cookies.txt`. |
| `GIT_USERNAME`, `GIT_TOKEN` | *(empty)* | Private-repo clone credentials (token is admin-only, persists in `.git/config`). |

## Wiring the Vercel dashboard to this backend

Say the allocation is `panel.example.com:25567`.

**On the egg (this server):**

- `WEBAPP_FRONTEND_URL=https://your-dashboard.vercel.app` — this is the CORS origin the
  backend must allow, and where users land after login. (In production the backend also
  accepts `*.vercel.app` and `vaded.gg` origins — `packages/backend/src/middleware/index.ts`.)
- `WEBAPP_BACKEND_URL=https://panel.example.com:25567`
- `NODE_ENV=production` (cookie requirements above). Note the browser will only send the
  session cookie to the backend over **HTTPS** — put the allocation behind TLS
  (Cloudflare Tunnel, reverse proxy, or a cert on the node). Plain `http://ip:port`
  will break logins from the Vercel origin.

**On Vercel (project → Settings → Environment Variables):**

- `VITE_API_BASE_URL=https://panel.example.com:25567` — makes the SPA call this backend
  directly (`packages/frontend/src/services/api.ts`). Rebuild/redeploy after changing it.
- Alternatively keep API calls same-origin and proxy them: add a rewrite in
  `vercel.json` from `/api/:path*` to `https://panel.example.com:25567/api/:path*`
  (the repo already does exactly this for the music routes). Then the backend sees
  `x-forwarded-host` and derives the OAuth callback automatically.

**Discord Developer Portal (OAuth2 → Redirects) — must match exactly:**

- Direct wiring (`VITE_API_BASE_URL`): add
  `https://panel.example.com:25567/api/auth/callback` and set the egg's
  `WEBAPP_REDIRECT_URI` to the same value.
- Proxied wiring (Vercel rewrites): add
  `https://your-dashboard.vercel.app/api/auth/callback` and leave
  `WEBAPP_REDIRECT_URI` empty (forwarded-host logic in
  `packages/backend/src/utils/oauthRedirectUri.ts` builds it per-request).

## Troubleshooting

**1. Panel stuck on "starting" although logs look alive.**
The `done` string only prints after *both* ready markers. Check which half is missing:
no `Logged in as …` → bad `DISCORD_TOKEN` or missing gateway intents (enable Server
Members + Message Content in the Developer Portal); no `Web application started on …` →
backend crashed earlier, scroll up for `Missing required backend environment variables:`
(names the exact vars) or a Prisma error. Also confirm `LOG_LEVEL` ≥ 2 — below that the
markers are suppressed and detection cannot work.

**2. `prisma migrate deploy` fails and the container exits.**
`P1001 Can't reach database server`: the URL points somewhere Wings can't reach —
remember the container has its own network namespace; `localhost` is *not* the node
host. `prepared statement`/shadow-db errors on Neon/Supabase: you gave the pooled URL —
set `DIRECT_URL` to the non-pooled one. `relation … does not exist` at backend boot
with `RUN_MIGRATIONS=false`: turn it back on for one boot.

**3. Dashboard loads but login loops / API calls fail in the browser.**
Three usual suspects, in order: (a) CORS — the browser origin isn't in
`WEBAPP_FRONTEND_URL` (must be the exact `https://…` origin, no trailing slash);
(b) cookies — backend reached over plain HTTP or `NODE_ENV != production`, so the
`Secure`/`SameSite=None` cookie is never stored; (c) `redirect_uri mismatch` from
Discord — the callback URL in the Developer Portal doesn't byte-for-byte match what the
backend sent (see wiring section). `https://<backend>/api/health` shows the resolved
auth config.

**Other things worth knowing**

- *Install fails compiling `@discordjs/opus`*: the installer needs
  `build-essential`/`python3` (it installs them itself) — if apt was blocked by an
  egress filter, whitelist deb.debian.org and reinstall.
- *YouTube tracks fail with "Sign in to confirm you're not a bot"*: set
  `YT_DLP_COOKIES_PATH` (see variables).
- *Port already in use / API on the wrong port*: the backend falls back to port+1 on
  `EADDRINUSE` (`packages/backend/src/server.ts`) — if you ever see
  `Port X in use, trying X+1`, something else in the container grabbed the allocation;
  don't run extra processes in this server.
- Non-API browser hits on the backend (e.g. opening `https://panel…:25567/` directly)
  return errors — expected, the SPA lives on Vercel, the backend only serves `/api/*`.
