-- CreateTable
CREATE TABLE "guild_user_grants" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_user_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guild_user_grants_guildId_idx" ON "guild_user_grants"("guildId");

-- CreateIndex
CREATE INDEX "guild_user_grants_guildId_userId_idx" ON "guild_user_grants"("guildId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "guild_user_grants_guildId_userId_module_key" ON "guild_user_grants"("guildId", "userId", "module");

-- AddForeignKey
ALTER TABLE "guild_user_grants" ADD CONSTRAINT "guild_user_grants_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId") ON DELETE CASCADE ON UPDATE CASCADE;
