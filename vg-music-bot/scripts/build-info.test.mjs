import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  copyFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { sourceFingerprint, readBuildInfo, runtimeBuildPlan } from './build-info.mjs'

test('changed source rebuilds even when an old dist entry exists', () => {
  assert.equal(
    runtimeBuildPlan({
      hasSource: true,
      hasCompiled: true,
      buildInfo: { sourceHash: 'old' },
      sourceHash: 'new',
    }),
    'build'
  )
  assert.equal(
    runtimeBuildPlan({ hasSource: true, hasCompiled: false, buildInfo: null, sourceHash: 'new' }),
    'build'
  )
  assert.equal(
    runtimeBuildPlan({
      hasSource: true,
      hasCompiled: true,
      buildInfo: { sourceHash: 'same' },
      sourceHash: 'same',
    }),
    'ready'
  )
  assert.throws(
    () => runtimeBuildPlan({ hasSource: false, hasCompiled: true, buildInfo: null }),
    /Unverified/
  )
})

test('build fingerprint changes with code and dependencies, not private runtime configuration', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'vg-build-test-'))
  t.after(() => {
    assert.equal(dirname(directory), tmpdir())
    rmSync(directory, { recursive: true, force: true })
  })
  mkdirSync(join(directory, 'src'))
  writeFileSync(join(directory, 'src/index.ts'), 'export const test = 1')
  writeFileSync(join(directory, 'package-lock.json'), '{}')
  const original = sourceFingerprint(directory)
  writeFileSync(join(directory, 'app.yml'), 'private: fixture')
  assert.equal(sourceFingerprint(directory), original)
  writeFileSync(join(directory, 'src/index.ts'), 'export const test = 2')
  const changed = sourceFingerprint(directory)
  assert.notEqual(changed, original)
  writeFileSync(join(directory, 'package-lock.json'), '{"lockfileVersion": 3}')
  assert.notEqual(sourceFingerprint(directory), changed)
  assert.equal(readBuildInfo(directory), null)
})

test('failed compilation preserves the previous build and removes temporary output', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'vg-build-test-'))
  t.after(() => {
    assert.equal(dirname(directory), tmpdir())
    rmSync(directory, { recursive: true, force: true })
  })
  const scripts = dirname(fileURLToPath(import.meta.url))
  for (const name of ['src', 'dist', 'scripts']) mkdirSync(join(directory, name))
  for (const name of ['compile.mjs', 'build-info.mjs']) {
    copyFileSync(join(scripts, name), join(directory, 'scripts', name))
  }
  writeFileSync(join(directory, 'package.json'), '{"type":"module"}')
  writeFileSync(join(directory, 'package-lock.json'), '{}')
  writeFileSync(
    join(directory, 'tsconfig.json'),
    JSON.stringify({
      include: ['src/**/*.ts'],
      compilerOptions: { outDir: './dist', rootDir: './src', types: [], skipLibCheck: true },
    })
  )
  writeFileSync(join(directory, 'src/index.ts'), 'const invalid: string = 123')
  writeFileSync(join(directory, 'dist/index.js'), 'previous working build')
  writeFileSync(join(directory, 'dist/build-info.json'), '{"previous":true}')
  const compiler = createRequire(import.meta.url).resolve('typescript/bin/tsc')
  const result = spawnSync(process.execPath, ['scripts/compile.mjs'], {
    cwd: directory,
    env: { ...process.env, NODE_PATH: dirname(dirname(dirname(compiler))) },
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true,
  })
  assert.ifError(result.error)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /TypeScript build failed; existing dist was preserved/)
  assert.equal(readFileSync(join(directory, 'dist/index.js'), 'utf8'), 'previous working build')
  assert.equal(readFileSync(join(directory, 'dist/build-info.json'), 'utf8'), '{"previous":true}')
  assert.deepEqual(
    readdirSync(directory).filter((name) => name.startsWith('.music-build-')),
    []
  )
})
