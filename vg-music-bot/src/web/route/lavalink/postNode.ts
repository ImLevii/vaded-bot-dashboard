import { isUsNode } from '../../../autofix/UsNodeRegistry.js'
import { connectUsNode } from '../../../autofix/NodeConnection.js'
import { Manager } from '../../../manager.js'
import Fastify from 'fastify'

interface PostNodeBody {
  name: string
  host: string
  port: number
  auth: string
  secure: boolean
  driver?: string
}

export async function postNode(
  client: Manager,
  req: Fastify.FastifyRequest,
  res: Fastify.FastifyReply
) {
  client.logger.info('LavalinkNodesRouterService', `${req.method} ${req.routeOptions.url}`)

  const data = req.body as Partial<PostNodeBody>

  if (
    !data ||
    typeof data.name !== 'string' ||
    !data.name.trim() ||
    typeof data.host !== 'string' ||
    !data.host ||
    typeof data.auth !== 'string' ||
    !data.auth ||
    !Number.isInteger(Number(data.port)) ||
    Number(data.port) < 1 ||
    Number(data.port) > 65535 ||
    (data.secure !== undefined && typeof data.secure !== 'boolean')
  ) {
    res.code(400)
    res.send({ error: 'Missing required key (name, host, port, auth)' })
    return
  }

  if (client.rainlink.nodes.get(data.name)) {
    res.code(400)
    res.send({ error: 'A node with this name already exists' })
    return
  }

  const candidate = {
    name: data.name.trim(),
    host: data.host.toLowerCase(),
    port: Number(data.port),
    pass: data.auth,
    secure: Boolean(data.secure),
    online: false,
  }
  if (!isUsNode(candidate) || (data.driver && data.driver !== 'lavalink@4')) {
    return res.code(400).send({ error: 'Only reviewed USA Lavalink v4 endpoints are allowed' })
  }
  if (!(await connectUsNode(client, candidate))) {
    return res.code(503).send({ error: 'USA node could not be connected' })
  }
  const node = client.rainlink.nodes
    .all()
    .find(
      (node) =>
        node.options.host === candidate.host &&
        node.options.port === candidate.port &&
        Boolean(node.options.secure) === candidate.secure
    )!
  if (!node)
    return res.code(503).send({ error: 'USA node disconnected before registration completed' })

  res.send({
    name: node.options.name,
    host: node.options.host,
    port: node.options.port,
    secure: node.options.secure,
    driver: node.options.driver ?? null,
  })
}
