-- 20240301000000_magic_links_auth.sql
-- Source: sql/002_magic_links_table.sql
-- Magic link session tokens + agent profile extension columns.

CREATE TABLE IF NOT EXISTS public.magic_links (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   UUID        NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  token      TEXT        UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.magic_links IS 'Passwordless session tokens. used_at marks session activation; revoked_at marks forced logout.';
COMMENT ON COLUMN public.magic_links.token IS 'Opaque token sent in magic link email. Used as Bearer token for dashboard API calls.';

ALTER TABLE public.magic_links ENABLE ROW LEVEL SECURITY;
-- No anon policies — all access via service_role only.

-- ─── Agent profile extension columns ─────────────────────────────────────────
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS calendly_url          TEXT,
  ADD COLUMN IF NOT EXISTS webhook_url           TEXT,
  ADD COLUMN IF NOT EXISTS background_image_url  TEXT,
  ADD COLUMN IF NOT EXISTS custom_link_1_label   TEXT,
  ADD COLUMN IF NOT EXISTS custom_link_1_url     TEXT,
  ADD COLUMN IF NOT EXISTS custom_link_2_label   TEXT,
  ADD COLUMN IF NOT EXISTS custom_link_2_url     TEXT,
  ADD COLUMN IF NOT EXISTS bayut_profile         TEXT,
  ADD COLUMN IF NOT EXISTS rera_brn              TEXT,
  ADD COLUMN IF NOT EXISTS agency_name           TEXT,
  ADD COLUMN IF NOT EXISTS agency_logo_url       TEXT,
  ADD COLUMN IF NOT EXISTS facebook_pixel_id     TEXT,
  ADD COLUMN IF NOT EXISTS facebook_capi_token   TEXT,
  ADD COLUMN IF NOT EXISTS ga4_measurement_id    TEXT;
