-- supabase/migrations/20260415000003_rami_daily_digest_cron.sql
-- pg_cron schedule for Rami daily cold-lead digest.
-- Runs every morning at 05:00 UTC (09:00 Dubai/UTC+4).

SELECT cron.schedule(
  'rami-daily-digest',
  '0 5 * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/rami-daily-digest',
      headers := '{"Authorization": "Bearer ' || current_setting('app.service_role_key') || '", "Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);
