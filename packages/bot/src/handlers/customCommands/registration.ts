import { REST, Routes, SlashCommandBuilder } from 'discord.js'
import { config } from '@lucky/shared/config'
import { customCommandService } from '@lucky/shared/services'
import { errorLog, infoLog, warnLog } from '@lucky/shared/utils'
import type { CustomClient } from '../../types'

/**
 * Registers a guild's dashboard-authored commands with Discord as
 * **guild-scoped** slash commands.
 *
 * Guild commands are the right scope here for two reasons: they propagate
 * instantly (global commands can take up to an hour, which would defeat
 * "create it and use it"), and custom commands are per-guild data anyway.
 *
 * Guild and global commands are merged by Discord, so this PUT carries *only*
 * the custom commands — the ~80 global ones stay registered and visible. It
 * must not include them: writing global copies into every guild is exactly the
 * duplication `npm run commands:clear-guild` exists to undo (#1886).
 */

/** Discord slash command names: lowercase, 1-32 chars. */
const DISCORD_NAME_PATTERN = /^[a-z0-9_-]{1,32}$/

function buildCommandData(
    name: string,
    description: string | null,
): ReturnType<SlashCommandBuilder['toJSON']> {
    return new SlashCommandBuilder()
        .setName(name)
        .setDescription(
            // Discord requires a non-empty description, but the column is
            // nullable and the dashboard makes it optional.
            description?.trim() || `Custom command: ${name}`,
        )
        .toJSON()
}

/**
 * Names that already exist as built-in commands. Discord permits a guild
 * command that shadows a global one, but the user would see two identical
 * entries in the picker, so those are skipped and reported.
 */
function getBuiltinNames(client: CustomClient): Set<string> {
    return new Set(client.commands.map((command) => command.data.name))
}

export type SyncResult = {
    registered: string[]
    skipped: { name: string; reason: string }[]
}

export async function syncGuildCustomCommands(
    client: CustomClient,
    guildId: string,
    deps?: { rest?: Pick<REST, 'put'> },
): Promise<SyncResult> {
    const { TOKEN, CLIENT_ID } = config()
    const result: SyncResult = { registered: [], skipped: [] }

    if (!TOKEN || !CLIENT_ID) {
        warnLog({
            message:
                'customCommands: cannot sync guild commands — TOKEN/CLIENT_ID missing',
        })
        return result
    }

    const commands = await customCommandService.listCommands(guildId)
    const builtins = getBuiltinNames(client)
    const body: ReturnType<SlashCommandBuilder['toJSON']>[] = []

    for (const command of commands ?? []) {
        if (!command.enabled) {
            result.skipped.push({ name: command.name, reason: 'disabled' })
            continue
        }
        if (!DISCORD_NAME_PATTERN.test(command.name)) {
            result.skipped.push({
                name: command.name,
                reason: 'name not valid for a Discord slash command',
            })
            continue
        }
        if (builtins.has(command.name)) {
            result.skipped.push({
                name: command.name,
                reason: 'shadows a built-in command',
            })
            continue
        }
        body.push(buildCommandData(command.name, command.description))
        result.registered.push(command.name)
    }

    const rest = deps?.rest ?? new REST({ version: '10' }).setToken(TOKEN)

    try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), {
            body,
        })
        infoLog({
            message: `customCommands: registered ${result.registered.length} guild command(s) for ${guildId}`,
        })
        if (result.skipped.length > 0) {
            warnLog({
                message: `customCommands: skipped ${result.skipped.length} command(s) for ${guildId}`,
                data: result.skipped,
            })
        }
    } catch (error) {
        errorLog({
            message: `customCommands: failed to register guild commands for ${guildId}`,
            error,
        })
    }

    return result
}
