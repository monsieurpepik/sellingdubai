-- 20240101000000_base_schema.sql
-- Foundation tables that predated the tracked sql/ migration history.
-- Reconstructed from edge function source + sql/ ALTER TABLE references.
-- Tables without a corresponding sql/ CREATE were inferred from code usage.

-- ─── agents ──────────────────────────────────────────────────────────────────
-- Core profile table. Additional columns added via later migrations.
CREATE TABLE IF NOT EXISTS public.agents (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT        NOT NULL,
  slug                 TEXT        UNIQUE NOT NULL,
  email                TEXT        UNIQUE NOT NULL,
  whatsapp             TEXT,
  tagline              TEXT,
  photo_url            TEXT,
  license_image_url    TEXT,
  is_active            BOOLEAN     NOT NULL DEFAULT false,
  verification_status  TEXT        NOT NULL DEFAULT 'pending'
                         CHECK (verification_status IN ('pending','verified','rejected')),
  verified_at          TIMESTAMPTZ,
  email_verified       BOOLEAN     NOT NULL DEFAULT false,
  license_verified     BOOLEAN     NOT NULL DEFAULT false,
  dld_verified         BOOLEAN     NOT NULL DEFAULT false,
  dld_total_deals      INTEGER     NOT NULL DEFAULT 0,
  broker_number        TEXT,
  dld_broker_number    TEXT,
  dld_broker_id        TEXT,
  referral_code        TEXT        UNIQUE,
  instagram_url        TEXT,
  youtube_url          TEXT,
  tiktok_url           TEXT,
  linkedin_url         TEXT,
  tier                 TEXT        NOT NULL DEFAULT 'free' CHECK (tier IN ('free','premium')),
  subscription_status  TEXT        NOT NULL DEFAULT 'inactive',
  bonus_listings       INTEGER     NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.agents IS 'RERA-verified real estate agents. Core profile table.';
COMMENT ON COLUMN public.agents.slug IS 'URL-safe unique identifier — used in profile URLs.';
COMMENT ON COLUMN public.agents.verification_status IS 'verified = passed DLD/BRN check and admin approval.';
COMMENT ON COLUMN public.agents.bonus_listings IS 'Extra featured listing slots earned via co-broke deals and referrals.';

-- ─── properties ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.properties (
  id                       UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id                 UUID     REFERENCES public.agents(id) ON DELETE SET NULL,
  title                    TEXT     NOT NULL,
  location                 TEXT,
  price                    TEXT,
  price_numeric            NUMERIC,
  property_type            TEXT,
  bedrooms                 TEXT,
  area_sqft                NUMERIC,
  image_url                TEXT,
  is_active                BOOLEAN  NOT NULL DEFAULT true,
  open_for_cobroke         BOOLEAN  NOT NULL DEFAULT false,
  cobroke_commission_split INTEGER  NOT NULL DEFAULT 50
                             CHECK (cobroke_commission_split BETWEEN 1 AND 99),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.properties IS 'Listings managed by agents. open_for_cobroke enables co-broke network.';
COMMENT ON COLUMN public.properties.price IS 'Display string (e.g. "AED 2.5M").';
COMMENT ON COLUMN public.properties.price_numeric IS 'Numeric value for range queries and matching engine.';
COMMENT ON COLUMN public.properties.cobroke_commission_split IS 'Percentage of commission that goes to the buying agent (1–99).';

-- ─── leads ───────────────────────────────────────────────────────────────────
-- Buyer enquiries captured via agent profile pages.
-- Additional columns (followup_nagged_at, ip_hash, updated_at) added in later migrations.
CREATE TABLE IF NOT EXISTS public.leads (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID        REFERENCES public.agents(id) ON DELETE SET NULL,
  name            TEXT,
  phone           TEXT,
  email           TEXT,
  budget_range    TEXT,
  property_type   TEXT,
  preferred_area  TEXT,
  message         TEXT,
  source          TEXT        DEFAULT 'profile_page',
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  device_type     TEXT,
  status          TEXT        NOT NULL DEFAULT 'new',
  agent_notified_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.leads IS 'Buyer enquiries from agent profile pages. RLS: no anon access — service_role only.';

-- ─── events ──────────────────────────────────────────────────────────────────
-- Generic structured event log (server-side).
CREATE TABLE IF NOT EXISTS public.events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID        REFERENCES public.agents(id) ON DELETE SET NULL,
  event_type  TEXT        NOT NULL,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.events IS 'Server-side structured event log. RLS: no anon access.';

-- ─── page_events ─────────────────────────────────────────────────────────────
-- Client-side interaction events on agent profile pages, written via log-event edge function.
CREATE TABLE IF NOT EXISTS public.page_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID        REFERENCES public.agents(id) ON DELETE SET NULL,
  event_type  TEXT        NOT NULL
                CHECK (event_type IN (
                  'view','whatsapp_tap','lead_submit','link_click',
                  'phone_tap','share','mortgage_calc_open',
                  'mortgage_eligibility_check','mortgage_application_submitted',
                  'mortgage_doc_uploaded'
                )),
  metadata    JSONB       NOT NULL DEFAULT '{}',
  referrer    TEXT,
  user_agent  TEXT,
  ip_hash     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.page_events IS 'Profile page interaction events logged via log-event function. RLS: no anon access.';
COMMENT ON COLUMN public.page_events.ip_hash IS 'SHA-256(ip + salt) for rate limiting. Not reversible.';

-- ─── mortgage_applications ───────────────────────────────────────────────────
-- Buyer mortgage enquiries. edit_token allows doc upload without anon RLS.
-- ip_hash column added via later migration (sql/010).
CREATE TABLE IF NOT EXISTS public.mortgage_applications (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  edit_token            TEXT        UNIQUE NOT NULL,
  buyer_name            TEXT        NOT NULL,
  buyer_phone           TEXT,
  buyer_email           TEXT,
  monthly_income        NUMERIC,
  employment_type       TEXT
    CHECK (employment_type IN ('salaried','self_employed','business_owner')),
  residency_status      TEXT
    CHECK (residency_status IN ('uae_national','uae_resident','non_resident')),
  existing_debt_monthly NUMERIC     NOT NULL DEFAULT 0,
  property_value        NUMERIC,
  property_id           TEXT,
  property_title        TEXT,
  down_payment_pct      NUMERIC,
  preferred_term_years  INTEGER,
  preferred_rate_type   TEXT,
  max_loan_amount       NUMERIC,
  estimated_monthly     NUMERIC,
  agent_id              UUID        REFERENCES public.agents(id) ON DELETE SET NULL,
  agent_slug            TEXT,
  assigned_bank         TEXT,
  source                TEXT        DEFAULT 'profile_page',
  status                TEXT        NOT NULL DEFAULT 'new',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.mortgage_applications IS 'Buyer mortgage enquiries. RLS: anon INSERT only; updates go through update-mortgage-docs edge function.';
COMMENT ON COLUMN public.mortgage_applications.edit_token IS 'Single-session token generated by submit-mortgage. Allows the originating client to attach docs without a permissive RLS policy.';

-- ─── project_leads ───────────────────────────────────────────────────────────
-- Buyer enquiries on off-plan projects via capture-project-lead.
-- ip_hash column added via later migration (sql/010).
CREATE TABLE IF NOT EXISTS public.project_leads (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID,
  agent_id            UUID        REFERENCES public.agents(id) ON DELETE SET NULL,
  name                TEXT        NOT NULL,
  phone               TEXT,
  email               TEXT,
  budget_range        TEXT,
  preferred_bedrooms  TEXT,
  message             TEXT,
  nationality         TEXT,
  source              TEXT        DEFAULT 'agent_profile',
  utm_source          TEXT,
  utm_medium          TEXT,
  utm_campaign        TEXT,
  device_type         TEXT,
  platform_fee_earned NUMERIC     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.project_leads IS 'Off-plan project buyer enquiries. platform_fee_earned records revenue at time of capture.';

-- ─── mortgage_rates ──────────────────────────────────────────────────────────
-- Bank mortgage rate cards. Separate from market_rates (EIBOR tracker).
CREATE TABLE IF NOT EXISTS public.mortgage_rates (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name         TEXT        NOT NULL,
  rate_type         TEXT        NOT NULL,
  rate_pct          NUMERIC(6,4) NOT NULL,
  loan_amount_min   NUMERIC,
  loan_amount_max   NUMERIC,
  term_years_min    INTEGER,
  term_years_max    INTEGER,
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  valid_from        DATE,
  valid_to          DATE,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mortgage_rates IS 'Bank mortgage rate cards shown in the mortgage calculator. RLS: anon SELECT WHERE is_active.';

-- Enable RLS (policies added in 20250101000000_rls_policies.sql)
ALTER TABLE public.agents              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mortgage_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_leads       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mortgage_rates      ENABLE ROW LEVEL SECURITY;
