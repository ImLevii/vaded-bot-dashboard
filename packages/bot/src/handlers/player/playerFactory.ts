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

const buildNodeOptions = (): RainlinkNodeOptions => {
    const { HOST, PORT, PASSWORD, SECURE } = ENVIRONMENT_CONFIG.LAVALINK
    return {
        name: 'main',
        host: HOST,
        port: PORT,
        auth: PASSWORD,
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
