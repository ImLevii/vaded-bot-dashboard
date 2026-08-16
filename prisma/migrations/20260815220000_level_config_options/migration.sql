-- Level system configuration options.
--
-- LevelConfig previously exposed only enabled/xpPerMessage/xpCooldownMs/
-- announceChannel, so there was nothing to configure for ignored channels,
-- ignored roles, announcement routing, message wording, or reward stacking —
-- all of those were hardcoded in the XP handler.
--
-- Defaults are chosen to preserve current behaviour exactly: no ignores,
-- announcements go to announceChannel (and are skipped when it is unset),
-- default copy, and rewards accumulate.
ALTER TABLE "level_configs" ADD COLUMN "ignoredChannels" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "level_configs" ADD COLUMN "ignoredRoles" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "level_configs" ADD COLUMN "announceMode" TEXT NOT NULL DEFAULT 'channel';
ALTER TABLE "level_configs" ADD COLUMN "levelUpMessage" TEXT;
ALTER TABLE "level_configs" ADD COLUMN "stackRewards" BOOLEAN NOT NULL DEFAULT true;
