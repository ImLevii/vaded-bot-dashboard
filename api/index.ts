import type { IncomingMessage, ServerResponse } from 'node:http'
import { getServerlessApp } from '../packages/backend/dist/serverlessBootstrap.js'

// Single Vercel Function handling every /api/* route — vercel.json rewrites
// all of /api/* here (as /api/:match* -> /api) rather than relying on a
// [...path] catch-all filename, which didn't route multi-segment paths
// correctly in testing. Vercel rewrites preserve the original request URL,
// so Express still sees the real path (e.g. /api/auth/discord) and routes
// on it normally. An Express app instance is itself a valid (req, res)
// request handler, so it can be exported directly — no adapter package
// needed. The music-control subtree proxies to vg-music-bot's own REST API
// (see packages/backend/src/routes/music/vgMusicBotState.ts), a stateless
// HTTP call that works fine inline here — no long-lived process needed.
export default async function handler(
    req: IncomingMessage,
    res: ServerResponse,
): Promise<void> {
    const app = await getServerlessApp()
    app(req, res)
}
