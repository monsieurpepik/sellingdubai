-- 20240601000000_off_plan_inventory.sql
-- Source: sql/005_off_plan_inventory.sql
-- Off-plan developer and project catalogue synced from REM API.

-- ─── developers ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.developers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT        UNIQUE NOT NULL,
  name        TEXT        NOT NULL,
  logo_url    TEXT,
  website     TEXT,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.developers ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "developers_anon_select"
  ON public.developers FOR SELECT TO anon USING (true);

DROP TRIGGER IF EXISTS set_developers_updated_at ON public.developers;
CREATE TRIGGER set_developers_updated_at
  BEFORE UPDATE ON public.developers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── projects ────────────────────────────────────────────────────────────────
-- Additional columns added via: sql/009, sql/014
CREATE TABLE IF NOT EXISTS public.projects (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rem_id              TEXT        UNIQUE NOT NULL,
  slug                TEXT        UNIQUE NOT NULL,
  name                TEXT        NOT NULL,
  developer_id        UUID        REFERENCES public.developers(id) ON DELETE SET NULL,
  description         TEXT,
  location            TEXT,
  area                TEXT,
  cover_image_url     TEXT,
  min_price           NUMERIC,
  max_price           NUMERIC,
  completion_date     DATE,
  payment_plan        JSONB,
  handover_percentage NUMERIC,
  status              TEXT        NOT NULL DEFAULT 'available'
                        CHECK (status IN ('available','sold_out','completed')),
  synced_at           TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "projects_anon_select"
  ON public.projects FOR SELECT TO anon USING (true);

DROP TRIGGER IF EXISTS set_projects_updated_at ON public.projects;
CREATE TRIGGER set_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── project_units ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_units (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rem_id         TEXT        UNIQUE NOT NULL,
  project_id     UUID        REFERENCES public.projects(id) ON DELETE CASCADE,
  unit_number    TEXT,
  unit_type      TEXT,
  bedrooms       INTEGER,
  bathrooms      INTEGER,
  floor          INTEGER,
  areas          JSONB,
  price          NUMERIC,
  floor_plan_url TEXT,
  view           TEXT,
  furnished      TEXT,
  status         TEXT        NOT NULL DEFAULT 'available'
                   CHECK (status IN ('available','reserved','sold')),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.project_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "project_units_anon_select"
  ON public.project_units FOR SELECT TO anon USING (true);

DROP TRIGGER IF EXISTS set_project_units_updated_at ON public.project_units;
CREATE TRIGGER set_project_units_updated_at
  BEFORE UPDATE ON public.project_units
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
