-- Backfill the AutoMod master switch.
--
-- `automod_settings.enabled` defaults to false and, until now, nothing read
-- it: the bot gated only on the per-filter flags. The `/automod` slash command
-- sets those per-filter flags but never touched `enabled`, so a guild
-- configured entirely through Discord sits at enabled=false with, say,
-- spamEnabled=true.
--
-- The handlers now honour `enabled` as a per-guild kill switch (so the
-- dashboard's master toggle finally does something). Without this backfill
-- that change would silently switch AutoMod off for every slash-configured
-- guild. Any guild with at least one active filter is therefore marked
-- enabled; guilds with no active filter are left alone, since nothing was
-- being enforced for them either way.
UPDATE "automod_settings"
SET "enabled" = true
WHERE "enabled" = false
  AND (
    "spamEnabled" = true
    OR "capsEnabled" = true
    OR "linksEnabled" = true
    OR "invitesEnabled" = true
    OR "wordsEnabled" = true
  );
