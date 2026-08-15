// One-shot generator for egg-vaded-gaming.json. Embeds install.sh verbatim.
// Not part of the runtime; re-run after editing install.sh:
//   node deploy/pterodactyl/.generate-egg.mjs
//
// --local: also writes egg-vaded-gaming.local.json, a copy with default_value
// pre-filled from the repo root .env for every variable that has a live
// value there. That file is gitignored (deploy/pterodactyl/*.local.json) —
// it is a personal one-click import for THIS deployment, not something to
// share or commit. The tracked egg-vaded-gaming.json always keeps empty/
// placeholder defaults so it stays safe to publish and reusable by anyone.
//   node deploy/pterodactyl/.generate-egg.mjs --local
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')
const installScript = readFileSync(join(here, 'install.sh'), 'utf8')

// Minimal .env parser (no dependency on `dotenv` resolving from this
// directory). Good enough for KEY=VALUE lines with optional quotes; this
// script only ever reads secrets already present in the developer's own
// gitignored .env, never writes to it.
function parseDotEnv(path) {
    const values = {}
    if (!existsSync(path)) return values
    const text = readFileSync(path, 'utf8')
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) continue
        const eq = line.indexOf('=')
        if (eq === -1) continue
        const key = line.slice(0, eq).trim().replace(/^export\s+/, '')
        let value = line.slice(eq + 1).trim()
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1)
        }
        if (value) values[key] = value
    }
    return values
}

const v = (name, description, env, def, rules, viewable = true, editable = true) => ({
    name,
    description,
    env_variable: env,
    default_value: def,
    user_viewable: viewable,
    user_editable: editable,
    rules,
    field_type: 'text',
})

