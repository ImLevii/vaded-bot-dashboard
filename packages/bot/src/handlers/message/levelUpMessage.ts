/**
 * Level-up announcement copy.
 *
 * The message used to be a hardcoded string, so admins could pick the channel
 * but not the wording. Templates keep that default while letting a guild write
 * its own, and `{rewards}` lets the announcement show off what the level
 * actually unlocked.
 */
export const DEFAULT_LEVEL_UP_MESSAGE = '🎉 {user} reached level **{level}**!'

export type LevelUpTemplateContext = {
    userMention: string
    level: number
    /** Mentions of roles granted by this level-up, in level order. */
    rewardMentions: string[]
}

export function renderLevelUpMessage(
    template: string | null | undefined,
    context: LevelUpTemplateContext,
): string {
    const base = template?.trim() || DEFAULT_LEVEL_UP_MESSAGE
    const rewards = context.rewardMentions.join(', ')

    const rendered = base.replace(
        /\{(user|level|rewards)\}/gi,
        (match, token: string) => {
            switch (token.toLowerCase()) {
                case 'user':
                    return context.userMention
                case 'level':
                    return String(context.level)
                case 'rewards':
                    return rewards
                default:
                    return match
            }
        },
    )

    // A template without {rewards} still shouldn't hide a newly unlocked role,
    // so append it rather than silently dropping the information.
    if (rewards && !/\{rewards\}/i.test(base)) {
        return `${rendered}\nUnlocked: ${rewards}`
    }
    return rendered
}
