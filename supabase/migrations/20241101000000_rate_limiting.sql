-- 20241101000000_rate_limiting.sql
-- Source: sql/010_ip_hash_rate_limiting.sql
-- IP-based rate limiting on the two highest-volume public write tables.

ALTER TABLE public.project_leads
  ADD COLUMN IF NOT EXISTS ip_hash TEXT;

ALTER TABLE public.mortgage_applications
  ADD COLUMN IF NOT EXISTS ip_hash TEXT;

-- project_leads: fast rate-limit lookups by ip+time, and dedup by phone
CREATE INDEX IF NOT EXISTS idx_project_leads_ip_time
  ON public.project_leads (ip_hash, created_at)
  WHERE ip_hash IS NOT NULL;

-- mortgage_applications: fast rate-limit lookups
CREATE INDEX IF NOT EXISTS idx_mortgage_applications_ip_time
  ON public.mortgage_applications (ip_hash, created_at)
  WHERE ip_hash IS NOT NULL;
