import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sourceFingerprint } from './build-info.mjs'

const directory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const sourceHash = sourceFingerprint(directory)
const output = mkdtempSync(join(directory, '.music-build-'))
const destination = join(directory, 'dist')
const backup = output + '-previous'
let published = false
try {
  const result = spawnSync(
    process.execPath,
    [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.json', '--outDir', output],
    {
      cwd: directory,
      stdio: 'inherit',
    }
  )
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error('TypeScript build failed; existing dist was preserved.')
  const git = (args) =>
    spawnSync('git', args, { cwd: directory, encoding: 'utf8', windowsHide: true })
  const revision = git(['rev-parse', 'HEAD']).stdout?.trim()
  const changes = git([
    'status',
    '--porcelain',
    '--',
    'src',
    'scripts',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
  ])
  const info = {
    sourceHash,
    revision: /^[a-f0-9]{40,64}$/.test(revision ?? '') ? revision : null,
    dirty: changes.status === 0 ? Boolean(changes.stdout.trim()) : null,
    builtAt: new Date().toISOString(),
  }
  if (sourceFingerprint(directory) !== sourceHash)
    throw new Error('Source changed during compilation; retry the build.')
  writeFileSync(join(output, 'build-info.json'), JSON.stringify(info, null, 2) + '\n')
  if (existsSync(destination)) renameSync(destination, backup)
  try {
    renameSync(output, destination)
  } catch (error) {
    if (existsSync(backup)) renameSync(backup, destination)
    throw error
  }
  published = true
  console.log(
    'Built music bot ' + info.sourceHash.slice(0, 12) + (info.dirty ? ' (local changes)' : '')
  )
} finally {
  // Only these two generated sibling paths are eligible for cleanup.
  for (const target of [output, ...(published ? [backup] : [])]) {
    if (dirname(target) !== directory || !target.startsWith(join(directory, '.music-build-'))) {
      throw new Error('Invalid build cleanup path')
    }
    rmSync(target, { recursive: true, force: true })
  }
}
