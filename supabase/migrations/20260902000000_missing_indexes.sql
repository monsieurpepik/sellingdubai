-- 20260902000000_missing_indexes.sql
-- Adds missing indexes identified during YC readiness audit.
-- These columns are used in hot-path queries but had no indexes.

-- agents.email — used by send-magic-link to look up agent by email
CREATE INDEX IF NOT EXISTS idx_agents_email
  ON public.agents (email);

-- agents.stripe_customer_id — used by stripe-webhook to resolve agent from Stripe customer
CREATE INDEX IF NOT EXISTS idx_agents_stripe_customer_id
  ON public.agents (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- magic_links.agent_id — used by send-magic-link to count recent tokens (rate limiting)
CREATE INDEX IF NOT EXISTS idx_magic_links_agent_id
  ON public.magic_links (agent_id);
