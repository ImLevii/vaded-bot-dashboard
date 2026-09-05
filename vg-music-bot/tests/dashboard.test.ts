import test from 'node:test'
import assert from 'node:assert/strict'
import { getServiceInfo } from '../src/web/route/getServiceInfo.js'
import type { Manager } from '../src/manager.js'

test('dashboard reports the actual player client and only confirmed healthy nodes', () => {
  const client = {
    user: { id: '123456789012345678', username: 'Vaded Music' },
    isReady: () => true,
    lavalinkUsing: [{ name: 'ready' }, { name: 'stale' }],
    rainlink: {
      nodes: {
        all: () => [
          { options: { name: 'ready' }, online: true },
          { options: { name: 'stale' }, online: false },
          { options: { name: 'unconfirmed' }, online: true },
        ],
      },
    },
  } as unknown as Manager
  const info = getServiceInfo(client)
  assert.deepEqual(info.bot, { id: client.user.id, username: client.user.username, ready: true })
  assert.equal(info.service, 'vg-music-bot')
  assert.deepEqual(info.capabilities, { musicEmbeds: 1, lavalinkRegion: 'US' })
  assert.equal(info.healthyNodes, 1)
})

test('dashboard does not claim Discord is ready before login', () => {
  const info = getServiceInfo({
    user: null,
    isReady: () => false,
    lavalinkUsing: [],
    rainlink: { nodes: { all: () => [] } },
  } as unknown as Manager)
  assert.deepEqual(info.bot, { id: null, username: null, ready: false })
  assert.equal(info.healthyNodes, 0)
})
