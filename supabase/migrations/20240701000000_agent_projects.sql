-- 20240701000000_agent_projects.sql
-- Source: sql/006_agent_projects.sql
-- Agent association with off-plan projects (approval workflow).

CREATE TABLE IF NOT EXISTS public.agent_projects (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID        NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  project_id  UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status      TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected')),
  approved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, project_id)
);

COMMENT ON TABLE public.agent_projects IS 'Agents request association with off-plan projects. Admin approves. RLS: anon SELECT.';

ALTER TABLE public.agent_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "agent_projects_anon_select"
  ON public.agent_projects FOR SELECT TO anon
  USING (true);
