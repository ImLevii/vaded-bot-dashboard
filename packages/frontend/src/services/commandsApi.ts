import type { AxiosInstance } from 'axios'
import type {
    CreateCustomCommandInput,
    CustomCommand,
    UpdateCustomCommandInput,
} from '@/types'

export type CommandsApiClient = Pick<
    AxiosInstance,
    'get' | 'post' | 'patch' | 'delete'
>

/**
 * Client for dashboard-authored commands.
 *
 * Everything is keyed by command **name**, which is what the backend routes
 * use (`/commands/:name`) and what `@@unique([guildId, name])` enforces. The
 * previous inline client keyed mutations by the row id and posted to a
 * `/commands/:id/toggle` route that was never implemented, so every toggle
 * 404'd.
 */
export function createCommandsApi(apiClient: CommandsApiClient) {
    const base = (guildId: string) =>
        `/guilds/${encodeURIComponent(guildId)}/commands`

    return {
        list: (guildId: string) =>
            apiClient.get<{ commands: CustomCommand[] }>(base(guildId)),

        create: (guildId: string, data: CreateCustomCommandInput) =>
            apiClient.post<CustomCommand>(base(guildId), data),

        update: (
            guildId: string,
            name: string,
            data: UpdateCustomCommandInput,
        ) =>
            apiClient.patch<CustomCommand>(
                `${base(guildId)}/${encodeURIComponent(name)}`,
                data,
            ),

        /** Enable/disable is just a partial update of the same row. */
        toggle: (guildId: string, name: string, enabled: boolean) =>
            apiClient.patch<CustomCommand>(
                `${base(guildId)}/${encodeURIComponent(name)}`,
                { enabled },
            ),

        remove: (guildId: string, name: string) =>
            apiClient.delete<{ success: boolean }>(
                `${base(guildId)}/${encodeURIComponent(name)}`,
            ),
    }
}
