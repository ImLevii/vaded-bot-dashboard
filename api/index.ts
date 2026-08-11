import type { IncomingMessage, ServerResponse } from 'node:http'
import { getServerlessApp } from '../packages/backend/dist/serverlessBootstrap.js'

// Single Vercel Function handling every /api/* route — vercel.json rewrites
// all of /api/* here (as /api/:match* -> /api) rather than relying on a
// [...path] catch-all filename, which didn't route multi-segment paths
// correctly in testing. Vercel rewrites preserve the original request URL,
// so Express still sees the real path (e.g. /api/auth/discord) and routes
// on it normally. An Express app instance is itself a valid (req, res)
// request handler, so it can be exported directly — no adapter package
// needed. The music-control subtree is the one exception: getServerlessApp()
// builds the app with that subtree forwarded to the standalone relay process
// instead of handled inline (see packages/backend/src/serverlessBootstrap.ts
// and musicRelayProxy.ts) since it needs a long-lived process this function
// can't provide.
export default async function handler(
    req: IncomingMessage,
    res: ServerResponse,
): Promise<void> {
    const app = await getServerlessApp()
    app(req, res)
}
