-- Feature flags table for runtime feature toggles.
-- Managed exclusively through the admin-action edge function (service role).
-- No public RLS access — toggled only via admin panel.

CREATE TABLE IF NOT EXISTS feature_flags (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        UNIQUE NOT NULL,
  description TEXT,
  enabled     BOOLEAN     DEFAULT false NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS feature_flags_name_idx ON feature_flags (name);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- No public policies: only service role (admin-action) can read/write.
