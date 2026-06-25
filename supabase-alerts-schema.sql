-- Operation: Dark Harbour — Alerts system addendum
-- Run this in Supabase SQL Editor AFTER the main schema has been applied
-- Safe to re-run (uses IF NOT EXISTS)

-- ── Alerts (fired by facilitator, received by all teams) ─────────────────────
CREATE TABLE IF NOT EXISTS public.soc_alerts (
  id             uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  title          text    NOT NULL,
  description    text    NOT NULL,
  options        jsonb   NOT NULL,          -- string[]
  correct_answer text    NOT NULL,
  bonus_points   integer NOT NULL DEFAULT 20,
  duration_secs  integer NOT NULL DEFAULT 60,
  fired_at       timestamptz DEFAULT now()
);

-- ── Alert responses (one row per team per alert) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.soc_alert_responses (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_id    uuid    NOT NULL REFERENCES public.soc_alerts(id) ON DELETE CASCADE,
  team_id     uuid    NOT NULL REFERENCES public.soc_teams(id)  ON DELETE CASCADE,
  answer      text    NOT NULL,
  score       integer NOT NULL DEFAULT 0,
  answered_at timestamptz DEFAULT now(),
  UNIQUE (alert_id, team_id)
);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.soc_alerts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soc_alert_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read soc_alerts"
  ON public.soc_alerts FOR SELECT USING (true);
CREATE POLICY "Public insert soc_alerts"
  ON public.soc_alerts FOR INSERT WITH CHECK (true);

CREATE POLICY "Public read soc_alert_responses"
  ON public.soc_alert_responses FOR SELECT USING (true);
CREATE POLICY "Public insert soc_alert_responses"
  ON public.soc_alert_responses FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update soc_alert_responses"
  ON public.soc_alert_responses FOR UPDATE USING (true);

-- ── Realtime ──────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.soc_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.soc_alert_responses;
