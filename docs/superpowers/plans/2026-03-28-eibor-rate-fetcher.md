# EIBOR Rate Fetcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fetch the live 3-month EIBOR rate from the UAE Central Bank, cache it in Supabase for 24 hours, and display the rate breakdown in both steps of the mortgage calculator while using it for the eligibility stress test.

**Architecture:** A Supabase Deno edge function (`fetch-eibor`) scrapes the CBUAE website once per 24 hours and upserts the result to a `market_rates` table (one row per rate type, upserted in place). On cache hit it returns immediately. If scraping fails, it returns the most recent cached value or a hardcoded fallback so the calculator never breaks. The frontend calls this on modal open, stores `window._eiborRate`, injects an EIBOR badge into both Step 1 (Eligibility) and Step 2 (Compare Rates), and uses the live rate for the eligibility stress test calculation.

**Tech Stack:** Deno/TypeScript (Supabase edge functions), PostgreSQL/Supabase REST, vanilla JS ES modules

---

### Task 1: SQL migration — market_rates table

**Files:**
- Create: `sql/market_rates.sql`

- [ ] **Step 1: Write the migration**

Create `sql/market_rates.sql`:

```sql
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
```

- [ ] **Step 2: Apply migration in Supabase SQL Editor**

Open the Supabase dashboard for project `pjyorgedaxevxophpfib`, go to SQL Editor, and run the file. Verify with:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'market_rates'
ORDER BY ordinal_position;
```

Expected: 5 rows — id (uuid), rate_type (text), rate_value (numeric), fetched_at (timestamp with time zone), source (text).

- [ ] **Step 3: Commit**

```bash
git add sql/market_rates.sql
git commit -m "feat: add market_rates table for EIBOR caching"
```

---

### Task 2: Edge function — fetch-eibor

**Files:**
- Create: `edge-functions/fetch-eibor/index.ts`

- [ ] **Step 1: Create the edge function**

Create `edge-functions/fetch-eibor/index.ts`:

```typescript
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
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

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

  return Response.json(
    { rate: rateValue, cached: false, fetched_at: now, source },
    { headers },
  );
});
```

- [ ] **Step 2: Deploy edge function**

```bash
npx supabase functions deploy fetch-eibor --project-ref pjyorgedaxevxophpfib
```

Expected output includes: `Deployed Function fetch-eibor`.

- [ ] **Step 3: Smoke test — first call (scrape or fallback)**

```bash
curl -s "https://pjyorgedaxevxophpfib.supabase.co/functions/v1/fetch-eibor" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqeW9yZ2VkYXhldnhvcGhwZmliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMjU2MzYsImV4cCI6MjA4OTgwMTYzNn0.IhIpAxk--Y0ZKufK51-CPuhw-NafyLPvhH31iqzpgrU" | jq
```

Expected (source will be "scrape" or "fallback", NOT a 5xx error either way):
```json
{
  "rate": 3.68,
  "cached": false,
  "fetched_at": "2026-03-28T...",
  "source": "scrape"
}
```

- [ ] **Step 4: Smoke test — second call (cache hit)**

Run the same curl again immediately. Expected: `"cached": true`.

- [ ] **Step 5: Commit**

```bash
git add edge-functions/fetch-eibor/index.ts
git commit -m "feat: add fetch-eibor edge function with 24h cache and scrape fallback"
```

---

### Task 3: Mortgage calculator — EIBOR state and data loading

**Files:**
- Modify: `js/mortgage.js` (lines 9-14 for state, after line 119 for new functions, line 24 for openMortgage call, lines 80-93 for mortGoStep step-2 block, line 296 for stress test)

- [ ] **Step 1: Add global state — window._eiborRate**

In `js/mortgage.js`, after line 14 (`window._mortAppId = null;`), add one line:

```js
window._eiborRate = null;  // { rate: number, spread: number } once loaded
```

So the globals block reads:
```js
window._mortTerm = 25;
window._mortRate = 3.99;
window._mortStep = 1;
window._mortData = { employment: 'salaried', residency: 'uae_resident' };
window._mortRates = [];
window._mortAppId = null;
window._eiborRate = null;  // { rate: number, spread: number } once loaded
```

- [ ] **Step 2: Add loadEiborRate() function**

After the closing brace of `loadMortgageRates` (after line 119), add:

```js
async function loadEiborRate() {
  try {
    const res = await fetch(SUPABASE_URL + '/functions/v1/fetch-eibor', {
      headers: { 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY }
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.rate && data.rate > 0) {
      window._eiborRate = { rate: data.rate, spread: 1.5 };
      renderEiborBadge();
      // Update the default rate used before a bank is selected
      if (window._mortRate === 3.99) window._mortRate = +(data.rate + 1.5).toFixed(2);
    }
  } catch (e) {
    console.warn('EIBOR fetch failed, using hardcoded fallback rate:', e);
  }
}
```

- [ ] **Step 3: Add renderEiborBadge() function**

Directly after `loadEiborRate()`, add:

```js
function renderEiborBadge() {
  const r = window._eiborRate;
  if (!r) return;
  const total = (r.rate + r.spread).toFixed(2);
  const badgeHtml = `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;margin-bottom:12px;background:rgba(17,39,210,0.08);border:1px solid rgba(17,39,210,0.18);border-radius:8px;">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="rgba(17,39,210,0.7)" style="flex-shrink:0;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
    <span style="font-size:10px;color:rgba(255,255,255,0.5);font-weight:400;">Current rate: <strong style="color:#fff;font-weight:700;">${total}%</strong>&nbsp;&nbsp;·&nbsp;&nbsp;EIBOR ${r.rate.toFixed(2)}% + ${r.spread}% bank spread</span>
  </div>`;

  // Step 1: insert before #mort-elig-result (which is hidden until eligibility is checked)
  const s1Target = document.getElementById('mort-elig-result');
  if (s1Target && !document.getElementById('mort-eibor-badge-s1')) {
    const el = document.createElement('div');
    el.id = 'mort-eibor-badge-s1';
    el.innerHTML = badgeHtml;
    s1Target.parentElement?.insertBefore(el, s1Target);
  }

  // Step 2: insert before #mort-bank-cards
  const s2Target = document.getElementById('mort-bank-cards');
  if (s2Target && !document.getElementById('mort-eibor-badge-s2')) {
    const el = document.createElement('div');
    el.id = 'mort-eibor-badge-s2';
    el.innerHTML = badgeHtml;
    s2Target.parentElement?.insertBefore(el, s2Target);
  }
}
```

- [ ] **Step 4: Call loadEiborRate() from openMortgage()**

In `openMortgage()`, the current lines 23-24 read:
```js
mortGoStep(1);
loadMortgageRates();
```

Add `loadEiborRate()` on a new line after `loadMortgageRates()`:
```js
mortGoStep(1);
loadMortgageRates();
loadEiborRate();
```

- [ ] **Step 5: Re-render badge when Step 2 becomes active**

In `mortGoStep()`, the `if (step === 2)` block currently starts at line 80:
```js
if (step === 2) {
  // Sync down payment slider to residency LTV rules
  ...
  renderBankCards();
```

Add `renderEiborBadge();` immediately after `renderBankCards();`:
```js
if (step === 2) {
  // Sync down payment slider to residency LTV rules
  const dpSlider = document.getElementById('mort-dp-slider');
  if (dpSlider) {
    const minDp = window._mortData.residency === 'uae_national' ? 15 : (window._mortData.residency === 'non_resident' ? 50 : 20);
    dpSlider.min = minDp;
    if (parseInt(dpSlider.value) < minDp) dpSlider.value = minDp;
    const dpPctEl = document.getElementById('mort-dp-pct');
    if (dpPctEl) dpPctEl.textContent = dpSlider.value + '%';
  }
  renderBankCards();
  renderEiborBadge();
  // Auto-calculate if property value is pre-filled
  const valInput = document.getElementById('mort-value');
  if (valInput && valInput.value) calcMortgage();
}
```

This is a safety net: if `loadEiborRate()` hasn't resolved yet by the time the user navigates to Step 2 (unlikely but possible on slow connections), `renderEiborBadge()` here is a no-op. If it has resolved, it ensures the badge is present even if the Step 2 DOM wasn't ready during the initial `loadEiborRate()` call.

- [ ] **Step 6: Update eligibility stress test to use live EIBOR**

In `mortCheckEligibility()`, find line 296:
```js
// Stress rate: 3-month EIBOR (~3.68% Mar 2026) + typical bank margin ~0.5%
const mr = 0.0418 / 12;
```

Replace with:
```js
// Stress rate: live 3-month EIBOR + 0.5% margin (falls back to 4.18% if not yet loaded)
const stressRate = window._eiborRate ? (window._eiborRate.rate + 0.5) / 100 : 0.0418;
const mr = stressRate / 12;
```

- [ ] **Step 7: Commit**

```bash
git add js/mortgage.js
git commit -m "feat: integrate live EIBOR rate into mortgage calculator badge and stress test"
```

---

### Task 4: End-to-end browser verification

- [ ] **Step 1: Open the mortgage calculator**

Open the deployed app (or `localhost` if running locally). Open a property profile page and click the mortgage calculator button.

- [ ] **Step 2: Check browser console for EIBOR fetch**

Open DevTools → Console. You should see no errors. In the Network tab, filter for `fetch-eibor` — the request should return 200 with a JSON body like:
```json
{ "rate": 3.68, "cached": true, "fetched_at": "...", "source": "scrape" }
```

In console, run: `window._eiborRate` → should return `{ rate: 3.68, spread: 1.5 }`.

- [ ] **Step 3: Verify Step 1 badge**

The EIBOR badge should appear above the eligibility result area in Step 1, reading:
```
ℹ  Current rate: 5.18%  ·  EIBOR 3.68% + 1.5% bank spread
```
(Exact numbers depend on live EIBOR.)

- [ ] **Step 4: Verify stress test uses live rate**

Enter a monthly income of `AED 30,000` in Step 1. Click "Check Eligibility". The max loan result should be calculated using `(window._eiborRate.rate + 0.5) / 100 / 12` as the monthly stress rate — not the old hardcoded `0.0418 / 12`.

To verify: `(3.68 + 0.5) / 100 / 12 = 0.003483`. Open console and check: the max loan for income 30000, no debt, 25yr term should be approximately AED 5.27M (vs old hardcoded ~5.28M — a small difference since rates are close).

- [ ] **Step 5: Verify Step 2 badge**

Click "Continue" to reach Step 2. The same badge should appear above the bank comparison cards.

- [ ] **Step 6: Verify cache hit on second open**

Close the modal and reopen it. The Network tab should show `fetch-eibor` returning `"cached": true` instantly.

- [ ] **Step 7: Verify graceful fallback**

In DevTools → Network, right-click the `fetch-eibor` request and select "Block request URL". Reload the page and open the mortgage modal. The calculator should still function fully — using `window._mortRate = 3.99` — with a `console.warn` visible in DevTools and no error shown to the user.
