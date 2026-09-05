import type { LavalinkDataType } from '../@types/Lavalink.js'

export interface LocationEvidence {
  host: string
  port: number
  secure: boolean
  country: 'US'
  source: string
  reviewedAt: string
}

// Location evidence is separate from health. This listed Miami endpoint currently
// fails DNS; it is only a candidate and MUST pass the same probes as every node.
// Add endpoints only after reviewing an explicit hosting-location statement.
// Domain suffixes, server names and CDN geolocation do not establish US hosting.
export const US_NODE_REGISTRY: readonly LocationEvidence[] = [
  {
    host: 'omega.vexanode.cloud',
    port: 2031,
    secure: false,
    country: 'US',
    source: 'https://lavalink.darrennathanael.com/NoSSL/Lavalink-NonSSL/#hosted-by-vexanode',
    reviewedAt: '2026-09-05',
  },
]

export function endpointKey(node: { host: string; port: number; secure?: boolean }): string {
  return `${node.secure ? 'https' : 'http'}://${node.host.toLowerCase()}:${node.port}`
}

export function isUsNode(node: { host: string; port: number; secure?: boolean }): boolean {
  if (!node || typeof node.host !== 'string' || !Number.isInteger(node.port)) return false
  return US_NODE_REGISTRY.some((entry) => endpointKey(entry) === endpointKey(node))
}

export const US_SEED_NODES: readonly LavalinkDataType[] = [
  {
    ...US_NODE_REGISTRY[0],
    name: 'omega.vexanode.cloud:2031',
    pass: 'https://discord.vexanode.cloud',
    online: false,
  },
]
