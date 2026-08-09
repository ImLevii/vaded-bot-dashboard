import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { redisClient } from '@lucky/shared/services'
import { debugLog, errorLog } from '@lucky/shared/utils'
import type { DiscordUser } from './DiscordOAuthService'

export interface SessionData {
    userId: string
    accessToken: string
    refreshToken: string
    user: DiscordUser
    expiresAt: number
}

const SESSION_FILE = join(process.cwd(), '.data', 'sessions.json')

class SessionService {
    private readonly sessionPrefix = 'webapp:session:'
    private readonly sessionTtl = 7 * 24 * 60 * 60
    private readonly memoryStore: Map<string, string>

    constructor() {
        this.memoryStore = this.loadFromFile()
    }

    private getSessionKey(sessionId: string): string {
        return `${this.sessionPrefix}${sessionId}`
    }

    private useRedis(): boolean {
        return redisClient.isHealthy()
    }

    private loadFromFile(): Map<string, string> {
        try {
            const raw = readFileSync(SESSION_FILE, 'utf-8')
            const entries = JSON.parse(raw) as [string, string][]
            debugLog({
                message: `Loaded ${entries.length} sessions from disk`,
            })
            return new Map(entries)
        } catch {
            return new Map()
        }
    }

    private persistToFile(): void {
        try {
            mkdirSync(join(process.cwd(), '.data'), {
                recursive: true,
            })
            const entries = Array.from(this.memoryStore.entries())
            writeFileSync(SESSION_FILE, JSON.stringify(entries), 'utf-8')
        } catch (error) {
            errorLog({
                message: 'Failed to persist sessions to disk',
                error,
            })
        }
    }

    async getSession(sessionId: string): Promise<SessionData | null> {
        try {
            const key = this.getSessionKey(sessionId)
            // Redis health is re-checked live on every call, so a health flip
            // between the original write and this read must not make an
            // existing session invisible — always fall back to the mirror.
            let data: string | null = null
            if (this.useRedis()) {
                data = await redisClient.get(key)
            }
            if (!data) {
                data = this.memoryStore.get(key) ?? null
            }

            if (!data) {
                return null
            }

            const sessionData = JSON.parse(data) as SessionData

            if (sessionData.expiresAt < Date.now()) {
                await this.deleteSession(sessionId)
                return null
            }

            return sessionData
        } catch (error) {
            errorLog({ message: 'Error getting session:', error })
            return null
        }
    }

    async setSession(
        sessionId: string,
        sessionData: SessionData,
    ): Promise<void> {
        try {
            const key = this.getSessionKey(sessionId)
            const data = JSON.stringify(sessionData)

            // Always mirror to the local store, not just when Redis looks
            // unhealthy — protects against a health-check flip erasing the
            // only copy of the data (see getSession).
            this.memoryStore.set(key, data)
            this.persistToFile()

            if (this.useRedis()) {
                await redisClient.setex(key, this.sessionTtl, data)
            } else {
                debugLog({
                    message: 'Session persisted to disk (Redis unavailable)',
                })
            }

            debugLog({
                message: 'Session stored successfully',
                data: { sessionId },
            })
        } catch (error) {
            errorLog({ message: 'Error setting session:', error })
            throw error
        }
    }

    async deleteSession(sessionId: string): Promise<void> {
        try {
            const key = this.getSessionKey(sessionId)

            this.memoryStore.delete(key)
            this.persistToFile()

            if (this.useRedis()) {
                await redisClient.del(key)
            }

            debugLog({
                message: 'Session deleted successfully',
                data: { sessionId },
            })
        } catch (error) {
            errorLog({ message: 'Error deleting session:', error })
        }
    }

    async updateSession(
        sessionId: string,
        updates: Partial<SessionData>,
    ): Promise<void> {
        try {
            const existingSession = await this.getSession(sessionId)
            if (!existingSession) {
                throw new Error('Session not found')
            }

            const updatedSession: SessionData = {
                ...existingSession,
                ...updates,
            }

            await this.setSession(sessionId, updatedSession)
        } catch (error) {
            errorLog({ message: 'Error updating session:', error })
            throw error
        }
    }
}

export const sessionService = new SessionService()
