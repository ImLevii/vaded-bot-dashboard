import type { WebServer } from '../@types/Config.js'

/** Resolve the music API listener without rewriting the operator's app.yml. */
export function musicHostingConfig(
  configured: WebServer,
  env: NodeJS.ProcessEnv = process.env
): WebServer {
  const result = { ...configured, whitelist: [...configured.whitelist] }
  const allocation = env.VG_MUSIC_BOT_PORT ?? env.SERVER_PORT
  if (allocation !== undefined) {
    if (!/^\d+$/.test(allocation) || Number(allocation) < 1 || Number(allocation) > 65535) {
      throw new Error('VG_MUSIC_BOT_PORT / SERVER_PORT must be a port between 1 and 65535')
    }
    result.port = Number(allocation)
    result.host = '0.0.0.0'
  }
  if (env.VG_MUSIC_BOT_HOST !== undefined) result.host = env.VG_MUSIC_BOT_HOST
  if (env.VG_MUSIC_BOT_TOKEN !== undefined) {
    // Match the Vercel client and HTTP header whitespace normalization.
    result.auth = env.VG_MUSIC_BOT_TOKEN.trim()
    result.enable = true
  }
  if (result.enable) {
    if (!result.host?.trim()) throw new Error('The music API host must not be empty')
    if (!Number.isInteger(result.port) || result.port < 1 || result.port > 65535) {
      throw new Error('The music API port must be between 1 and 65535')
    }
    if (
      typeof result.auth !== 'string' ||
      !result.auth.trim() ||
      /^(undefined|null)$/i.test(result.auth.trim()) ||
      result.auth.includes('${') ||
      /[\r\n]/.test(result.auth)
    ) {
      throw new Error('Set VG_MUSIC_BOT_TOKEN to the shared dashboard API secret')
    }
  }
  return result
}