const egg = {
    _comment:
        'DO NOT EDIT: FILE GENERATED AUTOMATICALLY BY PTERODACTYL PANEL - PTERODACTYL.IO',
    meta: { version: 'PTDL_v2', update_url: null },
    exported_at: '2026-08-15T00:00:00+00:00',
    uuid: '7c1f65de-52a4-4f8a-9c07-b1e2a9d3f410',
    name: 'Vaded Gaming — Bot + Backend API',
    author: 'services.vadedhosting@gmail.com',
    description:
        'Runs the Vaded Gaming Discord bot and its Express backend API in a single server. ' +
        'The backend binds the primary allocation and serves the Vercel-hosted dashboard ' +
        '(packages/frontend is NOT built or served here). Requires an external PostgreSQL ' +
        'database (Pterodactyl’s built-in database hosts are MySQL and will not work) and, ' +
        'optionally, a Redis instance. See deploy/pterodactyl/README.md in the repository.',
    features: [],
    docker_images: {
        'Node.js 24': 'ghcr.io/ptero-eggs/yolks:nodejs_24',
        'Node.js 22': 'ghcr.io/ptero-eggs/yolks:nodejs_22',
    },
    file_denylist: [],
    startup: 'bash deploy/pterodactyl/entrypoint.sh',
    config: {
        files: '{}',
        startup: '{\r\n    "done": "stack online: bot ready and API listening"\r\n}',
        logs: '{}',
        stop: '^^C',
    },
    scripts: {
        installation: {
            script: installScript,
            container: 'node:24-bookworm-slim',
            entrypoint: 'bash',
        },
    },
    variables: [
        v(
            'Discord Bot Token',
            'Bot token from the Discord Developer Portal (Bot tab). Secret: hidden from the server owner; set by an administrator.',
            'DISCORD_TOKEN',
            '',
            'required|string',
            false,
            false,
        ),
        v(
            'Discord Client ID',
            'Application ID of the Discord application (OAuth2 tab).',
            'CLIENT_ID',
            '',
            'required|string|max:191',
        ),
        v(
            'Discord Client Secret',
            'OAuth2 client secret of the Discord application. Required by the backend to exchange OAuth codes for dashboard logins.',
            'CLIENT_SECRET',
            '',
            'required|string',
        ),
        v(
            'Database URL (PostgreSQL)',
            'PostgreSQL connection string, e.g. postgresql://user:password@host:5432/dbname?sslmode=require. Must be PostgreSQL — Pterodactyl’s built-in database hosts are MySQL and will NOT work. Use Neon/Supabase or a Postgres you run on the node.',
            'DATABASE_URL',
            '',
            'required|string',
        ),
        v(
            'Direct Database URL',
            'Optional non-pooled PostgreSQL URL used only by prisma migrate deploy. Leave empty to reuse Database URL. Required for pooled providers (Neon/Supabase poolers).',
            'DIRECT_URL',
            '',
            'nullable|string',
        ),
        v(
            'Session Secret',
            'Random secret for dashboard session cookies (WEBAPP_SESSION_SECRET). Generate with: openssl rand -hex 32',
            'WEBAPP_SESSION_SECRET',
            '',
            'required|string|min:32',
        ),
        v(
            'Spotify Client ID',
            'From https://developer.spotify.com/dashboard. The backend refuses to boot without it (validateBackendEnvironment).',
            'SPOTIFY_CLIENT_ID',
            '',
            'required|string',
        ),
        v(
            'Spotify Client Secret',
            'Spotify application client secret. Required by the backend at boot.',
            'SPOTIFY_CLIENT_SECRET',
            '',
            'required|string',
        ),
        v(
            'Redis Host',
            'Redis hostname. The backend requires this variable to be non-empty at boot; if you have no Redis, leave "localhost" and the stack starts in a documented degraded (in-memory fallback) mode.',
            'REDIS_HOST',
            'localhost',
            'required|string',
        ),
        v(
            'Redis Port',
            'Redis port (ignored when Redis URL is set).',
            'REDIS_PORT',
            '6379',
            'required|integer|between:1,65535',
        ),
        v(
            'Redis Password',
            'Redis password, if your Redis requires auth (ignored when Redis URL is set).',
            'REDIS_PASSWORD',
            '',
            'nullable|string',
        ),
        v(
            'Redis URL',
            'Optional single-URL Redis config, e.g. rediss://default:password@host:6380/0. Takes precedence over Redis Host/Port/Password. Redis Host must still be non-empty (leave it "localhost").',
            'REDIS_URL',
            '',
            'nullable|string',
        ),
        v(
            'Dashboard Origin(s)',
            'Comma-separated browser origin(s) of the Vercel dashboard, used for CORS and post-login redirects (WEBAPP_FRONTEND_URL). First entry is the primary.',
            'WEBAPP_FRONTEND_URL',
            'https://vaded-bot-dashboard.vercel.app',
            'required|string',
        ),
        v(
            'Backend Public URL',
            'Public https origin this backend is reachable at (WEBAPP_BACKEND_URL), e.g. https://panel.example.com:25567. Used as the default base for the Spotify callback.',
            'WEBAPP_BACKEND_URL',
            '',
            'nullable|url',
        ),
        v(
            'OAuth Redirect URI',
            'Discord OAuth callback (WEBAPP_REDIRECT_URI), e.g. https://panel.example.com:25567/api/auth/callback. Leave empty when the dashboard proxies /api through Vercel rewrites (the forwarded host is used instead). Must exactly match a Redirect in the Discord Developer Portal.',
            'WEBAPP_REDIRECT_URI',
            '',
            'nullable|url',
        ),
        v(
            'Developer User IDs',
            'Comma-separated Discord user IDs granted developer access in the dashboard.',
            'DEVELOPER_USER_IDS',
            '',
            'nullable|string',
        ),
        v(
            'Git Repository',
            'HTTPS clone URL the install script deploys from.',
            'GIT_REPO',
            'https://github.com/ImLevii/vaded-bot-dashboard.git',
            'required|string',
        ),
        v(
            'Git Branch / Ref',
            'Branch or tag to deploy.',
            'GIT_REF',
            'main',
            'required|string|max:191',
        ),
        v(
            'Git Username',
            'Only for private repositories: username matching the access token.',
            'GIT_USERNAME',
            '',
            'nullable|string',
        ),
        v(
            'Git Access Token',
            'Only for private repositories: read-only PAT. Secret: hidden from the server owner. Note it persists in .git/config on the server volume.',
            'GIT_TOKEN',
            '',
            'nullable|string',
            false,
            false,
        ),
        v(
            'Run Migrations On Boot',
            'true: run "prisma migrate deploy" before starting (required on first boot; idempotent afterwards). false: skip — the backend refuses to start on an unmigrated schema.',
            'RUN_MIGRATIONS',
            'true',
            'required|string|in:true,false',
        ),
        v(
            'Auto Update On Boot',
            '1: git pull + reinstall deps + rebuild on every start (slow, several minutes). 0: boot the installed build.',
            'AUTO_UPDATE',
            '0',
            'required|boolean',
        ),
        v(
            'Log Level',
            '2=info, 3=success, 4=debug. Minimum 2: the readiness detection ("done" line) keys on info-level log lines and never fires below it.',
            'LOG_LEVEL',
            '2',
            'required|integer|between:2,4',
        ),
        v(
            'Node Environment',
            'Keep "production" when the dashboard is on Vercel: cross-origin session cookies (Secure + SameSite=None) require it.',
            'NODE_ENV',
            'production',
            'required|string|in:production,development',
        ),
        v(
            'Disable Metrics Listener',
            'true (default): the bot’s Prometheus endpoint (:9091) stays off so the backend on the primary allocation is the only listener. Set false only if you scrape metrics from inside the node.',
            'METRICS_DISABLED',
            'true',
            'required|string|in:true,false',
        ),
        v('Sentry DSN', 'Optional Sentry error-tracking DSN.', 'SENTRY_DSN', '', 'nullable|url'),
        v('Last.fm API Key', 'Optional, for scrobbling / now-playing.', 'LASTFM_API_KEY', '', 'nullable|string'),
        v('Twitch Client ID', 'Optional, for stream-online notifications.', 'TWITCH_CLIENT_ID', '', 'nullable|string'),
        v('Twitch Client Secret', 'Optional, pairs with Twitch Client ID.', 'TWITCH_CLIENT_SECRET', '', 'nullable|string'),
        v(
            'Node Options',
            'Optional NODE_OPTIONS for both children, e.g. --max-old-space-size=768.',
            'NODE_OPTIONS',
            '',
            'nullable|string',
        ),
        v(
            'yt-dlp Cookies Path',
            'Optional path to a Netscape cookies.txt (e.g. /home/container/.bin/cookies.txt) for YouTube’s "Sign in to confirm you’re not a bot" checks, common on datacenter IPs like Pterodactyl nodes.',
            'YT_DLP_COOKIES_PATH',
            '',
            'nullable|string',
        ),
    ],
}

