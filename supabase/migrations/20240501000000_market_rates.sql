-- 20240501000000_market_rates.sql
-- Source: sql/004_market_rates.sql
-- EIBOR and other benchmark rate tracker (distinct from mortgage_rates bank cards).

CREATE TABLE IF NOT EXISTS public.market_rates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_type   TEXT        UNIQUE NOT NULL,
  rate_value  NUMERIC(6,4) NOT NULL,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  source      TEXT
);

COMMENT ON TABLE  public.market_rates IS 'Benchmark rates (EIBOR etc.) fetched by fetch-eibor edge function. RLS: anon SELECT.';
COMMENT ON COLUMN public.market_rates.rate_type IS 'E.g. "eibor_1m", "eibor_3m". UNIQUE — upserted on each fetch.';

ALTER TABLE public.market_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "market_rates_anon_select"
  ON public.market_rates FOR SELECT TO anon
  USING (true);
