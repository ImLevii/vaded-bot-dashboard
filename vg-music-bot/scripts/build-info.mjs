import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export function sourceFingerprint(directory) {
  const files = []
  const walk = (relative) => {
    for (const entry of readdirSync(join(directory, relative), { withFileTypes: true })) {
      const name = relative + '/' + entry.name
      if (entry.isDirectory()) walk(name)
      else if (entry.isFile()) files.push(name)
    }
  }
  walk('src')
  for (const file of [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'scripts/compile.mjs',
    'scripts/build-info.mjs',
  ]) {
    if (existsSync(join(directory, file))) files.push(file)
  }
  const hash = createHash('sha256')
  for (const file of files.sort())
    hash
      .update(file)
      .update('\0')
      .update(readFileSync(join(directory, file)))
      .update('\0')
  return hash.digest('hex')
}

export function readBuildInfo(directory) {
  try {
    const data = JSON.parse(readFileSync(join(directory, 'dist/build-info.json'), 'utf8'))
    return /^[a-f0-9]{64}$/.test(data.sourceHash) ? data : null
  } catch {
    return null
  }
}

export function runtimeBuildPlan({ hasSource, hasCompiled, buildInfo, sourceHash }) {
  if (hasSource) return hasCompiled && buildInfo?.sourceHash === sourceHash ? 'ready' : 'build'
  if (hasCompiled && buildInfo) return 'ready'
  throw new Error(
    'Unverified or missing dist build. Upload the current prebuilt package or the complete source to build it.'
  )
}