function validate(path) {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    const declared = new Set(parsed.variables.map((x) => x.env_variable))
    const raw = JSON.stringify(parsed)
    const refs = [...raw.matchAll(/\{\{server\.build\.env\.([A-Z0-9_]+)\}\}/g)].map((m) => m[1])
    const undeclared = refs.filter((r) => !declared.has(r) && r !== 'SERVER_PORT')
    if (undeclared.length > 0) {
        throw new Error('Undeclared placeholder(s): ' + undeclared.join(', '))
    }
    return { parsed, refs }
}

const out = join(here, 'egg-vaded-gaming.json')
writeFileSync(out, JSON.stringify(egg, null, 4) + '\n')
const { parsed, refs } = validate(out)
console.log(
    `wrote ${out}: ${parsed.variables.length} variables, ` +
        `${refs.length} placeholder refs, install script ${installScript.length} bytes`,
)

if (process.argv.includes('--local')) {
    const envPath = join(repoRoot, '.env')
    const env = parseDotEnv(envPath)
    if (Object.keys(env).length === 0) {
        console.warn(
            `[--local] no values found in ${envPath} — writing egg-vaded-gaming.local.json unchanged from the template.`,
        )
    }

    // Deployment-specific fields whose .env value is a local-dev placeholder
    // (localhost URLs, NODE_ENV=development, a LOG_LEVEL below the ready-line
    // detection floor). Copying these would silently misconfigure a real
    // deployment, so the template's production-sane defaults are kept
    // instead — fill these in by hand for the actual server allocation.
    const SKIP_FROM_ENV = new Set([
        'WEBAPP_FRONTEND_URL',
        'WEBAPP_BACKEND_URL',
        'WEBAPP_REDIRECT_URI',
        'NODE_ENV',
        'LOG_LEVEL',
        // Host-local filesystem path: .env holds a Windows dev path
        // (D:\...\cookies.txt) that means nothing inside the Linux container.
        // On the server this wants /home/container/.bin/cookies.txt.
        'YT_DLP_COOKIES_PATH',
    ])

    const localEgg = JSON.parse(JSON.stringify(egg))
    let filled = 0
    for (const variable of localEgg.variables) {
        if (SKIP_FROM_ENV.has(variable.env_variable)) continue
        const value = env[variable.env_variable]
        if (value) {
            variable.default_value = value
            filled++
        }
    }
    localEgg._comment =
        'PERSONAL EXPORT WITH REAL SECRETS — gitignored (deploy/pterodactyl/*.local.json). ' +
        'Do not commit, share, or attach to an issue/PR. Generated from repo-root .env by ' +
        '.generate-egg.mjs --local. Re-run after .env changes; re-check WEBAPP_FRONTEND_URL / ' +
        'WEBAPP_BACKEND_URL / WEBAPP_REDIRECT_URI / NODE_ENV / LOG_LEVEL by hand — these were ' +
        'intentionally left at their production-sane template defaults instead of the .env ' +
        'dev-mode values.'

    const localOut = join(here, 'egg-vaded-gaming.local.json')
    writeFileSync(localOut, JSON.stringify(localEgg, null, 4) + '\n')
    const localResult = validate(localOut)
    console.log(
        `wrote ${localOut}: ${filled} defaults filled from .env, ${SKIP_FROM_ENV.size} fields intentionally left at template defaults (see file's _comment)`,
    )
    console.warn(
        '[--local] REMINDER: this file contains live secrets (bot token, DB password, session secret, etc). ' +
            'It is covered by .gitignore — verify with `git check-ignore` before ever touching git on it.',
    )
    void localResult
}
