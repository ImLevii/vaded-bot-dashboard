import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createAutoModApi, type AutoModApiClient } from './automodApi'

const apiClient: AutoModApiClient = {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
}

describe('createAutoModApi', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('maps settings and template endpoints', () => {
        const api = createAutoModApi(apiClient)

        api.getSettings('guild-1')
        api.updateSettings('guild-1', { spamEnabled: true })
        api.listTemplates('guild-1')
        api.applyTemplate('guild-1', 'strict/template')

        expect(apiClient.get).toHaveBeenNthCalledWith(
            1,
            '/guilds/guild-1/automod/settings',
        )
        expect(apiClient.patch).toHaveBeenCalledWith(
            '/guilds/guild-1/automod/settings',
            { spamEnabled: true },
        )
        expect(apiClient.get).toHaveBeenNthCalledWith(
            2,
            '/guilds/guild-1/automod/templates',
        )
        expect(apiClient.post).toHaveBeenCalledWith(
            '/guilds/guild-1/automod/templates/strict%2Ftemplate/apply',
        )
    })

    test('encodes guild and template path segments for template endpoints', () => {
        const api = createAutoModApi(apiClient)

        api.listTemplates('guild with spaces')
        api.applyTemplate('guild with spaces', 'strict/template')

        expect(apiClient.get).toHaveBeenCalledWith(
            '/guilds/guild%20with%20spaces/automod/templates',
        )
        expect(apiClient.post).toHaveBeenCalledWith(
            '/guilds/guild%20with%20spaces/automod/templates/strict%2Ftemplate/apply',
        )
    })

    // Tests for granular exempt/word/whitelist endpoints were removed with the
    // client methods they covered: no backend route ever implemented them, so
    // these only ever asserted the shape of URLs that returned 404.
})
