import type { Express, NextFunction, Request, Response } from 'express'
import { setupPlaybackRoutes } from './playbackRoutes'
import { setupQueueRoutes } from './queueRoutes'
import { setupStateRoutes } from './stateRoutes'
import { setupAutoplayRoutes } from './autoplayRoutes'
import {
    vgMusicBotConfigured,
    MUSIC_BOT_CONFIGURATION_ERROR,
} from '../../services/vgMusicBotClient'

/** Reject commands early when the upstream music service has no configuration. */
function requireMusicService(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    if (req.method === 'GET' || vgMusicBotConfigured()) {
        next()
        return
    }
    res.status(503).json({ error: MUSIC_BOT_CONFIGURATION_ERROR })
}

export function setupMusicRoutes(app: Express): void {
    app.use('/api/guilds/:guildId/music', requireMusicService)
    setupPlaybackRoutes(app)
    setupQueueRoutes(app)
    setupStateRoutes(app)
    setupAutoplayRoutes(app)
}
