import type { Manager } from '../../manager.js'

// Read from this Discord client, which also owns the player and node routes.
export function getServiceInfo(client: Manager) {
  const confirmed = new Set(client.lavalinkUsing.map((node) => node.name))
  return {
    service: 'vg-music-bot' as const,
    bot: {
      id: client.user?.id ?? null,
      username: client.user?.username ?? null,
      ready: client.isReady(),
    },
    capabilities: { musicEmbeds: 1, lavalinkRegion: 'US' as const },
    healthyNodes: client.rainlink.nodes
      .all()
      .filter((node) => node.online && confirmed.has(node.options.name)).length,
    revision: process.env.COMMIT_SHA || null,
  }
}
