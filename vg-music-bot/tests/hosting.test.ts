import test from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Manager } from '../src/manager.js'
import { musicHostingConfig } from '../src/services/MusicHostingConfig.js'
import { WebServer } from '../src/web/server.js'

const configured = {
  host: '127.0.0.1',
  enable: false,
  port: 8080,
  auth: 'existing-api-secret',
  whitelist: [],
}

test('Pterodactyl allocation and shared token enable the music API without changing app.yml values', () => {
  const before = structuredClone(configured)
  const result = musicHostingConfig(configured, {
    SERVER_PORT: '25573',
    VG_MUSIC_BOT_TOKEN: ' test-dashboard-secret ',
  })
  assert.deepEqual(result, {
    ...configured,
    host: '0.0.0.0',
    enable: true,
    port: 25573,
    auth: 'test-dashboard-secret',
  })
  assert.deepEqual(configured, before)
})

test('explicit music API allocation overrides primary port and unrelated hosting stays unchanged', () => {
  assert.deepEqual(musicHostingConfig(configured, {}), configured)
  const result = musicHostingConfig(configured, {
    SERVER_PORT: '25573',
    VG_MUSIC_BOT_PORT: '25574',
    VG_MUSIC_BOT_HOST: '127.0.0.1',
  })
  assert.equal(result.port, 25574)
  assert.equal(result.host, '127.0.0.1')
})

test('invalid allocations and unresolved shared secrets cannot expose the API', () => {
  for (const port of ['', '0', '65536', '-1', '12.5', '25573abc']) {
    assert.throws(() => musicHostingConfig(configured, { SERVER_PORT: port }), /port/)
  }
  for (const auth of ['', 'undefined', 'null', '${VG_MUSIC_BOT_TOKEN}', 'bad\r\nheader']) {
    assert.throws(
      () => musicHostingConfig({ ...configured, enable: true, auth }, {}),
      /VG_MUSIC_BOT_TOKEN/
    )
  }
})

test('bound HTTP API authenticates requests and identifies the same Discord client used for nodes', async (t) => {
  const client = {
    config: { utilities: { WEB_SERVER: { ...configured, enable: true, port: 0 } } },
    logger: { info() {}, error() {} },
    user: { id: '123456789012345678', username: 'Vaded Music' },
    isReady: () => true,
    lavalinkUsing: [],
    rainlink: { nodes: { all: () => [] } },
  } as unknown as Manager
  const server = new WebServer(client, false)
  t.after(() => server.app.close())
  await server.listen()
  const address = server.server.address() as AddressInfo
  assert.equal(address.address, '127.0.0.1')
  const base = `http://127.0.0.1:${address.port}`
  const missing = await fetch(`${base}/v1/info`)
  assert.equal(missing.status, 400)
  await missing.text()
  const wrong = await fetch(`${base}/v1/info`, { headers: { authorization: 'wrong' } })
  assert.equal(wrong.status, 401)
  await wrong.text()
  const headers = { authorization: configured.auth }
  const info = await fetch(`${base}/v1/info`, { headers })
  assert.equal(info.status, 200)
  assert.equal((await info.json()).bot.id, client.user.id)
  const nodes = await fetch(`${base}/v1/lavalink/nodes`, { headers })
  assert.equal(nodes.status, 200)
  assert.deepEqual(await nodes.json(), [])
})
