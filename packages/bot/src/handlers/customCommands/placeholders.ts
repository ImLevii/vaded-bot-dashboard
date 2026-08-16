/**
 * Placeholder substitution for custom command responses.
 *
 * Kept deliberately small and free of Discord API calls: every value is read
 * from objects the caller already has, so rendering a response never costs a
 * fetch and can't fail mid-reply.
 */
export type PlaceholderContext = {
    /** Mention string for the invoking user, e.g. `<@123>`. */
    userMention: string
    /** Display name of the invoking user, without a mention ping. */
    userName: string
    userId: string
    guildName: string
    guildId: string
    memberCount: number
    /** Mention string for the channel the command ran in. */
    channelMention: string
}

/**
 * Tokens are `{name}`, case-insensitive. An unknown token is left untouched
 * rather than blanked, so a typo is visible to the author instead of silently
 * producing an empty string.
 */
export function applyPlaceholders(
    template: string,
    context: PlaceholderContext,
): string {
    const values: Record<string, string> = {
        user: context.userMention,
        'user.name': context.userName,
        'user.id': context.userId,
        server: context.guildName,
        'server.id': context.guildId,
        membercount: String(context.memberCount),
        channel: context.channelMention,
    }

    return template.replace(/\{([\w.]+)\}/g, (match, rawToken: string) => {
        const value = values[rawToken.toLowerCase()]
        return value ?? match
    })
}

/** Tokens available to command authors, for docs and dashboard hints. */
export const SUPPORTED_PLACEHOLDERS = [
    '{user}',
    '{user.name}',
    '{user.id}',
    '{server}',
    '{server.id}',
    '{memberCount}',
    '{channel}',
] as const
