import { describe, expect, it } from '@jest/globals'
import {
    renderLevelUpMessage,
    DEFAULT_LEVEL_UP_MESSAGE,
} from './levelUpMessage'

const base = { userMention: '<@1>', level: 5, rewardMentions: [] as string[] }

describe('renderLevelUpMessage', () => {
    it('falls back to the default copy', () => {
        expect(renderLevelUpMessage(null, base)).toBe(
            DEFAULT_LEVEL_UP_MESSAGE.replace('{user}', '<@1>').replace(
                '{level}',
                '5',
            ),
        )
    })

    it('renders a custom template', () => {
        expect(renderLevelUpMessage('{user} hit lvl {level}! gg', base)).toBe(
            '<@1> hit lvl 5! gg',
        )
    })

    it('substitutes unlocked rewards', () => {
        expect(
            renderLevelUpMessage(
                '{user} reached {level} and unlocked {rewards}',
                {
                    ...base,
                    rewardMentions: ['<@&10>', '<@&11>'],
                },
            ),
        ).toBe('<@1> reached 5 and unlocked <@&10>, <@&11>')
    })

    // A guild that wrote its own template before rewards existed should still
    // see what the level unlocked rather than silently losing the information.
    it('appends rewards when the template omits the token', () => {
        expect(
            renderLevelUpMessage('{user} leveled up', {
                ...base,
                rewardMentions: ['<@&10>'],
            }),
        ).toBe('<@1> leveled up\nUnlocked: <@&10>')
    })

    it('does not append anything when there are no rewards', () => {
        expect(renderLevelUpMessage('{user} leveled up', base)).toBe(
            '<@1> leveled up',
        )
    })

    it('treats a blank template as unset', () => {
        expect(renderLevelUpMessage('   ', base)).toContain('level **5**')
    })
})
