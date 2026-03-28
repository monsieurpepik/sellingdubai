-- ============================================================
-- AGENCIES TABLE + AGENTS FK
-- ============================================================

-- 1. Create agencies table (owner_agent_id FK added below to break circular dependency)
-- Ordering: agencies (no FK) → agents.agency_id FK → agencies.owner_agent_id FK
CREATE TABLE IF NOT EXISTS public.agencies (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  logo_url         TEXT,
  website          TEXT,
  description      TEXT,
  owner_agent_id   UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Add agency_id FK to agents table (agencies must exist first)
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS agency_id UUID
    REFERENCES public.agencies(id) ON DELETE SET NULL;

-- 3a. Now add owner_agent_id FK to agencies (agents must exist first)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agencies_owner_agent_id_fkey'
  ) THEN
    ALTER TABLE public.agencies
      ADD CONSTRAINT agencies_owner_agent_id_fkey
        FOREIGN KEY (owner_agent_id) REFERENCES public.agents(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- 3b. Enforce NOT NULL on owner_agent_id (safe even if already NOT NULL)
ALTER TABLE public.agencies ALTER COLUMN owner_agent_id SET NOT NULL;

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
