import { Manager } from '../manager.js'
import Fastify from 'fastify'
import { getNodes } from './route/lavalink/getNodes.js'
import { postNode } from './route/lavalink/postNode.js'
import { deleteNode } from './route/lavalink/deleteNode.js'
import { switchNode } from './route/lavalink/switchNode.js'

export class LavalinkRoute {
  constructor(protected client: Manager) {}

  main(fastify: Fastify.FastifyInstance) {
    fastify.get('/nodes', (req, res) => getNodes(this.client, req, res))
    fastify.post('/nodes', (req, res) => postNode(this.client, req, res))
    fastify.delete('/nodes/:name', (req, res) => deleteNode(this.client, req, res))
    fastify.post('/nodes/:name/switch', (req, res) => switchNode(this.client, req, res))
  }
}
