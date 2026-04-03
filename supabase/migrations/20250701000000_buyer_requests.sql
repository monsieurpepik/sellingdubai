-- 20250701000000_buyer_requests.sql
-- Premium Co-Broke Network: buyer requirement matching.
-- buyer_requests: agent posts a buyer's criteria (Premium-gated, max 5 active).
-- property_matches: engine output linking buyer requests to matching listings.

-- ─── buyer_requests ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.buyer_requests (
  id                  BIGSERIAL   PRIMARY KEY,
  agent_id            UUID        NOT NULL REFERENCES public.agents (id) ON DELETE CASCADE,

  -- Search criteria
  property_type       TEXT,
  bedrooms_min        INTEGER,
  bedrooms_max        INTEGER,
  budget_min          NUMERIC,
  budget_max          NUMERIC,
  preferred_areas     TEXT[],
  additional_notes    TEXT,

  -- Buyer PII (private — only owning agent can see)
  buyer_name          TEXT,
  buyer_phone         TEXT,
  buyer_nationality   TEXT,
  buyer_timeline      TEXT,

  -- State machine: active → matched (engine found results)
  status              TEXT        NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'matched')),
  matches_found       INTEGER     NOT NULL DEFAULT 0,
  last_matched_at     TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.buyer_requests ENABLE ROW LEVEL SECURITY;
-- No anon policies. Written by post-buyer-request (service_role).
-- Listing agents notified via email; they never read this table directly.

CREATE INDEX IF NOT EXISTS idx_buyer_requests_agent
  ON public.buyer_requests (agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_buyer_requests_active
  ON public.buyer_requests (agent_id, status)
  WHERE status = 'active';

-- ─── property_matches ────────────────────────────────────────────────────────
-- Matching engine output. One row per (buyer_request, property) pair.
-- NO buyer PII stored here — listing agents see only match metadata.
CREATE TABLE IF NOT EXISTS public.property_matches (
  id                  BIGSERIAL   PRIMARY KEY,
  buyer_request_id    BIGINT      NOT NULL REFERENCES public.buyer_requests (id) ON DELETE CASCADE,
  property_id         UUID        NOT NULL REFERENCES public.properties (id) ON DELETE CASCADE,
  buying_agent_id     UUID        NOT NULL REFERENCES public.agents (id) ON DELETE CASCADE,
  listing_agent_id    UUID        NOT NULL REFERENCES public.agents (id) ON DELETE CASCADE,
  match_score         INTEGER     NOT NULL CHECK (match_score >= 0 AND match_score <= 100),
  status              TEXT        NOT NULL DEFAULT 'notified',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (buyer_request_id, property_id)
);

ALTER TABLE public.property_matches ENABLE ROW LEVEL SECURITY;
-- No anon policies. Written by post-buyer-request, read via respond-to-match (service_role).

CREATE INDEX IF NOT EXISTS idx_property_matches_listing_agent
  ON public.property_matches (listing_agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_property_matches_buying_agent
  ON public.property_matches (buying_agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_property_matches_request
  ON public.property_matches (buyer_request_id);

COMMENT ON TABLE public.buyer_requests IS 'Premium-gated buyer criteria. Max 5 active per agent. No RLS anon policies. Service_role only via post-buyer-request.';
COMMENT ON TABLE public.property_matches IS 'Engine output — no buyer PII. No RLS anon policies. Service_role only.';
