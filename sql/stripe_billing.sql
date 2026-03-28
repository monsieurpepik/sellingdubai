-- Stripe billing columns for agents table
-- Run once against your Supabase project

ALTER TABLE agents
  ADD COLUMN stripe_customer_id         TEXT,
  ADD COLUMN stripe_subscription_id     TEXT,
  ADD COLUMN stripe_subscription_status TEXT,   -- active | past_due | canceled | incomplete | trialing
  ADD COLUMN stripe_plan                TEXT,    -- pro_monthly | pro_yearly | premium_monthly | premium_yearly
  ADD COLUMN stripe_current_period_end  TIMESTAMPTZ;

CREATE INDEX idx_agents_stripe_customer_id      ON agents (stripe_customer_id);
CREATE INDEX idx_agents_stripe_subscription_id  ON agents (stripe_subscription_id);
