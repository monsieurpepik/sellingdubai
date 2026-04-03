-- 20250601000000_cobroke.sql
-- Co-brokerage deal flow. Buying agent requests to bring buyer to listing agent's property.
-- Also defines increment_bonus_listings() RPC used by cobroke and lead referral closings.

-- ─── increment_bonus_listings RPC ────────────────────────────────────────────
-- Called on deal close to reward agents with a bonus listing credit.
-- Used by manage-cobroke (both agents) and manage-referral (referrer on close_won).
CREATE OR REPLACE FUNCTION public.increment_bonus_listings(agent_uuid UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.agents
  SET bonus_listings = COALESCE(bonus_listings, 0) + 1
  WHERE id = agent_uuid;
$$;

-- ─── co_broke_deals ──────────────────────────────────────────────────────────
-- State machine: requested → accepted/declined
--               accepted  → viewing/close_won/close_lost
--               viewing   → close_won/close_lost
CREATE TABLE IF NOT EXISTS public.co_broke_deals (
  id                          BIGSERIAL   PRIMARY KEY,
  property_id                 UUID        NOT NULL REFERENCES public.properties (id) ON DELETE CASCADE,
  listing_agent_id            UUID        NOT NULL REFERENCES public.agents (id) ON DELETE CASCADE,
  buying_agent_id             UUID        NOT NULL REFERENCES public.agents (id) ON DELETE CASCADE,

  -- Commission split agreed at time of request (must sum ≤ 100)
  listing_agent_split         INTEGER     NOT NULL,
  buying_agent_split          INTEGER     NOT NULL,
  platform_fee_percent        INTEGER     NOT NULL DEFAULT 5,

  -- State machine
  status                      TEXT        NOT NULL DEFAULT 'requested'
                                CHECK (status IN ('requested','accepted','viewing','declined','closed_won','closed_lost')),

  -- Buyer info (only revealed to listing agent after acceptance)
  buyer_name                  TEXT,
  buyer_phone                 TEXT,
  buyer_email                 TEXT,
  buyer_notes                 TEXT,

  -- Lifecycle timestamps
  accepted_at                 TIMESTAMPTZ,
  declined_at                 TIMESTAMPTZ,
  closed_at                   TIMESTAMPTZ,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Financials — populated on close_won
  deal_value_aed              NUMERIC,
  total_commission_aed        NUMERIC,
  listing_agent_commission_aed NUMERIC,
  buying_agent_commission_aed  NUMERIC,
  platform_fee_aed            NUMERIC
);

ALTER TABLE public.co_broke_deals ENABLE ROW LEVEL SECURITY;
-- No anon policies. Written by cobroke-request, managed by manage-cobroke (service_role).

CREATE INDEX IF NOT EXISTS idx_co_broke_deals_listing_agent
  ON public.co_broke_deals (listing_agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_co_broke_deals_buying_agent
  ON public.co_broke_deals (buying_agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_co_broke_deals_property
  ON public.co_broke_deals (property_id);

CREATE INDEX IF NOT EXISTS idx_co_broke_deals_status
  ON public.co_broke_deals (status)
  WHERE status NOT IN ('declined', 'closed_won', 'closed_lost');

-- Agents table: columns used by co-brokerage
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS dld_total_deals    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_listings     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS open_for_cobroke   BOOLEAN NOT NULL DEFAULT false;

-- Properties table: co-brokerage opt-in columns
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS open_for_cobroke         BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cobroke_commission_split  INTEGER;

COMMENT ON TABLE public.co_broke_deals IS 'Co-brokerage deal records. No RLS anon policies. Service_role only via cobroke-request and manage-cobroke.';
COMMENT ON FUNCTION public.increment_bonus_listings IS 'Awards one bonus listing credit to the given agent. Called on deal close (cobroke and lead referral). SECURITY DEFINER.';
