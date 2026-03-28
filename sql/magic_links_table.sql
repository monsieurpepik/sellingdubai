-- ============================================
-- MAGIC LINKS TABLE — Run in Supabase SQL Editor
-- ============================================

-- Table for magic link authentication tokens
CREATE TABLE IF NOT EXISTS public.magic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_magic_links_token ON public.magic_links(token);

-- Index for cleanup of expired tokens
CREATE INDEX IF NOT EXISTS idx_magic_links_expires ON public.magic_links(expires_at);

-- RLS: Only service_role can access (edge functions use service_role key)
ALTER TABLE public.magic_links ENABLE ROW LEVEL SECURITY;

-- No public policies — only service_role bypasses RLS
-- This means the anon key CANNOT read/write magic_links (secure by default)

-- ============================================
-- ADD MISSING COLUMNS TO AGENTS TABLE
-- (Safe to run multiple times — IF NOT EXISTS)
-- ============================================

-- Calendly URL for consultation booking
DO $$ BEGIN
  ALTER TABLE public.agents ADD COLUMN calendly_url TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Webhook URL for CRM integration
DO $$ BEGIN
  ALTER TABLE public.agents ADD COLUMN webhook_url TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Background image URL
DO $$ BEGIN
  ALTER TABLE public.agents ADD COLUMN background_image_url TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Custom links
DO $$ BEGIN
  ALTER TABLE public.agents ADD COLUMN custom_link_1_label TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.agents ADD COLUMN custom_link_1_url TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.agents ADD COLUMN custom_link_2_label TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.agents ADD COLUMN custom_link_2_url TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Bayut profile URL
DO $$ BEGIN
  ALTER TABLE public.agents ADD COLUMN bayut_profile TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- RERA BRN
DO $$ BEGIN
  ALTER TABLE public.agents ADD COLUMN rera_brn TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Agency branding
DO $$ BEGIN
  ALTER TABLE public.agents ADD COLUMN agency_name TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.agents ADD COLUMN agency_logo_url TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Facebook Pixel + Conversion API
DO $$ BEGIN
  ALTER TABLE public.agents ADD COLUMN facebook_pixel_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.agents ADD COLUMN facebook_capi_token TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Google Analytics GA4
DO $$ BEGIN
  ALTER TABLE public.agents ADD COLUMN ga4_measurement_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Premium tier (future gating)
DO $$ BEGIN
  ALTER TABLE public.agents ADD COLUMN tier TEXT DEFAULT 'free';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

SELECT 'Magic links table created + all agent columns verified' AS result;
