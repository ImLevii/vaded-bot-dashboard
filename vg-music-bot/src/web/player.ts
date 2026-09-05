import { Manager } from '../manager.js'
import Fastify from 'fastify'
import { getStatus } from './route/getStatus.js'
import { getQueueStatus } from './route/getQueueStatus.js'
import { getMemberStatus } from './route/getMemberStatus.js'
import { getCurrentTrackStatus } from './route/getCurrentTrackStatus.js'
import { getCurrentLoop } from './route/getCurrentLoop.js'
import { getCurrentPaused } from './route/getCurrentPaused.js'
import { getCurrentPosition } from './route/getCurrentPosition.js'
import { PatchControl } from './route/patchControl.js'
import { deletePlayer } from './route/deletePlayer.js'
import { PostCreatePlayer } from './route/postCreatePlayer.js'
import { getListeners } from './route/getListeners.js'
import { queueMove } from './route/queueMove.js'
import { queueImport } from './route/queueImport.js'
import { queueRemove } from './route/queueRemove.js'
import { queueClear } from './route/queueClear.js'

export class PlayerRoute {
  constructor(protected client: Manager) {}

  main(fastify: Fastify.FastifyInstance) {
    fastify.get('/:guildId', (req, res) => getStatus(this.client, req, res))
    fastify.patch('/:guildId', (req, res) => new PatchControl(this.client).main(req, res))
    fastify.delete('/:guildId', (req, res) => deletePlayer(this.client, req, res))
    fastify.post('/', (req, res) => new PostCreatePlayer(this.client).main(req, res))
    fastify.get('/:guildId/loop', (req, res) => getCurrentLoop(this.client, req, res))
    fastify.get('/:guildId/pause', (req, res) => getCurrentPaused(this.client, req, res))
    fastify.get('/:guildId/position', (req, res) => getCurrentPosition(this.client, req, res))
    fastify.get('/:guildId/queue', (req, res) => getQueueStatus(this.client, req, res))
    fastify.get('/:guildId/current', (req, res) => getCurrentTrackStatus(this.client, req, res))
    fastify.get('/:guildId/member/:userId', (req, res) => getMemberStatus(this.client, req, res))
    fastify.get('/:guildId/listeners', (req, res) => getListeners(this.client, req, res))
    fastify.post('/:guildId/queue/move', (req, res) => queueMove(this.client, req, res))
    fastify.post('/:guildId/queue/import', (req, res) => queueImport(this.client, req, res))
    fastify.post('/:guildId/queue/remove', (req, res) => queueRemove(this.client, req, res))
    fastify.post('/:guildId/queue/clear', (req, res) => queueClear(this.client, req, res))
  }
}
