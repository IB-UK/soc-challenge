-- Fix: add missing UPDATE/DELETE policies on soc_teams
-- Run this in Supabase SQL Editor if "Start All Timers" had no effect

CREATE POLICY IF NOT EXISTS "Public update soc_teams"
  ON public.soc_teams FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Public delete soc_teams"
  ON public.soc_teams FOR DELETE USING (true);

-- Also ensure members and task_progress have delete policies
CREATE POLICY IF NOT EXISTS "Public delete soc_members"
  ON public.soc_members FOR DELETE USING (true);

CREATE POLICY IF NOT EXISTS "Public delete soc_task_progress"
  ON public.soc_task_progress FOR DELETE USING (true);
