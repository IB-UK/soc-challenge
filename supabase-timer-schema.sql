-- Operation: Dark Harbour — Team timer columns
-- Run in Supabase SQL Editor after the main schema
-- Safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)

ALTER TABLE public.soc_teams
  ADD COLUMN IF NOT EXISTS started_at    timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS duration_mins integer     NOT NULL DEFAULT 20;

-- Enable realtime updates for team timer changes
-- (soc_teams should already be in supabase_realtime from the main schema,
--  but if not, uncomment the line below)
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.soc_teams;
