-- 20250401000000_referrals.sql
-- Agent-signup referral tracking. One row per referred agent signup.
-- Distinct from lead_referrals (lead passing between agents).

CREATE TABLE IF NOT EXISTS public.referrals (
  id             BIGSERIAL   PRIMARY KEY,
  referrer_id    UUID        NOT NULL REFERENCES public.agents (id) ON DELETE CASCADE,
  referred_id    UUID        NOT NULL REFERENCES public.agents (id) ON DELETE CASCADE,
  referral_code  TEXT        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'verified', 'rewarded')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (referrer_id, referred_id)
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
-- No anon policies. Written by track-referral, read by get-analytics (service_role).

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id
  ON public.referrals (referrer_id);

CREATE INDEX IF NOT EXISTS idx_referrals_referred_id
  ON public.referrals (referred_id);

CREATE INDEX IF NOT EXISTS idx_referrals_code
  ON public.referrals (referral_code);

COMMENT ON TABLE public.referrals IS 'Agent-signup referral records. No RLS anon policies. Service_role only via track-referral.';
