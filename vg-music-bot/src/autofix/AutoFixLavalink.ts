import type { Manager } from '../manager.js'
import type { LavalinkDataType } from '../@types/Lavalink.js'
import { CheckLavalinkServer } from './CheckLavalinkServer.js'
import { connectUsNode, removeNode } from './NodeConnection.js'

const recoveries = new WeakMap<Manager, Promise<void>>()

export class AutoFixLavalink {
  constructor(
    private client: Manager,
    private lavalinkName?: string
  ) {}

  execute(): Promise<void> {
    if (this.lavalinkName) {
      removeNode(this.client, this.lavalinkName)
    }
    const pending = recoveries.get(this.client)
    if (pending) return pending
    const work = this.recover()
      .catch(() => {
        this.client.logger.warn(
          'LavalinkRecovery',
          'USA node recovery failed; discovery will retry.'
        )
      })
      .finally(() => recoveries.delete(this.client))
    recoveries.set(this.client, work)
    return work
  }

  private async recover(): Promise<void> {
    const nodes: LavalinkDataType[] = await new CheckLavalinkServer(this.client).execute()
    if (!this.client.user) return
    // One connected node is enough. Do not replace a healthy node during refresh.
    if (this.client.lavalinkUsing.length) return
    for (const node of nodes.filter((candidate) => candidate.online)) {
      if (await connectUsNode(this.client, node)) return
    }
    this.client.logger.warn('LavalinkRecovery', 'No healthy USA Lavalink servers available.')
  }
}
