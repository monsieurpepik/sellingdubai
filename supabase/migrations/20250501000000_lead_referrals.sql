-- 20250501000000_lead_referrals.sql
-- Agent-to-agent lead passing. Agent A refers a lead to Agent B.
-- Platform takes 10% of the agreed referral fee on close.

CREATE TABLE IF NOT EXISTS public.lead_referrals (
  id                    BIGSERIAL   PRIMARY KEY,
  referrer_id           UUID        NOT NULL REFERENCES public.agents (id) ON DELETE CASCADE,
  receiver_id           UUID        NOT NULL REFERENCES public.agents (id) ON DELETE CASCADE,

  -- Lead contact details
  lead_name             TEXT        NOT NULL,
  lead_phone            TEXT,
  lead_email            TEXT,
  lead_budget_range     TEXT,
  lead_property_type    TEXT,
  lead_preferred_area   TEXT,
  lead_notes            TEXT,

  -- Fee split agreed at time of referral
  referral_fee_percent  NUMERIC     NOT NULL DEFAULT 25
                          CHECK (referral_fee_percent >= 5 AND referral_fee_percent <= 50),
  platform_fee_percent  NUMERIC     NOT NULL DEFAULT 10,

  -- State machine: pending → accepted/declined, accepted → in_progress/close_won/close_lost
  status                TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','accepted','declined','in_progress','close_won','close_lost')),

  -- Lifecycle timestamps
  accepted_at           TIMESTAMPTZ,
  declined_at           TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Financials — populated on close_won
  deal_value_aed        NUMERIC,
  commission_aed        NUMERIC,
  referral_fee_aed      NUMERIC,
  platform_fee_aed      NUMERIC
);

ALTER TABLE public.lead_referrals ENABLE ROW LEVEL SECURITY;
-- No anon policies. Written by refer-lead, managed by manage-referral (service_role).

CREATE INDEX IF NOT EXISTS idx_lead_referrals_referrer
  ON public.lead_referrals (referrer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_referrals_receiver
  ON public.lead_referrals (receiver_id, created_at DESC);

-- Dedup: prevent same lead (by phone) being referred to same receiver within 7 days
CREATE INDEX IF NOT EXISTS idx_lead_referrals_dedup
  ON public.lead_referrals (referrer_id, receiver_id, lead_phone, created_at DESC)
  WHERE lead_phone IS NOT NULL;

COMMENT ON TABLE public.lead_referrals IS 'Agent-to-agent lead passing. Platform fee 10%. No RLS anon policies. Service_role only via refer-lead and manage-referral.';
