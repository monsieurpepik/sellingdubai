-- ============================================================
-- OFF-PLAN INVENTORY TABLES — Run in Supabase SQL Editor
-- ============================================================
-- Tables: developers, projects, project_units
-- Synced from REM CRM API via service_role edge function.
-- ============================================================

-- ── DEVELOPERS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.developers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  logo_url     TEXT,
  website      TEXT,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_developers_slug
  ON public.developers (slug);

ALTER TABLE public.developers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_developers" ON public.developers
  FOR SELECT TO anon USING (true);

CREATE OR REPLACE FUNCTION public.set_developers_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS developers_set_updated_at ON public.developers;
CREATE TRIGGER developers_set_updated_at
  BEFORE UPDATE ON public.developers
  FOR EACH ROW EXECUTE FUNCTION public.set_developers_updated_at();


-- ── PROJECTS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rem_id               TEXT UNIQUE,
  slug                 TEXT NOT NULL UNIQUE,
  name                 TEXT NOT NULL,
  developer_id         UUID REFERENCES public.developers(id) ON DELETE SET NULL,
  description          TEXT,
  location             TEXT,
  area                 TEXT,
  cover_image_url      TEXT,
  min_price            NUMERIC(14,2),
  max_price            NUMERIC(14,2),
  completion_date      DATE,
  payment_plan         JSONB,
  handover_percentage  NUMERIC(5,2),
  status               TEXT NOT NULL DEFAULT 'off_plan'
                       CHECK (status IN ('off_plan','under_construction','completed','sold_out')),
  synced_at            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_slug
  ON public.projects (slug);

CREATE INDEX IF NOT EXISTS idx_projects_rem_id
  ON public.projects (rem_id)
  WHERE rem_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_developer_id
  ON public.projects (developer_id)
  WHERE developer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_status
  ON public.projects (status);

CREATE INDEX IF NOT EXISTS idx_projects_area
  ON public.projects (area)
  WHERE area IS NOT NULL;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_projects" ON public.projects
  FOR SELECT TO anon USING (true);

CREATE OR REPLACE FUNCTION public.set_projects_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS projects_set_updated_at ON public.projects;
CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_projects_updated_at();


-- ── PROJECT UNITS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_units (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rem_id          TEXT NOT NULL UNIQUE,
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  unit_number     TEXT,
  unit_type       TEXT,
  bedrooms        SMALLINT,
  bathrooms       SMALLINT,
  floor_number    SMALLINT,
  area_sqft       NUMERIC(10,2),
  area_sqm        NUMERIC(10,2),
  price           NUMERIC(14,2),
  floor_plan_url  TEXT,
  view            TEXT,
  furnished       TEXT,
  status          TEXT NOT NULL DEFAULT 'available'
                  CHECK (status IN ('available','reserved','sold')),
  synced_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_units_rem_id
  ON public.project_units (rem_id);

CREATE INDEX IF NOT EXISTS idx_project_units_project_id
  ON public.project_units (project_id);

CREATE INDEX IF NOT EXISTS idx_project_units_status
  ON public.project_units (status);

CREATE INDEX IF NOT EXISTS idx_project_units_project_status
  ON public.project_units (project_id, status);

ALTER TABLE public.project_units ENABLE ROW LEVEL SECURITY;

-- All statuses publicly visible (available + reserved + sold for "X% sold" signal)
CREATE POLICY "anon_read_project_units" ON public.project_units
  FOR SELECT TO anon USING (true);

CREATE OR REPLACE FUNCTION public.set_project_units_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS project_units_set_updated_at ON public.project_units;
CREATE TRIGGER project_units_set_updated_at
  BEFORE UPDATE ON public.project_units
  FOR EACH ROW EXECUTE FUNCTION public.set_project_units_updated_at();


SELECT 'off_plan_inventory migration complete' AS result;
