import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { dependencyStamp, startupConfiguration, validateRuntimeFiles } from './start.mjs'

test('primary allocation wins over inherited host/port and shared HTTP token matches Vercel normalization', () => {
  const env = startupConfiguration(
    {
      SERVER_PORT: '25573',
      VG_MUSIC_BOT_PORT: '8080',
      VG_MUSIC_BOT_HOST: 'localhost',
      VG_MUSIC_BOT_TOKEN: ' example:keep-this-exact! ',
      VG_MUSIC_BOT_DISCORD_TOKEN: 'existing-bot-identity',
    },
    '24.18.1'
  )
  assert.equal(env.VG_MUSIC_BOT_PORT, '25573')
  assert.equal(env.VG_MUSIC_BOT_HOST, '0.0.0.0')
  assert.equal(env.VG_MUSIC_BOT_TOKEN, 'example:keep-this-exact!')
  assert.equal(env.VG_MUSIC_BOT_DISCORD_TOKEN, 'existing-bot-identity')
  assert.equal(env.NODE_ENV, 'production')
})

test('invalid allocation and unresolved API credentials fail before any process starts', () => {
  for (const port of [undefined, '', '0', '-1', '65536', '25573.5', '25573oops']) {
    assert.throws(
      () =>
        startupConfiguration({ SERVER_PORT: port, VG_MUSIC_BOT_TOKEN: 'valid-token' }, '24.0.0'),
      /SERVER_PORT/
    )
  }
  for (const token of [
    undefined,
    '',
    ' ',
    'undefined',
    'null',
    'youshallnotpass',
    '${VG_MUSIC_BOT_TOKEN}',
  ]) {
    assert.throws(
      () => startupConfiguration({ SERVER_PORT: '25573', VG_MUSIC_BOT_TOKEN: token }, '24.0.0'),
      /VG_MUSIC_BOT_TOKEN/
    )
  }
})

test('unsupported Node image fails with a useful panel instruction', () => {
  assert.throws(
    () =>
      startupConfiguration({ SERVER_PORT: '25573', VG_MUSIC_BOT_TOKEN: 'valid-token' }, '22.0.0'),
    /Node.js 24/
  )
})

test('prebuilt package validation resolves files from the bot directory and requires app config', () => {
  const directory = resolve('example-bot-directory')
  const files = new Set(
    ['app.yml', 'package.json', 'package-lock.json', 'dist/index.js'].map((file) =>
      resolve(directory, file)
    )
  )
  validateRuntimeFiles(directory, (file) => files.has(file))
  files.delete(resolve(directory, 'app.yml'))
  assert.throws(() => validateRuntimeFiles(directory, (file) => files.has(file)), /Missing app.yml/)
  files.add(resolve(directory, 'app.yml'))
  files.delete(resolve(directory, 'dist/index.js'))
  assert.throws(
    () => validateRuntimeFiles(directory, (file) => files.has(file)),
    /Missing dist\/index.js/
  )
})

test('dependency reuse is invalidated by a new lockfile, OS, architecture, or Node major', () => {
  const stamp = dependencyStamp('lock-one', 'linux', 'x64', '24.0.0')
  assert.equal(stamp, dependencyStamp('lock-one', 'linux', 'x64', '24.18.1'))
  assert.notEqual(stamp, dependencyStamp('lock-two', 'linux', 'x64', '24.0.0'))
  assert.notEqual(stamp, dependencyStamp('lock-one', 'win32', 'x64', '24.0.0'))
  assert.notEqual(stamp, dependencyStamp('lock-one', 'linux', 'arm64', '24.0.0'))
  assert.notEqual(stamp, dependencyStamp('lock-one', 'linux', 'x64', '22.0.0'))
})
