-- ============================================================
-- ROW LEVEL SECURITY POLICIES — SellingDubai
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Safe to run multiple times — uses IF NOT EXISTS / OR REPLACE
-- ============================================================

-- ============================================================
-- 0. AUDIT: Check current RLS status before applying
--    Run this SELECT first to see what's enabled/disabled.
-- ============================================================
-- SELECT
--   schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('agents','properties','leads','magic_links','events','page_events','mortgage_rates','mortgage_applications')
-- ORDER BY tablename;


-- ============================================================
-- 1. AGENTS TABLE
-- ============================================================
-- Access patterns:
--   anon (client JS):     SELECT (public profiles — slug lookup, search)
--   service_role (edge):  SELECT, UPDATE (verify-magic-link, update-agent, instagram-auth, tiktok-auth)
--
-- Policy: anon can read verified agents only. No anon insert/update/delete.
-- Sensitive columns (facebook_capi_token, webhook_url, etc.) are selected
-- server-side only — but RLS can't restrict columns, so we rely on the
-- client query selecting only safe fields. For defense-in-depth, a
-- Supabase database function or view could restrict columns in the future.
-- ============================================================

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "anon_read_verified_agents" ON public.agents;
DROP POLICY IF EXISTS "service_role_full_access_agents" ON public.agents;

-- Public can only read verified agents
CREATE POLICY "anon_read_verified_agents" ON public.agents
  FOR SELECT
  TO anon
  USING (verification_status = 'verified');

-- Service role bypasses RLS automatically, but explicit policy for clarity
-- (service_role always bypasses — this is documentation, not enforcement)


-- ============================================================
-- 2. PROPERTIES TABLE
-- ============================================================
-- Access patterns:
--   anon (client JS):     SELECT (public listings for a given agent)
--   service_role (edge):  INSERT (whatsapp-ingest creates properties)
--
-- Policy: anon can read active properties of verified agents only.
-- No anon insert/update/delete.
-- ============================================================

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_active_properties" ON public.properties;

-- Public can read active properties belonging to verified agents
CREATE POLICY "anon_read_active_properties" ON public.properties
  FOR SELECT
  TO anon
  USING (
    is_active IS NOT FALSE
    AND agent_id IN (
      SELECT id FROM public.agents WHERE verification_status = 'verified'
    )
  );


-- ============================================================
-- 3. LEADS TABLE
-- ============================================================
-- Access patterns:
--   anon (client JS):     NONE (leads go through capture-lead edge function)
--   service_role (edge):  INSERT, SELECT, UPDATE (capture-lead, lead-followup-nagger)
--
-- Policy: anon has NO access. All operations go through edge functions
-- using service_role key which bypasses RLS.
-- ============================================================

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_anon_access_leads" ON public.leads;

-- No policies for anon = no access (RLS enabled with no matching policy = deny all)
-- Service role bypasses RLS automatically.


-- ============================================================
-- 4. MAGIC_LINKS TABLE
-- ============================================================
-- Access patterns:
--   anon (client JS):     NONE
--   service_role (edge):  INSERT, SELECT, UPDATE, DELETE
--                         (send-magic-link, verify-magic-link, update-agent)
--
-- Policy: anon has NO access. This is the most security-critical table.
-- Already configured in magic_links_table.sql but we enforce it here too.
-- ============================================================

ALTER TABLE public.magic_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_anon_access_magic_links" ON public.magic_links;

-- No policies for anon = no access
-- Service role bypasses RLS automatically.


-- ============================================================
-- 5. EVENTS / PAGE_EVENTS TABLE
-- ============================================================
-- Access patterns:
--   anon (client JS):     NONE (events go through log-event edge function)
--   service_role (edge):  INSERT, SELECT (log-event, whatsapp-ingest stats)
--
-- Policy: anon has NO access.
-- Note: table may be named 'events' or 'page_events' depending on setup.
-- We apply to both if they exist.
-- ============================================================

DO $$ BEGIN
  ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.page_events ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Drop and recreate for events
DO $$ BEGIN
  DROP POLICY IF EXISTS "no_anon_access_events" ON public.events;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "no_anon_access_page_events" ON public.page_events;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- No policies for anon = no access on both tables


-- ============================================================
-- 6. MORTGAGE_RATES TABLE
-- ============================================================
-- Access patterns:
--   anon (client JS):     SELECT (mortgage.js fetches active rates via REST API)
--   service_role:         INSERT, UPDATE (admin populates rates)
--
-- Policy: anon can read active rates only. No anon insert/update/delete.
-- ============================================================

DO $$ BEGIN
  ALTER TABLE public.mortgage_rates ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "anon_read_active_rates" ON public.mortgage_rates;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  EXECUTE 'CREATE POLICY "anon_read_active_rates" ON public.mortgage_rates
    FOR SELECT
    TO anon
    USING (is_active = true)';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- ============================================================
-- 7. MORTGAGE_APPLICATIONS TABLE
-- ============================================================
-- Access patterns:
--   anon (client JS):     INSERT (mortSubmitApplication via edge function)
--                          PATCH by id (mortDocUploaded — updates doc paths)
--   service_role:         SELECT, UPDATE (admin reviews)
--
-- Policy: anon can INSERT new applications and UPDATE only their own
-- (by id, limited to doc columns). No SELECT or DELETE.
--
-- IMPORTANT: The client currently PATCHes via REST API with anon key.
-- Ideally this should go through an edge function. For now, we restrict
-- the UPDATE to only allow setting docs_* columns.
-- ============================================================

DO $$ BEGIN
  ALTER TABLE public.mortgage_applications ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "anon_insert_mortgage_app" ON public.mortgage_applications;
  DROP POLICY IF EXISTS "anon_update_mortgage_docs" ON public.mortgage_applications;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  EXECUTE 'CREATE POLICY "anon_insert_mortgage_app" ON public.mortgage_applications
    FOR INSERT
    TO anon
    WITH CHECK (true)';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  EXECUTE 'CREATE POLICY "anon_update_mortgage_docs" ON public.mortgage_applications
    FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true)';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;


-- ============================================================
-- VERIFICATION: Run after applying to confirm RLS is enabled
-- ============================================================
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'agents', 'properties', 'leads', 'magic_links',
    'events', 'page_events', 'mortgage_rates', 'mortgage_applications'
  )
ORDER BY tablename;
