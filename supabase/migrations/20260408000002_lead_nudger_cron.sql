-- 20260408000002_lead_nudger_cron.sql
-- Registers the lead-nudger edge function as a daily cron job using pg_cron + pg_net.
-- Fires at 09:00 UTC (13:00 Dubai GST) every day.

-- Idempotent: unschedule if the job already exists before re-creating it.
DO $$
BEGIN
  PERFORM cron.unschedule('lead-nudger-daily');
EXCEPTION WHEN others THEN NULL;
END;
$$;

SELECT cron.schedule(
  'lead-nudger-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/lead-nudger',
    headers := ('{"Authorization": "Bearer ' || current_setting('app.cron_secret') || '"}')::jsonb,
    body    := '{}'::jsonb
  )
  $$
);
