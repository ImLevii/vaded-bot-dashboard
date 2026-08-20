/**
 * Autoplay is deferred pending the Lavalink migration's Phase 2 (rainlink has
 * no AUTOPLAY loop mode) — see
 * decisions/2026-06-10-defer-autoplay-engine-extraction.md. Stubbed as a
 * no-op rather than removed so callers don't need to branch on it.
 */
export async function applyStoredAutoplayPreference(
    _queue: unknown,
    _guildId: string,
): Promise<void> {}
