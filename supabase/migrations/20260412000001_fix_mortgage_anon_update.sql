-- Fix critical RLS vulnerability on mortgage_applications.
-- The previous anon UPDATE policy allowed any unauthenticated user to update
-- any mortgage row. This migration drops that policy and replaces it with an
-- authenticated-only policy scoped to the agent who owns the application.

-- Drop the insecure anon UPDATE policy (name may vary — drop both candidates).
DROP POLICY IF EXISTS "anon can update mortgage applications" ON mortgage_applications;
DROP POLICY IF EXISTS "anon_update_mortgage" ON mortgage_applications;

-- Authenticated agents may only update their own mortgage applications.
DROP POLICY IF EXISTS "agent can update own mortgage applications" ON mortgage_applications;
CREATE POLICY "agent can update own mortgage applications"
  ON mortgage_applications
  FOR UPDATE
  TO authenticated
  USING (agent_id = auth.uid())
  WITH CHECK (agent_id = auth.uid());
