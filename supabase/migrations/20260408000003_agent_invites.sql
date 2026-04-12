-- Migration: agent_invites table for agency invitation flow
-- Agents (acting as agencies) can generate invite tokens; the join page
-- verifies the token anonymously before prompting the new agent to sign up.

CREATE TABLE IF NOT EXISTS agent_invites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  token         TEXT NOT NULL UNIQUE,
  invited_email TEXT,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_invites_token ON agent_invites(token);
CREATE INDEX IF NOT EXISTS idx_agent_invites_agency ON agent_invites(agency_id);

-- RLS: enable row-level security
ALTER TABLE agent_invites ENABLE ROW LEVEL SECURITY;

-- Allow anonymous (unauthenticated) users to SELECT unused invite tokens so
-- the join page can verify a token without requiring the visitor to be signed in.
-- All mutations (INSERT / UPDATE / DELETE) are handled exclusively by edge
-- functions running under the service role and therefore bypass RLS entirely.
CREATE POLICY "anon can read unused invites"
  ON agent_invites
  FOR SELECT
  TO anon
  USING (used_at IS NULL);
