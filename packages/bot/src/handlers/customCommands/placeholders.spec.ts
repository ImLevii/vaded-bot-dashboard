import { describe, expect, it } from '@jest/globals'
import { applyPlaceholders, type PlaceholderContext } from './placeholders'

const context: PlaceholderContext = {
    userMention: '<@1>',
    userName: 'Ada',
    userId: '1',
    guildName: 'Vaded Gaming',
    guildId: '99',
    memberCount: 1234,
    channelMention: '<#5>',
}

describe('applyPlaceholders', () => {
    it('substitutes the supported tokens', () => {
        expect(
            applyPlaceholders(
                'hi {user} ({user.name}) welcome to {server}, member {memberCount} in {channel}',
                context,
            ),
        ).toBe('hi <@1> (Ada) welcome to Vaded Gaming, member 1234 in <#5>')
    })

    it('is case-insensitive', () => {
        expect(applyPlaceholders('{USER} {MemberCount}', context)).toBe(
            '<@1> 1234',
        )
    })

    // Blanking an unknown token would hide the author's typo; leaving it in
    // place makes the mistake visible in the response itself.
    it('leaves unknown tokens untouched', () => {
        expect(applyPlaceholders('hello {nope} {user}', context)).toBe(
            'hello {nope} <@1>',
        )
    })

    it('handles a template with no tokens', () => {
        expect(applyPlaceholders('plain text', context)).toBe('plain text')
    })
})
