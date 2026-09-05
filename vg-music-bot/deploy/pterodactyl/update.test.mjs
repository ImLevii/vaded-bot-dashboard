import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import test from 'node:test'
import { updateMusicCheckout } from './update.mjs'

const configPath = 'vg-music-bot/app.yml'
const lockPaths = ['package-lock.json', 'vg-music-bot/package-lock.json']
const privateConfig = Buffer.from(
  'bot:\r\n  TOKEN: "test-runtime-only-token"\r\nplayer:\r\n  label: "Music \u266b"\r\n'
)
const runtimeLock = Buffer.from('{"name":"runtime-install","lockfileVersion":2}\n')
const upstreamLock = Buffer.from('{"name":"upstream-install","lockfileVersion":3}\n')

function git(directory, ...args) {
  const result = spawnSync('git', ['-c', 'commit.gpgsign=false', ...args], {
    cwd: directory,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15000,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Music updater test',
      GIT_AUTHOR_EMAIL: 'music-updater-test@example.invalid',
      GIT_COMMITTER_NAME: 'Music updater test',
      GIT_COMMITTER_EMAIL: 'music-updater-test@example.invalid',
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_NOSYSTEM: '1',
    },
  })
  assert.ifError(result.error)
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`)
  return result.stdout.trim()
}

function write(directory, name, bytes) {
  const path = join(directory, name)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, bytes)
}

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'vg-music-update-test-'))
  t.after(() => {
    const target = resolve(directory)
    assert.equal(dirname(target), resolve(tmpdir()))
    assert.ok(target.startsWith(join(resolve(tmpdir()), 'vg-music-update-test-')))
    rmSync(target, { recursive: true, force: true })
  })
  const upstream = join(directory, 'upstream')
  const checkout = join(directory, 'runtime')
  mkdirSync(upstream)
  git(upstream, 'init', '--initial-branch=main')
  git(upstream, 'config', 'core.autocrlf', 'false')
  write(upstream, '.gitignore', '.env\nvg-music-bot/.env\nvg-music-bot/data/\n')
  write(upstream, 'package.json', '{"name":"dashboard-fixture","private":true}\n')
  write(upstream, 'vg-music-bot/package.json', '{"name":"music-bot-fixture","private":true}\n')
  write(upstream, configPath, 'bot:\n  TOKEN: "tracked-placeholder"\n')
  for (const lock of lockPaths) write(upstream, lock, '{"lockfileVersion":1}\n')
  write(upstream, 'vg-music-bot/src/index.ts', 'export const version = 1\n')
  git(upstream, 'add', '.')
  git(upstream, 'commit', '-m', 'Initial music bot fixture')
  git(directory, '-c', 'core.autocrlf=false', 'clone', '--local', upstream, checkout)
  git(checkout, 'config', 'core.autocrlf', 'false')
  return { upstream, checkout }
}

function dirtyRuntime(checkout) {
  write(checkout, configPath, privateConfig)
  for (const lock of lockPaths) write(checkout, lock, runtimeLock)
  write(checkout, '.env', 'VG_MUSIC_BOT_TOKEN=test-shared-secret\n')
  write(checkout, 'vg-music-bot/.env', 'DISCORD_TOKEN=test-discord-secret\n')
  write(checkout, 'vg-music-bot/data/cylane.database.json', '{"guild":"test-guild"}\n')
  write(checkout, 'runtime-note.txt', 'untracked operator note\n')
}

function publish(upstream, additionalFiles = {}) {
  for (const lock of lockPaths) write(upstream, lock, upstreamLock)
  write(upstream, configPath, 'bot:\n  TOKEN: "new-upstream-placeholder"\n')
  write(upstream, 'vg-music-bot/src/index.ts', 'export const version = 2\n')
  for (const [name, value] of Object.entries(additionalFiles)) write(upstream, name, value)
  git(upstream, 'add', '.')
  git(upstream, 'commit', '-m', 'Updated music bot fixture')
  return git(upstream, 'rev-parse', 'HEAD')
}

function backupContents(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? backupContents(path) : [readFileSync(path)]
  })
}

function snapshot(checkout) {
  const files = [configPath, ...lockPaths, 'vg-music-bot/src/index.ts']
  return {
    revision: git(checkout, 'rev-parse', 'HEAD'),
    status: git(checkout, 'status', '--porcelain=v1', '-z'),
    staged: git(checkout, 'diff', '--cached', '--binary'),
    files: Object.fromEntries(files.map((name) => [name, readFileSync(join(checkout, name))])),
  }
}

function assertPrivateRuntime(checkout) {
  assert.deepEqual(readFileSync(join(checkout, configPath)), privateConfig)
  assert.equal(
    readFileSync(join(checkout, '.env'), 'utf8'),
    'VG_MUSIC_BOT_TOKEN=test-shared-secret\n'
  )
  assert.equal(
    readFileSync(join(checkout, 'vg-music-bot/.env'), 'utf8'),
    'DISCORD_TOKEN=test-discord-secret\n'
  )
  assert.equal(
    readFileSync(join(checkout, 'vg-music-bot/data/cylane.database.json'), 'utf8'),
    '{"guild":"test-guild"}\n'
  )
  assert.equal(
    readFileSync(join(checkout, 'runtime-note.txt'), 'utf8'),
    'untracked operator note\n'
  )
}

test('updater fast-forwards local main, preserves private bytes and data, and backs up replaced locks', async (t) => {
  const { upstream, checkout } = fixture(t)
  dirtyRuntime(checkout)
  const revision = publish(upstream)
  const result = await updateMusicCheckout(checkout, { log() {} })
  assert.equal(result.updated, true)
  assert.equal(result.revision, revision)
  assert.equal(git(checkout, 'rev-parse', 'HEAD'), revision)
  assertPrivateRuntime(checkout)
  for (const lock of lockPaths) assert.deepEqual(readFileSync(join(checkout, lock)), upstreamLock)
  assert.equal(
    readFileSync(join(checkout, 'vg-music-bot/src/index.ts'), 'utf8'),
    'export const version = 2\n'
  )
  assert.ok(result.backupDirectory)
  const backups = resolve(checkout, result.backupDirectory)
  const backupRoot = join(checkout, '.git', 'music-runtime-backups')
  const backupRelative = relative(backupRoot, backups)
  assert.ok(backupRelative && backupRelative !== '..' && !backupRelative.startsWith('..' + sep))
  const saved = backupContents(backups)
  assert.ok(
    saved.some((bytes) => bytes.equals(privateConfig)),
    'private config backup must preserve exact bytes'
  )
  assert.equal(
    saved.filter((bytes) => bytes.equals(runtimeLock)).length,
    2,
    'both previous lockfiles must have backups'
  )

  const before = snapshot(checkout)
  const repeat = await updateMusicCheckout(checkout, { log() {} })
  assert.equal(repeat.updated, false)
  assert.equal(repeat.revision, revision)
  assert.deepEqual(snapshot(checkout), before)
  assertPrivateRuntime(checkout)
  assert.ok(existsSync(backups), 'repeated update must retain the first backup')
})

test('updater rejects staged changes without altering index, private config, or working files', async (t) => {
  const { upstream, checkout } = fixture(t)
  dirtyRuntime(checkout)
  publish(upstream)
  git(checkout, 'add', 'vg-music-bot/package-lock.json')
  const before = snapshot(checkout)
  await assert.rejects(async () => updateMusicCheckout(checkout, { log() {} }))
  assert.deepEqual(snapshot(checkout), before)
  assertPrivateRuntime(checkout)
})

test('updater rejects unrelated tracked edits without altering private config or working files', async (t) => {
  const { upstream, checkout } = fixture(t)
  dirtyRuntime(checkout)
  publish(upstream)
  write(checkout, 'vg-music-bot/src/index.ts', 'export const operatorEdit = true\n')
  const before = snapshot(checkout)
  await assert.rejects(async () => updateMusicCheckout(checkout, { log() {} }))
  assert.deepEqual(snapshot(checkout), before)
  assertPrivateRuntime(checkout)
})

test('updater rejects diverged main history without resetting local commits or runtime changes', async (t) => {
  const { upstream, checkout } = fixture(t)
  write(checkout, 'operator-commit.txt', 'local committed change\n')
  git(checkout, 'add', 'operator-commit.txt')
  git(checkout, 'commit', '-m', 'Local operator commit')
  dirtyRuntime(checkout)
  publish(upstream)
  const before = snapshot(checkout)
  await assert.rejects(async () => updateMusicCheckout(checkout, { log() {} }))
  assert.deepEqual(snapshot(checkout), before)
  assertPrivateRuntime(checkout)
})

test('failed fast-forward restores private config and both runtime lockfiles after an untracked-file collision', async (t) => {
  const { upstream, checkout } = fixture(t)
  dirtyRuntime(checkout)
  write(checkout, 'vg-music-bot/operator-note.txt', 'untracked local file must survive\n')
  publish(upstream, { 'vg-music-bot/operator-note.txt': 'new upstream tracked file\n' })
  const before = snapshot(checkout)
  await assert.rejects(async () => updateMusicCheckout(checkout, { log() {} }))
  assert.deepEqual(snapshot(checkout), before)
  assertPrivateRuntime(checkout)
  assert.equal(
    readFileSync(join(checkout, 'vg-music-bot/operator-note.txt'), 'utf8'),
    'untracked local file must survive\n'
  )
  const root = join(checkout, '.git', 'music-runtime-backups')
  assert.ok(existsSync(root), 'failed merge must retain recovery backups')
  const saved = backupContents(root)
  assert.ok(saved.some((bytes) => bytes.equals(privateConfig)))
  assert.equal(saved.filter((bytes) => bytes.equals(runtimeLock)).length, 2)
})

test('updater refuses a non-main checkout before changing runtime files', async (t) => {
  const { upstream, checkout } = fixture(t)
  git(checkout, 'switch', '-c', 'operator-work')
  dirtyRuntime(checkout)
  publish(upstream)
  const before = snapshot(checkout)
  await assert.rejects(async () => updateMusicCheckout(checkout, { log() {} }))
  assert.deepEqual(snapshot(checkout), before)
  assert.equal(git(checkout, 'branch', '--show-current'), 'operator-work')
})

test('updater requires a regular app.yml file before temporarily restoring runtime files', async (t) => {
  const { upstream, checkout } = fixture(t)
  dirtyRuntime(checkout)
  publish(upstream)
  unlinkSync(join(checkout, configPath))
  mkdirSync(join(checkout, configPath))
  write(checkout, configPath + '/keep.txt', 'operator directory must survive\n')
  const before = git(checkout, 'rev-parse', 'HEAD')
  await assert.rejects(async () => updateMusicCheckout(checkout, { log() {} }))
  assert.equal(git(checkout, 'rev-parse', 'HEAD'), before)
  assert.equal(
    readFileSync(join(checkout, configPath, 'keep.txt'), 'utf8'),
    'operator directory must survive\n'
  )
  for (const lock of lockPaths) assert.deepEqual(readFileSync(join(checkout, lock)), runtimeLock)
})

test('updater refuses incoming tracked files that would overwrite ignored private env and data', async (t) => {
  const { upstream, checkout } = fixture(t)
  dirtyRuntime(checkout)
  publish(upstream)
  write(upstream, 'vg-music-bot/.env', 'DISCORD_TOKEN=upstream-placeholder\n')
  write(upstream, 'vg-music-bot/data/cylane.database.json', '{"guild":"upstream-placeholder"}\n')
  git(upstream, 'add', '--force', 'vg-music-bot/.env', 'vg-music-bot/data/cylane.database.json')
  git(upstream, 'commit', '-m', 'Force tracked runtime paths into upstream')
  const before = snapshot(checkout)
  await assert.rejects(async () => updateMusicCheckout(checkout, { log() {} }))
  assert.deepEqual(snapshot(checkout), before)
  assertPrivateRuntime(checkout)
})
