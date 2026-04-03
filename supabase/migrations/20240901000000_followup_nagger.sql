-- 20240901000000_followup_nagger.sql
-- Source: sql/008_followup_nagger_column.sql
-- Tracks when a lead received an automated follow-up nudge.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS followup_nagged_at TIMESTAMPTZ;

-- Track agent profile edits
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

DROP TRIGGER IF EXISTS set_agents_updated_at ON public.agents;
CREATE TRIGGER set_agents_updated_at
  BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
