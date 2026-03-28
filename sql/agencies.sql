-- ============================================================
-- AGENCIES TABLE + AGENTS FK
-- ============================================================

-- 1. Create agencies table
CREATE TABLE IF NOT EXISTS public.agencies (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  logo_url         TEXT,
  website          TEXT,
  description      TEXT,
  owner_agent_id   UUID NOT NULL REFERENCES public.agents(id) ON DELETE RESTRICT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Add agency_id FK to agents table
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS agency_id UUID
    REFERENCES public.agencies(id) ON DELETE SET NULL;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_agencies_slug
  ON public.agencies (slug);

CREATE INDEX IF NOT EXISTS idx_agencies_owner
  ON public.agencies (owner_agent_id);

CREATE INDEX IF NOT EXISTS idx_agents_agency_id
  ON public.agents (agency_id)
  WHERE agency_id IS NOT NULL;

-- 4. RLS
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_agencies" ON public.agencies;
CREATE POLICY "anon_read_agencies" ON public.agencies
  FOR SELECT TO anon USING (true);

-- 5. updated_at trigger
CREATE OR REPLACE FUNCTION public.set_agencies_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agencies_set_updated_at ON public.agencies;
CREATE TRIGGER agencies_set_updated_at
  BEFORE UPDATE ON public.agencies
  FOR EACH ROW EXECUTE FUNCTION public.set_agencies_updated_at();
