export * from './auth'
export * from './guild'
export * from './feature'
export * from './music'
export * from './moderation'
export * from './automod'
export * from './logs'
export * from './rbac'
export * from './batchJobs'

export interface Module {
    id: string
    name: string
    slug: string
    description: string
    enabled: boolean
    isNew?: boolean
    hasSettings: boolean
}

export interface Command {
    id: string
    name: string
    description: string
    enabled: boolean
    category: CommandCategory
    hasSettings: boolean
    hasHelp: boolean
}

/**
 * A dashboard-authored command, matching the `custom_commands` row.
 *
 * Distinct from {@link Command}, which describes a built-in. The commands page
 * used to render `Command` for this data, so it read a `category` column that
 * does not exist and assumed a non-null `description`.
 */
export interface CustomCommand {
    id: string
    guildId: string
    name: string
    description: string | null
    response: string | null
    embedData: CustomCommandEmbed | null
    enabled: boolean
    useCount: number
    lastUsed: string | null
    allowedRoles: string[]
    allowedChannels: string[]
    commandKind: 'basic' | 'job_post'
    createdBy: string
    createdAt: string
    updatedAt: string
}

export interface CustomCommandEmbed {
    title?: string
    description?: string
    color?: number
    imageUrl?: string
    footer?: string
}

export interface CreateCustomCommandInput {
    name: string
    response: string
    description?: string
}

export interface UpdateCustomCommandInput {
    response?: string
    description?: string
    enabled?: boolean
}

export type CommandCategory =
    | 'Manager'
    | 'Misc'
    | 'Info'
    | 'Fun'
    | 'Moderator'
    | 'Roles'
    | 'Tags'
    | 'Slowmode'
    | 'Game'
    | 'Levels'

export interface EmbedField {
    id: string
    name: string
    value: string
    inline: boolean
}

export interface MessageEmbed {
    id: string
    name: string
    channel: string
    color?: string
    title?: string
    titleUrl?: string
    description?: string
    authorName?: string
    authorIcon?: string
    thumbnail?: string
    image?: string
    footer?: string
    footerIcon?: string
    fields: EmbedField[]
}

export interface Autorole {
    id: string
    role: string
    type: 'add' | 'remove'
    delay: number
}

export type AutoMessageType = 'welcome' | 'leave' | 'auto_response'

export interface AutoMessage {
    id: string
    type: AutoMessageType
    channelId: string | null
    message: string
    trigger: string | null
    exactMatch: boolean
    enabled: boolean
    createdAt: string
    updatedAt: string
}

export interface Tag {
    id: string
    name: string
    content: string
    createdBy: string
    createdAt: Date
}
