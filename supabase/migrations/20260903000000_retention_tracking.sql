-- 20260903000000_retention_tracking.sql
-- Adds fields for measuring agent retention and activity.

-- last_active_at: updated on every dashboard login (verify-magic-link).
-- Used to compute 7-day, 30-day, and 90-day retention cohorts.
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- created_at index for cohort analysis (monthly signup cohorts)
CREATE INDEX IF NOT EXISTS idx_agents_created_at
  ON public.agents (created_at);

-- last_active_at index for retention queries
CREATE INDEX IF NOT EXISTS idx_agents_last_active_at
  ON public.agents (last_active_at)
  WHERE last_active_at IS NOT NULL;
