import type { IncomingMessage, ServerResponse } from 'node:http'
import { getServerlessApp } from '../packages/backend/dist/serverlessBootstrap.js'

// Catch-all Vercel Function for every /api/* route. An Express app instance
// is itself a valid (req, res) request handler, so it can be exported
// directly — no adapter package needed. The music-control subtree is the
// one exception: getServerlessApp() builds the app with that subtree
// forwarded to the standalone relay process instead of handled inline (see
// packages/backend/src/serverlessBootstrap.ts and musicRelayProxy.ts) since
// it needs a long-lived process this function can't provide.
export default async function handler(
    req: IncomingMessage,
    res: ServerResponse,
): Promise<void> {
    const app = await getServerlessApp()
    app(req, res)
}
