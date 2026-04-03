-- 20250201000000_indexes.sql
-- Source: sql/013_indexes.sql
-- Performance indexes for the most common read patterns.

-- ─── agents ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_agents_slug
  ON public.agents (slug);

CREATE INDEX IF NOT EXISTS idx_agents_verification_status
  ON public.agents (verification_status);

-- Primary public directory query: verified + active agents
CREATE INDEX IF NOT EXISTS idx_agents_slug_verified
  ON public.agents (slug, verification_status)
  WHERE is_active = true;

-- ─── properties ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_properties_agent_id
  ON public.properties (agent_id);

CREATE INDEX IF NOT EXISTS idx_properties_is_active
  ON public.properties (is_active);

-- Dashboard listing sort: active listings by agent, newest first
CREATE INDEX IF NOT EXISTS idx_properties_agent_active_sort
  ON public.properties (agent_id, is_active, created_at DESC);

-- ─── leads ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_agent_id
  ON public.leads (agent_id);

CREATE INDEX IF NOT EXISTS idx_leads_ip_hash
  ON public.leads (ip_hash)
  WHERE ip_hash IS NOT NULL;

-- Phone dedup within an agent's leads
CREATE INDEX IF NOT EXISTS idx_leads_agent_phone
  ON public.leads (agent_id, phone)
  WHERE phone IS NOT NULL;

-- Email dedup within an agent's leads
CREATE INDEX IF NOT EXISTS idx_leads_agent_email
  ON public.leads (agent_id, email)
  WHERE email IS NOT NULL;

-- Follow-up nagger query
CREATE INDEX IF NOT EXISTS idx_leads_followup
  ON public.leads (agent_notified_at, followup_nagged_at)
  WHERE followup_nagged_at IS NULL;

-- ─── events ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_events_agent_id
  ON public.events (agent_id);

CREATE INDEX IF NOT EXISTS idx_events_type_created
  ON public.events (agent_id, event_type, created_at DESC);

-- ─── page_events ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_page_events_agent_id
  ON public.page_events (agent_id);

CREATE INDEX IF NOT EXISTS idx_page_events_type_created
  ON public.page_events (agent_id, event_type, created_at DESC);

-- ─── magic_links ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_magic_links_token
  ON public.magic_links (token);

-- All active tokens by agent (session list)
CREATE INDEX IF NOT EXISTS idx_magic_links_agent_created
  ON public.magic_links (agent_id, created_at DESC)
  WHERE revoked_at IS NULL;

-- ─── mortgage_rates ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mortgage_rates_active
  ON public.mortgage_rates (is_active, rate_pct)
  WHERE is_active = true;
