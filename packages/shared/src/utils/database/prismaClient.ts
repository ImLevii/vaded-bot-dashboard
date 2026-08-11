import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../generated/prisma/client.js'

let prismaInstance: PrismaClient | null = null

/** Returns a singleton Prisma client instance, initializing if necessary. */
export function getPrismaClient(): PrismaClient {
    if (!prismaInstance) {
        const databaseUrl = process.env.DATABASE_URL ?? process.env.DIRECT_URL
        if (!databaseUrl) {
            throw new Error(
                'DATABASE_URL or DIRECT_URL environment variable is required',
            )
        }
        const adapter = new PrismaPg({
            connectionString: databaseUrl,
        })
        prismaInstance = new PrismaClient({ adapter })
    }
    return prismaInstance
}

/** Disconnects the Prisma client if it is initialized. */
export function disconnectPrisma(): Promise<void> {
    if (prismaInstance) {
        return prismaInstance.$disconnect()
    }
    return Promise.resolve()
}
