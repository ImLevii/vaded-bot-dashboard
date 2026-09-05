import type { Express, NextFunction, Request, Response } from 'express'
import { setupPlaybackRoutes } from './playbackRoutes'
import { setupQueueRoutes } from './queueRoutes'
import { setupStateRoutes } from './stateRoutes'
import { setupAutoplayRoutes } from './autoplayRoutes'
import { vgMusicBotConfigured } from '../../services/vgMusicBotClient'

/** Degrade music CONTROLS to 503 while vg-music-bot isn't configured/reachable. GET state reads pass through — fetchQueueState() already returns null, which the frontend renders as "no active session". */
function requireMusicService(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    if (req.method === 'GET' || vgMusicBotConfigured()) {
        next()
        return
    }
    res.status(503).json({ error: 'Music service unavailable' })
}

export function setupMusicRoutes(app: Express): void {
    app.use('/api/guilds/:guildId/music', requireMusicService)
    setupPlaybackRoutes(app)
    setupQueueRoutes(app)
    setupStateRoutes(app)
    setupAutoplayRoutes(app)
}
