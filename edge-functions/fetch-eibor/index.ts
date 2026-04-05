// ===========================================
// FETCH EIBOR — SellingDubai Mortgage Rates
// ===========================================
// Scrapes 3-month EIBOR from CBUAE website.
// Returns cached value if < 24 hours old.
// Falls back gracefully if scraping fails.
//
// GET /functions/v1/fetch-eibor
// Returns { rate: 3.68, cached: true, fetched_at: "...", source: "scrape" }
// ===========================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from '../_shared/logger.ts';

const RATE_TYPE = "3m_eibor";
const FALLBACK_RATE = 3.68;  // EIBOR as of March 2026 — update comment if scraping stays broken long-term
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const EIBOR_URL = "https://www.centralbank.ae/en/forex-eibor/eibor-rates/";

const ALLOWED_ORIGINS = [
  "https://www.sellingdubai.ae",
  "https://sellingdubai.ae",
  "https://www.sellingdubai.com",
  "https://sellingdubai.com",
  "https://sellingdubai-agents.netlify.app",
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
    "Content-Type": "application/json",
  };
}

async function scrapeEibor(): Promise<number | null> {
  try {
    const res = await fetch(EIBOR_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SellingDubai/1.0; +https://sellingdubai.ae)",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // CBUAE table has rows like: "3 Month" | "3.6800"
    // Multiple patterns for resilience against minor HTML changes.
    const patterns = [
      /3\s*[Mm]onth[\s\S]{0,300}?(\d+\.\d{2,4})/,
      /3M[\s\S]{0,150}?(\d+\.\d{2,4})/,
      />3 Month<[\s\S]{0,200}?>(\d+\.\d{2,4})</,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        const rate = parseFloat(match[1]);
        if (rate > 0.5 && rate < 15) return rate;  // sanity bounds: EIBOR is never 0 or >15%
      }
    }
    return null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const log = createLogger('fetch-eibor', req);
  const _start = Date.now();
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Cache check ──────────────────────────────────────────────────────────
    const { data: cached } = await supabase
      .from("market_rates")
      .select("rate_value, fetched_at, source")
      .eq("rate_type", RATE_TYPE)
      .single();

    if (cached) {
      const ageMs = Date.now() - new Date(cached.fetched_at).getTime();
      if (ageMs < CACHE_TTL_MS) {
        log({ event: 'success', status: 200, source: 'cache' });
        return Response.json(
          { rate: Number(cached.rate_value), cached: true, fetched_at: cached.fetched_at, source: cached.source },
          { headers },
        );
      }
    }

    // ── Scrape ───────────────────────────────────────────────────────────────
    const scraped = await scrapeEibor();

    // If scrape failed but we have a stale value, return it — stale data beats fallback
    if (scraped === null && cached) {
      log({ event: 'success', status: 200, source: 'stale_cache' });
      return Response.json(
        { rate: Number(cached.rate_value), cached: true, fetched_at: cached.fetched_at, source: "stale_cache", stale: true },
        { headers },
      );
    }

    const rateValue = scraped ?? FALLBACK_RATE;
    const source = scraped !== null ? "scrape" : "fallback";
    const now = new Date().toISOString();

    // ── Upsert ───────────────────────────────────────────────────────────────
    await supabase
      .from("market_rates")
      .upsert(
        { rate_type: RATE_TYPE, rate_value: rateValue, fetched_at: now, source },
        { onConflict: "rate_type" },
      );

    log({ event: 'success', status: 200, source });
    return Response.json(
      { rate: rateValue, cached: false, fetched_at: now, source },
      { headers },
    );
  } catch (err) {
    log({ event: 'error', status: 500, error: String(err) });
    return Response.json({ error: 'Internal server error.' }, { status: 500, headers });
  } finally {
    log.flush(Date.now() - _start);
  }
});
