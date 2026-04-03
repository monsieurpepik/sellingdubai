-- 20250801000000_featured_projects.sql
-- Off-plan project lead marketplace. Featured projects + agent assignments + project leads.
-- Platform earns platform_fee_per_lead on each captured lead.

-- ─── featured_projects ───────────────────────────────────────────────────────
-- Curated list of off-plan projects the platform promotes.
CREATE TABLE IF NOT EXISTS public.featured_projects (
  id                    BIGSERIAL   PRIMARY KEY,
  project_slug          TEXT        NOT NULL UNIQUE,
  project_name          TEXT        NOT NULL,
  developer_name        TEXT,
  commission_percent    NUMERIC,
  platform_fee_per_lead NUMERIC     NOT NULL DEFAULT 0,
  status                TEXT        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'inactive')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.featured_projects ENABLE ROW LEVEL SECURITY;
-- No anon policies. Read via capture-project-lead (service_role).

CREATE INDEX IF NOT EXISTS idx_featured_projects_slug
  ON public.featured_projects (project_slug)
  WHERE status = 'active';

-- ─── project_agent_assignments ───────────────────────────────────────────────
-- Tracks which agents are assigned to promote which featured projects,
-- and how many leads they have generated per project.
CREATE TABLE IF NOT EXISTS public.project_agent_assignments (
  id                BIGSERIAL   PRIMARY KEY,
  project_id        BIGINT      NOT NULL REFERENCES public.featured_projects (id) ON DELETE CASCADE,
  agent_id          UUID        NOT NULL REFERENCES public.agents (id) ON DELETE CASCADE,
  leads_generated   INTEGER     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, agent_id)
);

ALTER TABLE public.project_agent_assignments ENABLE ROW LEVEL SECURITY;
-- No anon policies. Read/written via capture-project-lead (service_role).

CREATE INDEX IF NOT EXISTS idx_project_agent_assignments_agent
  ON public.project_agent_assignments (agent_id);

-- ─── project_leads ───────────────────────────────────────────────────────────
-- Leads captured via agent's featured project promotion pages.
-- NOTE: ip_hash column was added in 20241101000000_rate_limiting.sql.
-- This migration creates the base table; ip_hash is applied by that later migration.
CREATE TABLE IF NOT EXISTS public.project_leads (
  id                  BIGSERIAL   PRIMARY KEY,
  project_id          BIGINT      NOT NULL REFERENCES public.featured_projects (id) ON DELETE CASCADE,
  agent_id            UUID        NOT NULL REFERENCES public.agents (id) ON DELETE CASCADE,
  name                TEXT        NOT NULL,
  phone               TEXT,
  email               TEXT,
  budget_range        TEXT,
  preferred_bedrooms  TEXT,
  message             TEXT,
  nationality         TEXT,
  source              TEXT        NOT NULL DEFAULT 'agent_profile',
  utm_source          TEXT,
  utm_medium          TEXT,
  utm_campaign        TEXT,
  device_type         TEXT,
  platform_fee_earned NUMERIC     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.project_leads ENABLE ROW LEVEL SECURITY;
-- No anon policies. Written by capture-project-lead (service_role).

CREATE INDEX IF NOT EXISTS idx_project_leads_agent
  ON public.project_leads (agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_leads_project
  ON public.project_leads (project_id, created_at DESC);

COMMENT ON TABLE public.featured_projects IS 'Curated off-plan projects for lead marketplace. No RLS anon policies. Service_role only.';
COMMENT ON TABLE public.project_agent_assignments IS 'Agent-to-project promotion assignments with lead counts. No RLS anon policies. Service_role only.';
COMMENT ON TABLE public.project_leads IS 'Leads captured via featured project pages. No RLS anon policies. Service_role only.';
