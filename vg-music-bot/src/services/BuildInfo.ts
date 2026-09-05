import { readFileSync } from 'node:fs'

export interface BuildInfo {
  sourceHash: string | null
  revision: string | null
  dirty: boolean | null
  builtAt: string | null
}

export function readRuntimeBuildInfo(): BuildInfo {
  try {
    const data = JSON.parse(readFileSync(new URL('../build-info.json', import.meta.url), 'utf8'))
    if (!/^[a-f0-9]{64}$/.test(data.sourceHash)) throw new Error('Invalid build fingerprint')
    return {
      sourceHash: data.sourceHash,
      revision: /^[a-f0-9]{40,64}$/.test(data.revision ?? '') ? data.revision : null,
      dirty: typeof data.dirty === 'boolean' ? data.dirty : null,
      builtAt: typeof data.builtAt === 'string' ? data.builtAt : null,
    }
  } catch {
    return { sourceHash: null, revision: null, dirty: null, builtAt: null }
  }
}

export const runtimeBuildInfo = readRuntimeBuildInfo()
