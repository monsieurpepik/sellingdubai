-- 20250301000000_email_verification.sql
-- OTP-based email verification for agent onboarding.
-- dld_brokers: DLD registry snapshot synced externally.
-- email_verification_codes: 10-minute OTPs with IP rate limiting.

-- ─── dld_brokers ─────────────────────────────────────────────────────────────
-- Read-only registry loaded by admin/sync job. No anon access.
CREATE TABLE IF NOT EXISTS public.dld_brokers (
  id                  BIGSERIAL PRIMARY KEY,
  broker_number       INTEGER NOT NULL UNIQUE,
  broker_name_en      TEXT    NOT NULL,
  broker_name_ar      TEXT,
  real_estate_number  TEXT,
  license_start_date  DATE,
  license_end_date    DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dld_brokers ENABLE ROW LEVEL SECURITY;
-- No anon policies — all lookups via verify-broker (service_role).

CREATE INDEX IF NOT EXISTS idx_dld_brokers_broker_number
  ON public.dld_brokers (broker_number);

-- ─── email_verification_codes ─────────────────────────────────────────────────
-- Stores 6-digit OTPs for agent email verification during join flow.
-- Rate limits enforced in send-otp edge function (5/email/hr, 15/ip/hr).
-- OTPs expire after 10 minutes (expires_at).
CREATE TABLE IF NOT EXISTS public.email_verification_codes (
  id          BIGSERIAL   PRIMARY KEY,
  email       TEXT        NOT NULL,
  code        TEXT        NOT NULL,
  broker_number INTEGER,
  expires_at  TIMESTAMPTZ NOT NULL,
  verified    BOOLEAN     NOT NULL DEFAULT false,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_verification_codes ENABLE ROW LEVEL SECURITY;
-- No anon policies — written by send-otp, read by create-agent (both service_role).

-- Rate-limit queries: recent codes per email and per IP
CREATE INDEX IF NOT EXISTS idx_evc_email_created
  ON public.email_verification_codes (email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_evc_ip_created
  ON public.email_verification_codes (ip_address, created_at DESC)
  WHERE ip_address IS NOT NULL;

-- Lookup by email+code for verification check
CREATE INDEX IF NOT EXISTS idx_evc_email_code
  ON public.email_verification_codes (email, code)
  WHERE verified = false;

COMMENT ON TABLE public.email_verification_codes IS 'OTP store for agent onboarding. Codes expire in 10 min. Service_role only via send-otp and create-agent.';
COMMENT ON TABLE public.dld_brokers IS 'DLD broker registry snapshot. No RLS anon policies. Lookups via verify-broker (service_role).';
