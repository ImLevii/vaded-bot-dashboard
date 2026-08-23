import { Manager } from '../../../manager.js'
import Fastify from 'fastify'

export async function deleteNode(
  client: Manager,
  req: Fastify.FastifyRequest,
  res: Fastify.FastifyReply
) {
  client.logger.info(
    'LavalinkNodesRouterService',
    `${req.method} ${req.routeOptions.url} params=${JSON.stringify(req.params)}`
  )

  const name = (req.params as Record<string, string>)['name']
  const node = client.rainlink.nodes.get(name)

  if (!node) {
    res.code(400)
    res.send({ error: 'Node not found' })
    return
  }

  client.rainlink.players.forEach((player) => {
    if (player.node.options.name === name) player.destroy().catch(() => {})
  })

  client.rainlink.nodes.remove(name)

  res.send({ name })
}
