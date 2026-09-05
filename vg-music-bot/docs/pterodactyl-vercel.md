# Pterodactyl music bot and Vercel dashboard

The public dashboard is https://vaded.gg. Vercel serves the dashboard and its
same-origin `/api` backend. The persistent Discord music client is this
`vg-music-bot` package on Pterodactyl.

The supplied allocation is `panel2.vaded-hosting.com:25573`. Both HTTP and HTTPS
connection attempts timed out during the September 5, 2026 check. The hostname
and port alone do not establish the protocol, server identity, or availability.

## Upload and start the updated bot

1. Stop the existing music bot through Pterodactyl. Retain its `app.yml`, private
   `.env`, and `data/` directory. Use the same Discord bot identity.
2. Upload the prebuilt music-bot package through Files and extract its contents
   into the existing bot directory. That directory must contain `package.json`,
   `package-lock.json`, `dist/index.js`, `languages/`, and
   `deploy/pterodactyl/start.mjs`. Keep the existing runtime files from step 1.
   Do not upload the dashboard monorepo or Windows `node_modules`.
3. Select the Node.js 24 image, for example
   `ghcr.io/ptero-eggs/yolks:nodejs_24`. Set the startup command, from that
   directory, to:

   ```sh
   node deploy/pterodactyl/start.mjs
   ```

4. Make port `25573` the server's primary allocation. Pterodactyl supplies
   `SERVER_PORT`; the launcher requires a valid allocation and sets the bot API
   to `0.0.0.0:25573`. Set `VG_MUSIC_BOT_TOKEN` as a private panel environment
   value (or in the existing private `.env`). This is the shared web API token,
   separate from the Discord token. Panel environment values take precedence.
   Supplying this token enables the bot web API automatically; retain the other
   settings in the existing `app.yml`.
5. If the Discord token is already in the existing `app.yml`, retain it. If using
   a panel variable, set `VG_MUSIC_BOT_DISCORD_TOKEN` to that same music bot's
   token. The launcher does not switch to the dashboard's separate Discord
   application.
6. Start the server. On the first run, or after the lockfile or platform changes,
   the launcher installs the locked production dependencies with `npm ci`.
   It preserves `app.yml`, `.env`, and `data/`, then starts `dist/index.js`
   from this bot's directory. Allow the first install to finish.

The optional `deploy/pterodactyl/egg-vg-music-bot.json` is a minimal importable
egg for this upload workflow. Its install step creates no application files:
upload the prebuilt package and existing private configuration before starting.
It does not install the separate moderation bot or dashboard backend.

## Connect Vercel

Set these in the Vercel project's **Production** environment:

| Name                 | Value                                                 |
| -------------------- | ----------------------------------------------------- |
| `VG_MUSIC_BOT_URL`   | The verified reachable API origin for this allocation |
| `VG_MUSIC_BOT_TOKEN` | Exactly the same shared API token as Pterodactyl      |

The bot's built-in listener serves HTTP. A working HTTP allocation would use
`http://panel2.vaded-hosting.com:25573`; use an HTTPS origin only when TLS is
provided by a verified reverse proxy or tunnel. HTTPS on the Pterodactyl panel
itself does not enable TLS on the allocation. Prefer a verified HTTPS proxy for
the deployed upstream connection, because requests include the shared API token.
Neither protocol has been verified on this allocation yet.

Keep browser requests on the dashboard's same-origin `/api` routes. Do not put
the shared token in a frontend/VITE variable, change `VITE_API_BASE_URL` to the
music allocation, or send dashboard login requests directly to the music bot.
Redeploy Vercel after changing its environment variables.

## Verify the running service

After the bot and dashboard updates are deployed, open **Admin > Lavalink
Nodes** on https://vaded.gg. Its authenticated service check uses the same
upstream connection as the music controls and displays the actual Discord bot
name, ID, readiness, and USA-only Lavalink policy.

A successful API connection with zero healthy USA Lavalink nodes establishes
which bot the dashboard controls; it does not establish playable audio. Confirm
track loading and Discord voice playback separately when a healthy reviewed
USA node is available. An unresponsive allocation, authorization failure, or
missing `/v1/info` response must not be presented as a verified deployment.

## Local validation

From the music-bot source checkout before packaging (the uploaded runtime package
does not need source files or tests):

```sh
node --test deploy/pterodactyl/start.test.mjs
npm test
npm run build
```

Launcher tests do not install dependencies, start the Discord client, or contact
Pterodactyl/Vercel. They cover allocation validation, shared HTTP token normalization,
working-directory checks, and dependency reuse across package/platform changes.
