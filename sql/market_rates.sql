-- ============================================
-- MARKET RATES TABLE — Run in Supabase SQL Editor
-- ============================================
-- Stores cached market rate data (EIBOR, etc.)
-- One row per rate_type, upserted on refresh.

CREATE TABLE IF NOT EXISTS public.market_rates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_type   TEXT NOT NULL,            -- e.g. '3m_eibor'
  rate_value  NUMERIC(6,4) NOT NULL,    -- e.g. 3.6800
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  source      TEXT DEFAULT 'scrape'     -- 'scrape' | 'stale_cache' | 'fallback'
);

-- One row per rate_type — upserted in place, not append-only
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_rates_type
  ON public.market_rates (rate_type);

-- RLS: anon can SELECT (edge function result is public information)
-- service_role handles INSERT/UPDATE (edge function uses service key)
ALTER TABLE public.market_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read market rates"
  ON public.market_rates FOR SELECT
  TO anon
  USING (true);

SELECT 'market_rates table created' AS result;
