-- 20240801000000_billing.sql
-- Source: sql/007_stripe_billing.sql
-- Stripe subscription state denormalized onto agents table.

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS stripe_customer_id           TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id       TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_status   TEXT,
  ADD COLUMN IF NOT EXISTS stripe_plan                  TEXT,
  ADD COLUMN IF NOT EXISTS stripe_current_period_end    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_agents_stripe_customer
  ON public.agents (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agents_stripe_subscription
  ON public.agents (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
