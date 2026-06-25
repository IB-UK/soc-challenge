-- Fix: add missing UPDATE/DELETE policies on soc_teams
-- Run this in Supabase SQL Editor if "Start All Timers" had no effect

DO $$ BEGIN
  CREATE POLICY "Public update soc_teams"
    ON public.soc_teams FOR UPDATE USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public delete soc_teams"
    ON public.soc_teams FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public delete soc_members"
    ON public.soc_members FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public delete soc_task_progress"
    ON public.soc_task_progress FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
