import util from 'node:util'
import { Manager } from '../../manager.js'
import Fastify from 'fastify'

export async function queueMove(
  client: Manager,
  req: Fastify.FastifyRequest,
  res: Fastify.FastifyReply
) {
  client.logger.info(
    'QueueMoveRouterService',
    `${req.method} ${req.routeOptions.url} payload=${req.body ? util.inspect(req.body) : '{}'}`
  )

  const guildId = (req.params as Record<string, string>)['guildId']
  const player = client.rainlink.players.get(guildId)
  if (!player) {
    res.code(400)
    res.send({ error: 'Current player not found!' })
    return
  }

  const body = req.body as { from?: number; to?: number } | undefined
  const from = body?.from
  const to = body?.to

  if (typeof from !== 'number' || typeof to !== 'number') {
    res.code(400)
    res.send({ error: 'from and to must be numbers' })
    return
  }

  if (from < 0 || from >= player.queue.length || to < 0 || to >= player.queue.length) {
    res.code(400)
    res.send({ error: 'from/to out of queue range' })
    return
  }

  const [track] = player.queue.splice(from, 1)
  player.queue.splice(to, 0, track)

  res.send({ from, to })
}
