-- ============================================================
-- AGENT PROJECTS JUNCTION TABLE
-- ============================================================
-- Links agents to specific REM off-plan projects they want to
-- showcase on their profile. Admin approves each request.
-- Only approved entries show on public profiles.
-- Applied: 2026-03-30
-- ============================================================

CREATE TABLE public.agent_projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(agent_id, project_id)
);

ALTER TABLE public.agent_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agents_read_own" ON public.agent_projects
  FOR SELECT TO anon USING (true);

CREATE INDEX idx_agent_projects_agent_id
  ON public.agent_projects (agent_id);

CREATE INDEX idx_agent_projects_approved
  ON public.agent_projects (agent_id, status)
  WHERE status = 'approved';

SELECT 'agent_projects migration complete' AS result;
