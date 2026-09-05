# Music embeds and USA Lavalink nodes

Music responses keep the configured embed color, existing emoji labels, artwork placement, and player controls. Shared helpers bound Discord payload sizes and handle absent metadata, radio streams, and realtime track changes. Queue buttons now use the existing pagination controls when there are more than ten tracks.

## Node admission

All startup nodes, discovered replacements, and dashboard additions must match an exact host, port, and TLS setting in `src/autofix/UsNodeRegistry.ts`. The registry stores a country statement and review source, not an assertion of uptime. DNS names, low latency, and CDN IP geolocation do not establish the audio server's country.

Discovery uses the maintainer's JSON API at https://lavalink-list.ajieblogs.eu.org/All. Every candidate must pass an authenticated Lavalink v4 REST check, then connect through Rainlink using the logged-in bot's identity. Credentials are preserved verbatim and are not printed by discovery or dashboard registration.

To add a public USA endpoint, review an explicit hosting-location statement, add its exact endpoint and evidence to the registry, and include its public credentials in the seed list only if it should remain discoverable when the catalog is unavailable. Run the tests and recheck REST/track loading. Never set `online: true` on a seed.

The catalog's listed Miami endpoint, `omega.vexanode.cloud:2031`, is retained as a candidate only. It failed DNS resolution during the September 5, 2026 review; the catalog also returned HTTP 502. No working US endpoint was verified. Unreviewed configured endpoints are ignored, including any previously configured global node.

## Startup and failures

With `AUTOFIX_LAVALINK.enable: true`, `player.NODES: []` is supported. Discovery runs after Discord is ready, every 30 minutes, and when a node exhausts its configured retries. Overlapping discovery and recovery requests share their work. Failed catalog refreshes retain previous candidates only for fresh health checks.

With automatic recovery disabled, only explicitly configured, reviewed US nodes are attempted at startup. USA eligibility always applies.

If no US node works, the Discord bot stays responsive and music commands report that no healthy USA Lavalink servers are available. The bot never selects a non-US or unknown-location node as a fallback.

## Validation

From this directory:

- `npm ci --ignore-scripts`
- `npm test`
- `npm run build`

Tests stub external requests and Discord messages. A passing build and test suite do not establish current public-node availability or verify audible Discord playback. Live checks should verify both `/v4/info` and `/v4/loadtracks` before an end-to-end playback check.

## Public dashboard connection

The public dashboard is https://vaded.gg. Its Vercel backend proxies music playback,
queue/state, and Lavalink administration to the same `VG_MUSIC_BOT_URL`, using
`VG_MUSIC_BOT_TOKEN` only on the server. That URL must reach the persistent process
running this `vg-music-bot` directory. Vercel does not run the Discord client itself.

Deploy the updated music bot to the existing bot host before deploying the dashboard.
Retain the running bot's Discord identity, configuration, and database. Set the
Vercel Production `VG_MUSIC_BOT_URL` to that host's reachable HTTPS API address and
`VG_MUSIC_BOT_TOKEN` to its web API auth value, then redeploy Vercel for env changes
to take effect. Do not put either token in frontend/VITE variables.

The authenticated bot endpoint `GET /v1/info` reports the actual Discord client's ID,
username, readiness, update capabilities, and confirmed healthy node count. In the
dashboard, Admin > Lavalink Nodes reads it via `GET /api/admin/lavalink/service`
using exactly the same upstream client as music controls. The panel shows a
connection error if the bot is unreachable or still lacks the update; it does not
present stale nodes as verified.

Verify the displayed ID matches the intended music bot and that the panel says
"USA Lavalink only". A Discord connection with zero healthy nodes does not mean
playback is available. The production upstream and live playback must be verified
separately; a successful local build is not a deployment.
