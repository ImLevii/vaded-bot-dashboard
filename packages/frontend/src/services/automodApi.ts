import type { AxiosInstance } from 'axios'
import type { AutoModSettings, AutoModTemplate } from '@/types'

export type AutoModApiClient = Pick<
    AxiosInstance,
    'get' | 'patch' | 'post' | 'delete'
>

function encodeGuildSegment(guildId: string): string {
    return encodeURIComponent(guildId)
}

export function createAutoModApi(apiClient: AutoModApiClient) {
    return {
        getSettings: (guildId: string) =>
            apiClient.get<{ settings: AutoModSettings }>(
                `/guilds/${guildId}/automod/settings`,
            ),
        updateSettings: (guildId: string, settings: Partial<AutoModSettings>) =>
            apiClient.patch<{ settings: AutoModSettings }>(
                `/guilds/${guildId}/automod/settings`,
                settings,
            ),
        listTemplates: (guildId: string) =>
            apiClient.get<{ templates: AutoModTemplate[] }>(
                `/guilds/${encodeGuildSegment(guildId)}/automod/templates`,
            ),
        applyTemplate: (guildId: string, templateId: string) =>
            apiClient.post<{
                settings: AutoModSettings
                templateId: string
            }>(
                `/guilds/${encodeGuildSegment(guildId)}/automod/templates/${encodeURIComponent(templateId)}/apply`,
            ),
        // NOTE: granular exempt-channel / exempt-role / word / link-whitelist
        // endpoints used to be declared here. No backend route ever
        // implemented them, so every one returned 404. Exemptions and lists
        // are edited in place and persisted through updateSettings above.
    }
}
