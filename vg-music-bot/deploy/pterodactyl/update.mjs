import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const configPath = 'vg-music-bot/app.yml'
const permittedChanges = new Set([
  configPath,
  'package-lock.json',
  'vg-music-bot/package-lock.json',
])

function git(directory, args, allowFailure = false) {
  const result = spawnSync('git', args, {
    cwd: directory,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    timeout: 120000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  if (result.error || (!allowFailure && result.status !== 0)) {
    // Git remote URLs can contain credentials; never echo captured stderr.
    const operation = args[0] === '-c' ? args[2] : args[0]
    throw new Error(`Git ${operation} failed. Check repository access and local Git state.`)
  }
  return result
}

export function updateMusicCheckout(
  directory = process.cwd(),
  { fetch = true, log = console.log } = {}
) {
  const root = realpathSync(git(directory, ['rev-parse', '--show-toplevel']).stdout.trim())
  if (!existsSync(join(root, 'vg-music-bot/package.json'))) {
    throw new Error('Run this updater from the dashboard repository containing vg-music-bot/.')
  }
  if (git(root, ['branch', '--show-current']).stdout.trim() !== 'main') {
    throw new Error('The music updater requires the main branch; no files were changed.')
  }
  if (git(root, ['diff', '--cached', '--quiet'], true).status !== 0) {
    throw new Error('Staged changes must be resolved before updating; no files were changed.')
  }
  const changed = git(root, ['diff', '--name-only', '--no-renames', '-z'])
    .stdout.split('\0')
    .filter(Boolean)
  const unrelated = changed.filter((name) => !permittedChanges.has(name))
  if (unrelated.length) {
    throw new Error(
      'Other locally edited files require review before updating: ' + unrelated.join(', ')
    )
  }
  if (fetch) git(root, ['fetch', '--no-tags', 'origin', 'main'])
  const before = git(root, ['rev-parse', 'HEAD']).stdout.trim()
  const target = git(root, ['rev-parse', '--verify', 'FETCH_HEAD^{commit}']).stdout.trim()
  if (!/^[a-f0-9]{40,64}$/.test(target)) throw new Error('Invalid fetched main revision.')
  if (before === target) {
    log('[music-update] Already on main ' + target.slice(0, 8))
    return { updated: false, revision: target }
  }
  if (git(root, ['merge-base', '--is-ancestor', before, target], true).status !== 0) {
    throw new Error('Local main has diverged from fetched main; no files were changed.')
  }

  // Git may overwrite ignored files when an upstream revision starts tracking
  // them. Reject those collisions before temporarily restoring any local edits.
  const incoming = git(root, ['diff', '--name-only', '--no-renames', '-z', before, target])
    .stdout.split('\0')
    .filter(Boolean)
  const privateCollision = incoming.find(
    (name) =>
      /^(?:vg-music-bot\/)?(?:\.env(?:\.[^/]+)?$|data\/)/.test(name) &&
      existsSync(join(root, name)) &&
      git(root, ['ls-files', '--error-unmatch', '--', name], true).status !== 0
  )
  if (privateCollision) {
    throw new Error(
      'Upstream would change a private runtime file; no files were changed: ' + privateCollision
    )
  }

  const files = [...new Set([configPath, ...changed])].map((name) => {
    const filename = join(root, name)
    const stat = lstatSync(filename)
    const contained = relative(root, realpathSync(filename))
    if (
      !stat.isFile() ||
      isAbsolute(contained) ||
      contained === '..' ||
      contained.startsWith('..' + (process.platform === 'win32' ? '\\' : '/'))
    ) {
      throw new Error('Runtime backup requires a regular file inside the repository: ' + name)
    }
    return { name, filename, mode: stat.mode & 0o777 }
  })
  const gitDirectory = git(root, ['rev-parse', '--absolute-git-dir']).stdout.trim()
  const backupRoot = join(gitDirectory, 'music-runtime-backups')
  mkdirSync(backupRoot, { recursive: true, mode: 0o700 })
  const backupDirectory = mkdtempSync(join(backupRoot, 'update-'))
  chmodSync(backupDirectory, 0o700)
  for (const file of files) {
    file.backup = join(backupDirectory, file.name.replaceAll('/', '__'))
    copyFileSync(file.filename, file.backup)
    chmodSync(file.backup, 0o600)
  }
  writeFileSync(
    join(backupDirectory, 'manifest.json'),
    JSON.stringify(
      {
        before,
        target,
        files: files.map(({ name, mode }) => ({ name, mode })),
      },
      null,
      2
    ) + '\n',
    { mode: 0o600 }
  )
  log('[music-update] Runtime backups saved in ' + backupDirectory)

  let updated = false
  try {
    if (changed.length) git(root, ['restore', '--source=HEAD', '--worktree', '--', ...changed])
    git(root, ['-c', 'merge.autostash=false', 'merge', '--ff-only', '--no-edit', target])
    updated = true
  } finally {
    // On success use repository lockfiles for npm ci. On failure retain all
    // original edits. Private configuration is restored in either case.
    for (const file of files) {
      if (!updated || file.name === configPath) {
        copyFileSync(file.backup, file.filename)
        chmodSync(file.filename, file.mode)
      }
    }
  }
  log('[music-update] Updated main to ' + target.slice(0, 8) + '; private app.yml preserved.')
  return { updated: true, revision: target, backupDirectory }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    updateMusicCheckout()
  } catch (error) {
    console.error('[music-update]', error instanceof Error ? error.message : 'Update failed.')
    process.exitCode = 1
  }
}
