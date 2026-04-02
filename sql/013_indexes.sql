-- ============================================================
-- DATABASE INDEXES — SellingDubai
-- Run in Supabase SQL Editor
-- Safe to run multiple times (IF NOT EXISTS)
-- ============================================================

-- ============================================================
-- 1. AGENTS
-- ============================================================

-- Primary lookup: every page load does .eq('slug', slug)
CREATE INDEX IF NOT EXISTS idx_agents_slug
  ON public.agents (slug);

-- RLS policy filters on this + search queries
CREATE INDEX IF NOT EXISTS idx_agents_verification_status
  ON public.agents (verification_status);

-- Composite: covers the most common query pattern (verified agent by slug)
CREATE INDEX IF NOT EXISTS idx_agents_slug_verified
  ON public.agents (slug) WHERE verification_status = 'verified';

-- ============================================================
-- 2. PROPERTIES
-- ============================================================

-- Every property load: .eq('agent_id', agentId)
CREATE INDEX IF NOT EXISTS idx_properties_agent_id
  ON public.properties (agent_id);

-- RLS policy filters on is_active
CREATE INDEX IF NOT EXISTS idx_properties_active
  ON public.properties (agent_id, is_active);

-- Sort order used in queries: .order('sort_order').order('created_at')
CREATE INDEX IF NOT EXISTS idx_properties_sort
  ON public.properties (agent_id, sort_order ASC, created_at DESC)
  WHERE is_active IS NOT FALSE;

-- ============================================================
-- 3. LEADS
-- ============================================================

-- Agent's leads: dashboard queries + lead-followup-nagger
CREATE INDEX IF NOT EXISTS idx_leads_agent_id
  ON public.leads (agent_id);

-- Rate limiting: capture-lead checks recent leads by ip_hash
CREATE INDEX IF NOT EXISTS idx_leads_ip_hash_created
  ON public.leads (ip_hash, created_at DESC);

-- Deduplication: capture-lead checks phone/email within 24h
CREATE INDEX IF NOT EXISTS idx_leads_agent_phone_created
  ON public.leads (agent_id, phone, created_at DESC)
  WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_agent_email_created
  ON public.leads (agent_id, email, created_at DESC)
  WHERE email IS NOT NULL;

-- Followup nagger: finds leads without followup in time window
CREATE INDEX IF NOT EXISTS idx_leads_followup
  ON public.leads (created_at DESC)
  WHERE followup_nagged_at IS NULL;

-- ============================================================
-- 4. EVENTS / PAGE_EVENTS
-- ============================================================

-- Analytics queries: events by agent
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_events_agent_id
    ON public.events (agent_id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_events_agent_type_created
    ON public.events (agent_id, event_type, created_at DESC);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- page_events variant (whatsapp-ingest uses this name)
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_page_events_agent_id
    ON public.page_events (agent_id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_page_events_agent_type_created
    ON public.page_events (agent_id, event_type, created_at DESC);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================================
-- 5. MAGIC_LINKS
-- ============================================================
-- Token lookup index already exists from magic_links_table.sql
-- Just verify it's there:
CREATE INDEX IF NOT EXISTS idx_magic_links_token
  ON public.magic_links (token);

CREATE INDEX IF NOT EXISTS idx_magic_links_agent_created
  ON public.magic_links (agent_id, created_at DESC);

-- ============================================================
-- 6. MORTGAGE_RATES (if table exists)
-- ============================================================
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_mortgage_rates_active
    ON public.mortgage_rates (is_active, rate_pct ASC);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================================
-- VERIFY: List all indexes on these tables
-- ============================================================
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('agents', 'properties', 'leads', 'events', 'page_events', 'magic_links', 'mortgage_rates')
ORDER BY tablename, indexname;
