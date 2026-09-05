import type { Manager } from '../manager.js'
import { AutoFixLavalink } from '../autofix/AutoFixLavalink.js'
import cron from 'node-cron'

export class Checker {
  constructor(client: Manager) {
    const refresh = async () => {
      if (client.config.utilities.AUTOFIX_LAVALINK.enable) {
        await new AutoFixLavalink(client).execute()
      } else {
        const { CheckLavalinkServer } = await import('../autofix/CheckLavalinkServer.js')
        const { connectUsNode } = await import('../autofix/NodeConnection.js')
        // With automatic recovery disabled, only explicitly configured US nodes connect.
        const nodes = await new CheckLavalinkServer(client, { execute: async () => [] }).execute()
        for (const node of nodes) {
          if (
            client.config.player.NODES.some(
              (configured) =>
                configured.host === node.host &&
                configured.port === node.port &&
                Boolean(configured.secure) === node.secure
            )
          )
            await connectUsNode(client, node)
        }
      }
    }
    client.once('ready', () => {
      void refresh().catch(() =>
        client.logger.warn('LavalinkDiscovery', 'USA node startup failed.')
      )
    })
    if (client.config.utilities.AUTOFIX_LAVALINK.enable)
      cron.schedule('0 */30 * * * *', () => {
        void refresh().catch(() =>
          client.logger.warn('LavalinkDiscovery', 'USA node refresh failed.')
        )
      })
  }
}
