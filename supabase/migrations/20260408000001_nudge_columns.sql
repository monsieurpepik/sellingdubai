-- Nudge tracking columns for lead-nudger cron function
-- Adds nullable TIMESTAMPTZ columns so we can tell when (or if) each nudge was last sent.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS nudge_day1_sent_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nudge_day3_sent_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nudge_day7_sent_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nudge_weekly_sent_at TIMESTAMPTZ;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS idle_nudge_sent_at TIMESTAMPTZ;

-- Index to speed up the nagger's "leads idle > 5 days, no nudge" query
CREATE INDEX IF NOT EXISTS idx_leads_idle_nudge
  ON leads (created_at, idle_nudge_sent_at)
  WHERE idle_nudge_sent_at IS NULL;
