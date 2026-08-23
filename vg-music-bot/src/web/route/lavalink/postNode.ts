import util from 'node:util'
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
  client.logger.info(
    'LavalinkNodesRouterService',
    `${req.method} ${req.routeOptions.url} payload=${req.body ? util.inspect(req.body) : '{}'}`
  )

  const data = req.body as Partial<PostNodeBody>

  if (!data || !data.name || !data.host || !data.port || !data.auth) {
    res.code(400)
    res.send({ error: 'Missing required key (name, host, port, auth)' })
    return
  }

  if (client.rainlink.nodes.get(data.name)) {
    res.code(400)
    res.send({ error: 'A node with this name already exists' })
    return
  }

  const node = client.rainlink.nodes.add({
    name: data.name,
    host: data.host,
    port: Number(data.port),
    auth: data.auth,
    secure: Boolean(data.secure),
    driver: data.driver,
  })

  res.send({
    name: node.options.name,
    host: node.options.host,
    port: node.options.port,
    secure: node.options.secure,
    driver: node.options.driver ?? null,
  })
}
