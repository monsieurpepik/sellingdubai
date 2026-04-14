-- Contact Timeline: interactions log + smart reminders
-- Migration: 20260412000007_contact_timeline.sql

-- Enum types (DO blocks make these idempotent — safe to re-run on prod)
DO $$ BEGIN
  CREATE TYPE interaction_type AS ENUM (
    'lead_captured',
    'whatsapp_message',
    'mortgage_inquiry',
    'property_view',
    'manual_note',
    'reconnect_sent'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE reminder_type AS ENUM (
    'follow_up',
    'reconnect',
    'anniversary',
    'market_update',
    'refinance_check'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- contact_interactions: immutable log of every touchpoint
CREATE TABLE IF NOT EXISTS contact_interactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  contact_phone TEXT NOT NULL,
  contact_name  TEXT,
  interaction_type interaction_type NOT NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_interactions_agent_phone_idx
  ON contact_interactions (agent_id, contact_phone);

CREATE INDEX IF NOT EXISTS contact_interactions_agent_created_idx
  ON contact_interactions (agent_id, created_at DESC);

ALTER TABLE contact_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_own_interactions" ON contact_interactions;
CREATE POLICY "agent_own_interactions" ON contact_interactions
  FOR ALL USING (agent_id = auth.uid());

-- contact_reminders: scheduled follow-up reminders
CREATE TABLE IF NOT EXISTS contact_reminders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  contact_phone   TEXT NOT NULL,
  contact_name    TEXT,
  reminder_type   reminder_type NOT NULL,
  scheduled_for   TIMESTAMPTZ NOT NULL,
  sent_at         TIMESTAMPTZ,
  dismissed_at    TIMESTAMPTZ,
  message_draft   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_reminders_agent_scheduled_idx
  ON contact_reminders (agent_id, scheduled_for);

CREATE INDEX IF NOT EXISTS contact_reminders_agent_phone_idx
  ON contact_reminders (agent_id, contact_phone);

-- Partial index for fast "due reminders" queries
CREATE INDEX IF NOT EXISTS contact_reminders_due_idx
  ON contact_reminders (agent_id, scheduled_for)
  WHERE sent_at IS NULL AND dismissed_at IS NULL;

ALTER TABLE contact_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_own_reminders" ON contact_reminders;
CREATE POLICY "agent_own_reminders" ON contact_reminders
  FOR ALL USING (agent_id = auth.uid());
