-- Add ip_hash columns to support rate limiting in capture-project-lead and submit-mortgage
-- Run this migration before deploying the updated edge functions.

ALTER TABLE project_leads
  ADD COLUMN IF NOT EXISTS ip_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_project_leads_ip_hash_created_at
  ON project_leads (ip_hash, created_at);

ALTER TABLE mortgage_applications
  ADD COLUMN IF NOT EXISTS ip_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_mortgage_applications_ip_hash_created_at
  ON mortgage_applications (ip_hash, created_at);
