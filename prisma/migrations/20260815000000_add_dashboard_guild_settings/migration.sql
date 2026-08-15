-- AlterTable
ALTER TABLE "guild_settings" ADD COLUMN "nickname" TEXT;
ALTER TABLE "guild_settings" ADD COLUMN "commandPrefix" TEXT DEFAULT '!';
ALTER TABLE "guild_settings" ADD COLUMN "managerRoles" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "guild_settings" ADD COLUMN "updatesChannel" TEXT;
ALTER TABLE "guild_settings" ADD COLUMN "timezone" TEXT DEFAULT 'UTC';
ALTER TABLE "guild_settings" ADD COLUMN "disableWarnings" BOOLEAN NOT NULL DEFAULT false;
