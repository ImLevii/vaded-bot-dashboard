import type { AxiosInstance } from 'axios'

/** Where a level-up is announced. */
export type LevelAnnounceMode = 'channel' | 'current' | 'dm' | 'off'

export interface LevelConfig {
    id: string
    guildId: string
    enabled: boolean
    xpPerMessage: number
    xpCooldownMs: number
    announceChannel: string | null
    ignoredChannels: string[]
    ignoredRoles: string[]
    announceMode: LevelAnnounceMode
    levelUpMessage: string | null
    stackRewards: boolean
    createdAt: string
    updatedAt: string
}

export interface MemberXP {
    id: string
    guildId: string
    userId: string
    displayName?: string | null
    xp: number
    level: number
    lastXpAt: string
    createdAt: string
    updatedAt: string
}

export interface LevelReward {
    id: string
    guildId: string
    level: number
    roleId: string
}

export interface UpdateLevelConfigInput {
    enabled?: boolean
    xpPerMessage?: number
    xpCooldownMs?: number
    announceChannel?: string | null
    ignoredChannels?: string[]
    ignoredRoles?: string[]
    announceMode?: LevelAnnounceMode
    levelUpMessage?: string | null
    stackRewards?: boolean
}

export interface AdjustXpInput {
    userId: string
    amount: number
    mode?: 'add' | 'set'
}

export interface LeaderboardPage {
    leaderboard: MemberXP[]
    /** Members with XP in the guild, not just on this page. */
    total: number
}

export interface AddRewardInput {
    level: number
    roleId: string
}

export function xpNeededForLevel(level: number): number {
    return level * level * 100
}

/**
 * The leaderboard query schema rejects limit > 50 outright, so a caller
 * asking for more gets a 400 rather than a truncated page. Clamp instead.
 */
const MAX_LEADERBOARD_LIMIT = 50

export function createLevelsApi(client: AxiosInstance) {
    // Both leaderboard reads hit the same endpoint and differ only in what
    // they ask for and hand back, so the URL and response shape live here once.
    async function requestLeaderboard(
        guildId: string,
        params: { limit: number; offset?: number },
    ): Promise<{ leaderboard: MemberXP[]; total?: number }> {
        const res = await client.get<{
            leaderboard: MemberXP[]
            total?: number
        }>(`/guilds/${guildId}/levels/leaderboard`, {
            params: {
                ...params,
                limit: Math.min(params.limit, MAX_LEADERBOARD_LIMIT),
            },
        })
        return res.data
    }

    return {
        async getConfig(guildId: string): Promise<LevelConfig | null> {
            const res = await client.get<{ config: LevelConfig | null }>(
                `/guilds/${guildId}/levels/config`,
            )
            return res.data.config
        },

        async updateConfig(
            guildId: string,
            data: UpdateLevelConfigInput,
        ): Promise<LevelConfig> {
            const res = await client.patch<{ config: LevelConfig }>(
                `/guilds/${guildId}/levels/config`,
                data,
            )
            return res.data.config
        },

        /** Top N only — for widgets that never page past the first screen. */
        async getLeaderboard(guildId: string, limit = 10): Promise<MemberXP[]> {
            const { leaderboard } = await requestLeaderboard(guildId, { limit })
            return leaderboard
        },

        /**
         * Paginated variant; `total` drives the page controls. Falls back to
         * the page length so a backend that omits `total` renders a single
         * page rather than an empty one.
         */
        async getLeaderboardPage(
            guildId: string,
            limit = 10,
            offset = 0,
        ): Promise<LeaderboardPage> {
            const data = await requestLeaderboard(guildId, {
                limit,
                offset: Math.max(offset, 0),
            })
            return {
                leaderboard: data.leaderboard,
                total: data.total ?? data.leaderboard.length,
            }
        },

        async adjustXp(
            guildId: string,
            data: AdjustXpInput,
        ): Promise<MemberXP> {
            const res = await client.post<{ member: MemberXP }>(
                `/guilds/${guildId}/levels/xp`,
                data,
            )
            return res.data.member
        },

        async resetGuildXp(guildId: string): Promise<number> {
            const res = await client.delete<{ removed: number }>(
                `/guilds/${guildId}/levels/xp`,
            )
            return res.data.removed
        },

        async getRank(
            guildId: string,
            userId: string,
        ): Promise<{ memberXp: MemberXP; rank: number }> {
            const res = await client.get<{ memberXp: MemberXP; rank: number }>(
                `/guilds/${guildId}/levels/rank/${userId}`,
            )
            return res.data
        },

        async getRewards(guildId: string): Promise<LevelReward[]> {
            const res = await client.get<{ rewards: LevelReward[] }>(
                `/guilds/${guildId}/levels/rewards`,
            )
            return res.data.rewards
        },

        async addReward(
            guildId: string,
            data: AddRewardInput,
        ): Promise<LevelReward> {
            const res = await client.post<{ reward: LevelReward }>(
                `/guilds/${guildId}/levels/rewards`,
                data,
            )
            return res.data.reward
        },

        async removeReward(guildId: string, level: number): Promise<void> {
            await client.delete(`/guilds/${guildId}/levels/rewards/${level}`)
        },
    }
}
