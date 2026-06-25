-- Operation: Dark Harbour v2 — Full rebuild schema
-- Run in Supabase SQL Editor → New query
-- Safe to re-run (uses IF NOT EXISTS / IF EXISTS)

-- ── Drop old tables if re-running ───────────────────────────────────────────
DROP TABLE IF EXISTS public.soc_submissions  CASCADE;
DROP TABLE IF EXISTS public.soc_teams        CASCADE;

-- ── Teams ────────────────────────────────────────────────────────────────────
CREATE TABLE public.soc_teams (
  id         uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text    NOT NULL UNIQUE,
  pin        text    NOT NULL CHECK (pin ~ '^\d{4}$'),
  created_at timestamptz DEFAULT now()
);

-- ── Members ──────────────────────────────────────────────────────────────────
CREATE TABLE public.soc_members (
  id         uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id    uuid    NOT NULL REFERENCES public.soc_teams(id) ON DELETE CASCADE,
  name       text    NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (team_id, name)
);

-- ── Task Progress (one row per team+task) ─────────────────────────────────
CREATE TABLE public.soc_task_progress (
  id           uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id      uuid    NOT NULL REFERENCES public.soc_teams(id) ON DELETE CASCADE,
  task_id      text    NOT NULL,
  member_id    uuid    REFERENCES public.soc_members(id) ON DELETE SET NULL,
  member_name  text,
  status       text    NOT NULL DEFAULT 'available'
                       CHECK (status IN ('available','in_progress','completed')),
  ans