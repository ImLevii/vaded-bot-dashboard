import type { Manager } from '../manager.js'
import type { LavalinkDataType } from '../@types/Lavalink.js'
import { GetLavalinkServer } from './GetLavalinkServer.js'
import { checkNodeHealth } from './NodeHealth.js'
import { endpointKey, isUsNode, US_SEED_NODES } from './UsNodeRegistry.js'

const refreshes = new WeakMap<Manager, Promise<LavalinkDataType[]>>()

export class CheckLavalinkServer {
  constructor(
    private client: Manager,
    private catalog: Pick<GetLavalinkServer, 'execute'> = new GetLavalinkServer(),
    private probe = checkNodeHealth
  ) {}

  execute(isLogEnable = true): Promise<LavalinkDataType[]> {
    const pending = refreshes.get(this.client)
    if (pending) return pending
    const work = this.refresh(isLogEnable).finally(() => refreshes.delete(this.client))
    refreshes.set(this.client, work)
    return work
  }

  private async refresh(log: boolean): Promise<LavalinkDataType[]> {
    let discovered: LavalinkDataType[]
    try {
      discovered = await this.catalog.execute()
    } catch {
      this.client.logger.warn(
        'LavalinkDiscovery',
        'Catalog unavailable; rechecking previous USA candidates.'
      )
      discovered = this.client.lavalinkList
    }
    const configured = (this.client.config.player.NODES || [])
      .filter((node) => !node.driver || node.driver === 'lavalink@4')
      .map((node) => ({
        host: node.host,
        port: node.port,
        pass: node.auth,
        secure: Boolean(node.secure),
        name: node.name || `${node.host}:${node.port}`,
        online: false,
      }))
    const rejected = configured.filter((node) => !isUsNode(node)).length
    if (log && rejected)
      this.client.logger.warn(
        'LavalinkDiscovery',
        `${rejected} configured node(s) ignored: USA hosting has not been reviewed.`
      )
    const candidates = new Map<string, LavalinkDataType>()
    for (const node of [...US_SEED_NODES, ...discovered, ...configured]) {
      if (isUsNode(node)) candidates.set(endpointKey(node), node)
    }
    const results: LavalinkDataType[] = []
    // Bounded concurrency: at most four REST probes at once.
    const entries = [...candidates.values()]
    for (let index = 0; index < entries.length; index += 4) {
      results.push(
        ...(await Promise.all(
          entries.slice(index, index + 4).map(async (node) => {
            try {
              const result = await this.probe(node)
              return { ...node, online: result.online }
            } catch {
              return { ...node, online: false }
            }
          })
        ))
      )
    }
    this.client.lavalinkList = results
    if (log)
      this.client.logger.info(
        'LavalinkDiscovery',
        `${results.filter((node) => node.online).length}/${results.length} USA candidates passed REST checks.`
      )
    return results
  }
}
