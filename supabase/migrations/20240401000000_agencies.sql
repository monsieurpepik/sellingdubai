-- 20240401000000_agencies.sql
-- Source: sql/003_agencies.sql
-- Agency entities with circular FK resolved by creation order.

CREATE TABLE IF NOT EXISTS public.agencies (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           TEXT        UNIQUE NOT NULL,
  name           TEXT        NOT NULL,
  logo_url       TEXT,
  website        TEXT,
  description    TEXT,
  owner_agent_id UUID        NOT NULL REFERENCES public.agents(id) ON DELETE RESTRICT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agencies IS 'Agency entities that agents can belong to. owner_agent_id is the founding agent.';

ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "agencies_anon_select"
  ON public.agencies FOR SELECT TO anon
  USING (true);

-- Back-reference: agents belong to an agency
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES public.agencies(id) ON DELETE SET NULL;

-- updated_at trigger for agencies
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_agencies_updated_at ON public.agencies;
CREATE TRIGGER set_agencies_updated_at
  BEFORE UPDATE ON public.agencies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
