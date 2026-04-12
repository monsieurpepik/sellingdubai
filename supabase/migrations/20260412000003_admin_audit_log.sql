-- Audit trail for all admin actions performed via the admin panel.
-- Every mutation is recorded with action type, target agent, and hashed admin identity.
-- The admin_token_hash stores SHA-256(ADMIN_TOKEN) — never the raw token.

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  action          TEXT        NOT NULL,
  target_agent_id UUID        REFERENCES agents(id) ON DELETE SET NULL,
  admin_token_hash TEXT       NOT NULL,
  details         JSONB       DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_action_idx ON admin_audit_log (action);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- No public policies: only service role (admin-action) can read/write.
