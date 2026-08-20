import { Rainlink, Library, type RainlinkNodeOptions } from 'rainlink'
import { SpotifyPlugin } from 'rainlink-spotify'
import type { CustomClient } from '../../types'
import { errorLog, infoLog, warnLog } from '@lucky/shared/utils'
import { ENVIRONMENT_CONFIG } from '@lucky/shared/config'

type CreatePlayerParams = {
    client: CustomClient
}

export const createPlayer = ({ client }: CreatePlayerParams): Rainlink => {
    try {
        infoLog({ message: 'Creating rainlink player...' })

        const player = new Rainlink({
            library: new Library.DiscordJS(client),
            nodes: [buildNodeOptions()],
            plugins: buildPlugins(),
            options: {
                resume: true,
                resumeTimeout: 600,
                defaultSearchEngine: 'youtube',
                searchFallback: {
                    enable: true,
                    engine: 'youtube',
                },
                // rainlink's own defaults (3s / 15 attempts) hammer the node
                // every ~3s regardless of why it disconnected. Fine for a
                // transient blip, actively counterproductive against a node
                // that just rejected us for connecting too often — reproduced
                // in production against a rate-limited public node ("Too many
                // websocket connections attempt for this bot, try again
                // later"): the tight retry loop never let the rate limit
                // window reset. 30s apart, 10 attempts (5 minutes total)
                // gives a real cooldown before giving up.
                retryTimeout: 30_000,
                retryCount: 10,
            },
        })

        player.setMaxListeners(20)

        infoLog({ message: 'Rainlink player created successfully' })
        return player
    } catch (error) {
        errorLog({ message: 'Error creating player:', error })
        throw error
    }
}

/**
 * rainlink builds its connection URL as a plain template string
 * (`${secure ? 'https' : 'http'}://${host}:${port}/v4`, see
 * AbstractDriver#connect in the installed package) rather than validating
 * host/port first — a stray scheme prefix, trailing slash, path, or
 * whitespace from a copy-pasted config value produces a syntactically
 * invalid URL that `new URL()` rejects deep inside rainlink's async connect
 * flow, outside any try/catch this app controls. That surfaces as an
 * untraceable unhandled promise rejection that kills the entire process
 * (not just music) minutes after boot — reproduced in production. Sanitize
 * defensively and fail loudly and synchronously here instead, where the
 * error is caught, logged clearly, and attributable.
 */
function sanitizeLavalinkHost(rawHost: string): string {
    let host = rawHost.trim()
    host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '') // strip any scheme
    host = host.replace(/\/.*$/, '') // strip any path
    host = host.replace(/:\d+$/, '') // strip an accidentally-included port
    return host
}

const buildNodeOptions = (): RainlinkNodeOptions => {
    const { HOST, PORT, PASSWORD, SECURE } = ENVIRONMENT_CONFIG.LAVALINK
    const host = sanitizeLavalinkHost(HOST)

    if (!host || /\s/.test(host)) {
        throw new Error(
            `Invalid LAVALINK_HOST: "${HOST}" — must be a bare hostname (e.g. lavalink.example.com), ` +
                'with no scheme, path, port, or whitespace.',
        )
    }
    if (host !== HOST.trim()) {
        warnLog({
            message: `LAVALINK_HOST contained a scheme/path/port that was stripped: "${HOST}" -> "${host}"`,
        })
    }

    return {
        name: 'main',
        host,
        port: PORT,
        auth: PASSWORD.trim(),
        secure: SECURE,
    }
}

const buildPlugins = () => {
    const plugins = []
    const { CLIENT_ID, CLIENT_SECRET } = ENVIRONMENT_CONFIG.SPOTIFY

    if (CLIENT_ID && CLIENT_SECRET) {
        plugins.push(
            new SpotifyPlugin({
                clientId: CLIENT_ID,
                clientSecret: CLIENT_SECRET,
                playlistPageLimit: 1,
                albumPageLimit: 1,
                searchLimit: 10,
            }),
        )
        infoLog({ message: 'Registered rainlink Spotify plugin' })
    } else {
        warnLog({
            message:
                'SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET not set — Spotify search disabled',
        })
    }

    return plugins
}
