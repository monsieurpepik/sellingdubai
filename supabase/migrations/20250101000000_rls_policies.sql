-- 20250101000000_rls_policies.sql
-- Source: sql/012_rls_policies.sql
-- Comprehensive RLS audit pass. All tables locked to minimum necessary access.
-- Principle: default deny. Only explicitly grant what frontend or edge functions need.

-- ─── agents ──────────────────────────────────────────────────────────────────
-- Anon can read verified active profiles only (public directory).
-- All writes go through edge functions with service_role.
DROP POLICY IF EXISTS "agents_anon_select" ON public.agents;
CREATE POLICY "agents_anon_select"
  ON public.agents FOR SELECT TO anon
  USING (
    is_active = true
    AND verification_status = 'verified'
  );

-- ─── properties ──────────────────────────────────────────────────────────────
-- Anon can read active listings from verified agents only.
DROP POLICY IF EXISTS "properties_anon_select" ON public.properties;
CREATE POLICY "properties_anon_select"
  ON public.properties FOR SELECT TO anon
  USING (
    is_active = true
    AND agent_id IN (
      SELECT id FROM public.agents
      WHERE is_active = true AND verification_status = 'verified'
    )
  );

-- ─── leads ───────────────────────────────────────────────────────────────────
-- No anon access. Captured via capture-lead-v4 (service_role).
-- agents read their own leads via get-analytics (service_role after magic_link auth).

-- ─── magic_links ─────────────────────────────────────────────────────────────
-- No anon access. All token checks via service_role in edge functions.

-- ─── events ──────────────────────────────────────────────────────────────────
-- No anon access.

-- ─── page_events ─────────────────────────────────────────────────────────────
-- No anon access. Written via log-event (service_role).

-- ─── mortgage_rates ──────────────────────────────────────────────────────────
-- Anon can read active rate cards for calculator UI.
DROP POLICY IF EXISTS "mortgage_rates_anon_select" ON public.mortgage_rates;
CREATE POLICY "mortgage_rates_anon_select"
  ON public.mortgage_rates FOR SELECT TO anon
  USING (is_active = true);

-- ─── mortgage_applications ───────────────────────────────────────────────────
-- Anon can INSERT (submit application form).
-- Anon UPDATE explicitly blocked — updates go through update-mortgage-docs
-- edge function which validates the edit_token server-side.
DROP POLICY IF EXISTS "mortgage_applications_anon_insert" ON public.mortgage_applications;
CREATE POLICY "mortgage_applications_anon_insert"
  ON public.mortgage_applications FOR INSERT TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "mortgage_applications_anon_update_blocked" ON public.mortgage_applications;
CREATE POLICY "mortgage_applications_anon_update_blocked"
  ON public.mortgage_applications FOR UPDATE TO anon
  USING (false);

-- ─── Tables with no anon access — all via service_role ───────────────────────
-- waitlist: has its own explicit INSERT+SELECT policies (see 20240201000000)
-- market_rates: has its own SELECT policy (see 20240501000000)
-- developers/projects/project_units/agent_projects: have their own SELECT policies

COMMENT ON TABLE public.leads IS 'No RLS anon policies. Service_role only. Written by capture-lead-v4.';
COMMENT ON TABLE public.magic_links IS 'No RLS anon policies. Service_role only. All token verification in edge functions.';
COMMENT ON TABLE public.events IS 'No RLS anon policies. Service_role only.';
COMMENT ON TABLE public.page_events IS 'No RLS anon policies. Service_role only. Written by log-event.';
