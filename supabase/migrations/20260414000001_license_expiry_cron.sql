-- License Expiry Nightly Cron
-- Migration: 20260414000001_license_expiry_cron.sql
--
-- Runs nightly at 02:00 UTC.
-- Joins agents with dld_brokers on broker_number.
-- For any agent whose RERA license has expired (license_end_date < now()),
-- flips dld_verified = false and verification_status = 'pending'.

-- Enable pg_cron extension (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Enable pg_net extension (required for http calls from pg_cron if needed)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Remove any existing version of this job before (re-)creating it
SELECT cron.unschedule('expire-rera-licenses')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'expire-rera-licenses'
);

-- Schedule the nightly expiry sweep
SELECT cron.schedule(
  'expire-rera-licenses',
  '0 2 * * *',  -- 02:00 UTC daily
  $$
    UPDATE agents a
    SET
      dld_verified        = false,
      license_verified    = false,
      verification_status = 'pending'
    FROM dld_brokers b
    WHERE a.broker_number = b.broker_number::text
      AND b.license_end_date IS NOT NULL
      AND b.license_end_date < now()
      AND (a.dld_verified = true OR a.license_verified = true OR a.verification_status = 'verified');
  $$
);
