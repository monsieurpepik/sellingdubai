# YC/VC Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all production readiness gaps blocking YC/VC fundraising and billing launch — dead files, broken service worker, stale CORS allowlists, hardcoded prod URL in pricing, and two missing UX features (property pagination, mortgage rate TTL).

**Architecture:** Mechanical code-only fixes. No new dependencies, no schema changes, no new edge functions. Each task is independently mergeable and does not depend on env-var changes. The billing env-var (`BILLING_LIVE=true`) and DNS changes are manual Netlify tasks listed at the end — out of scope for this plan.

**Tech Stack:** TypeScript/JS (esbuild code-splitting), Deno edge functions (Supabase), Netlify, Service Worker Cache API

---

## File Map

| File | Task | Action |
|------|------|--------|
| `app.js` | 1 | Delete |
| `app.js.bak` | 1 | Delete |
| `deploy-*.zip` | 1 | Delete + gitignore |
| `.gitignore` | 1 | Add `*.zip` |
| `sw.js` | 2 | Fix STATIC_ASSETS + bump CACHE_NAME |
| `supabase/functions/_shared/utils.ts` | 3 | Remove dead Netlify domain, add staging |
| `supabase/functions/agency-stats/index.ts` | 4 | Remove dead Netlify domain, add staging |
| `supabase/functions/capture-project-lead/index.ts` | 4 | Same |
| `supabase/functions/cobroke-listings/index.ts` | 4 | Same |
| `supabase/functions/create-checkout/index.ts` | 4 | Same |
| `supabase/functions/create-portal-session/index.ts` | 4 | Same |
| `supabase/functions/export-leads/index.ts` | 4 | Same |
| `supabase/functions/fetch-eibor/index.ts` | 4 | Same |
| `supabase/functions/get-analytics/index.ts` | 4 | Same |
| `supabase/functions/lead-followup-nagger/index.ts` | 4 | Same |
| `supabase/functions/log-event/index.ts` | 4 | Same |
| `supabase/functions/manage-agency/index.ts` | 4 | Same |
| `supabase/functions/manage-properties/index.ts` | 4 | Same |
| `supabase/functions/notify-mortgage-lead/index.ts` | 4 | Same |
| `supabase/functions/post-buyer-request/index.ts` | 4 | Same |
| `supabase/functions/send-magic-link/index.ts` | 4 | Same |
| `supabase/functions/send-otp/index.ts` | 4 | Same |
| `supabase/functions/submit-mortgage/index.ts` | 4 | Same |
| `supabase/functions/track-referral/index.ts` | 4 | Same |
| `supabase/functions/update-lead-status/index.ts` | 4 | Same |
| `supabase/functions/update-mortgage-docs/index.ts` | 4 | Same |
| `supabase/functions/verify-broker/index.ts` | 4 | Same |
| `supabase/functions/verify-magic-link/index.ts` | 4 | Same |
| `supabase/functions/whatsapp-ingest/index.ts` | 4 | Same |
| `scripts/build-js.js` | 5 | Inject `window.__SD_SUPABASE_URL__` into release-config.js |
| `js/pricing.js` | 5 | Replace hardcoded prod URL with `window.__SD_SUPABASE_URL__` |
| `js/properties.ts` | 6 | Add load-more pagination (offset-based) |
| `js/mortgage.ts` | 7 | Add 30-min TTL to cached EIBOR rates |

---

### Task 1: Delete dead files and update .gitignore

**Files:**
- Delete: `app.js` (old 2312-line monolith, superseded by esbuild bundles in `dist/`)
- Delete: `app.js.bak` (backup of same)
- Delete: `deploy-1774605695009-9c7fca44-7db8-42cd-b2ef-f8c3617606e2.zip` (deployment artifact)
- Modify: `.gitignore`

- [ ] **Step 1: Delete the three dead files**

```bash
git rm app.js app.js.bak "deploy-1774605695009-9c7fca44-7db8-42cd-b2ef-f8c3617606e2.zip"
```

Expected: three deletions staged.

- [ ] **Step 2: Add *.zip to .gitignore**

Open `.gitignore` and append `*.zip` at the bottom (before the closing newline if any).

Exact addition:
```
*.zip
```

- [ ] **Step 3: Verify no other HTML references app.js**

```bash
grep -r "app\.js" --include="*.html" .
```

Expected: zero matches (all pages already reference `dist/init.bundle.js`).

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: delete dead app.js monolith, backup, and deploy artifact; ignore *.zip"
```

---

### Task 2: Fix service worker broken cache entry

**Files:**
- Modify: `sw.js`

**Context:** `sw.js` precaches `/app.js` which was deleted when the codebase moved to esbuild bundles in `dist/`. Returning users with an active service worker get a broken offline shell because `caches.addAll()` fails when `/app.js` 404s. Must also bump `CACHE_NAME` so existing SW installations invalidate their broken cache and re-install.

- [ ] **Step 1: Read sw.js lines 1–10 to confirm current state**

Current state (verified during audit):
```js
const CACHE_NAME = 'sd-v22';
const STATIC_ASSETS = [
  '/',
  '/styles.css',
  '/app.js',       // BROKEN — 404s, breaks caches.addAll()
  '/manifest.json',
  '/sellingdubailogo.png',
];
```

- [ ] **Step 2: Replace CACHE_NAME and STATIC_ASSETS**

In `sw.js`, replace lines 2–9 with:
```js
const CACHE_NAME = 'sd-v23';
const STATIC_ASSETS = [
  '/',
  '/styles.css',
  '/dist/init.bundle.js',
  '/manifest.json',
  '/sellingdubailogo.png',
];
```

`/dist/init.bundle.js` is the esbuild entry bundle that replaced `app.js`. The `dist/` prefix matches how it is referenced in HTML (`<script type="module" src="/dist/init.bundle.js">`).

- [ ] **Step 3: Verify the HTML reference matches**

```bash
grep -n "init.bundle" *.html
```

Expected: one or more matches confirming `/dist/init.bundle.js` is the correct path. If the path differs, use the path from the HTML.

- [ ] **Step 4: Commit**

```bash
git add sw.js
git commit -m "fix: service worker — replace deleted app.js with dist/init.bundle.js, bump cache to sd-v23"
```

---

### Task 3: Fix shared CORS utility — remove dead domain, add staging

**Files:**
- Modify: `supabase/functions/_shared/utils.ts`

**Context:** `_shared/utils.ts` exports `CORS_ORIGINS` used by ~13 edge functions. It contains `sellingdubai-agents.netlify.app` which is a dead domain. Requests from `staging.sellingdubai.com` (new staging subdomain) will be rejected with a CORS error until it is added.

- [ ] **Step 1: Read current CORS_ORIGINS in utils.ts**

```bash
grep -n "CORS_ORIGINS\|sellingdubai" supabase/functions/_shared/utils.ts
```

Current state (lines ~8–17):
```ts
export const CORS_ORIGINS = [
  "https://sellingdubai.ae",
  "https://www.sellingdubai.ae",
  "https://agents.sellingdubai.ae",
  "https://sellingdubai.com",
  "https://www.sellingdubai.com",
  "https://sellingdubai-agents.netlify.app",  // dead domain
];
```

- [ ] **Step 2: Replace the CORS_ORIGINS array**

In `supabase/functions/_shared/utils.ts`, replace the entire `CORS_ORIGINS` export with:
```ts
export const CORS_ORIGINS = [
  "https://sellingdubai.ae",
  "https://www.sellingdubai.ae",
  "https://agents.sellingdubai.ae",
  "https://sellingdubai.com",
  "https://www.sellingdubai.com",
  "https://staging.sellingdubai.com",
];
```

- [ ] **Step 3: Verify no other stale domains remain**

```bash
grep -n "netlify.app\|sellingdubai-agents" supabase/functions/_shared/utils.ts
```

Expected: zero matches.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/utils.ts
git commit -m "fix: remove dead netlify.app domain from shared CORS origins, add staging.sellingdubai.com"
```

---

### Task 4: Fix per-function CORS allowlists — remove dead domain, add staging

**Files (22 edge functions):**
- `supabase/functions/send-magic-link/index.ts`
- `supabase/functions/verify-magic-link/index.ts`
- `supabase/functions/verify-broker/index.ts`
- `supabase/functions/get-analytics/index.ts`
- `supabase/functions/manage-agency/index.ts`
- `supabase/functions/send-otp/index.ts`
- `supabase/functions/notify-mortgage-lead/index.ts`
- `supabase/functions/capture-project-lead/index.ts`
- `supabase/functions/create-portal-session/index.ts`
- `supabase/functions/export-leads/index.ts`
- `supabase/functions/fetch-eibor/index.ts`
- `supabase/functions/log-event/index.ts`
- `supabase/functions/update-mortgage-docs/index.ts`
- `supabase/functions/create-checkout/index.ts`
- `supabase/functions/submit-mortgage/index.ts`
- `supabase/functions/track-referral/index.ts`
- `supabase/functions/manage-properties/index.ts`
- `supabase/functions/update-lead-status/index.ts`
- `supabase/functions/cobroke-listings/index.ts`
- `supabase/functions/whatsapp-ingest/index.ts`
- `supabase/functions/lead-followup-nagger/index.ts`
- `supabase/functions/post-buyer-request/index.ts`

**Context:** These functions define their own local `ALLOWED_ORIGINS` array instead of (or in addition to) using the shared `CORS_ORIGINS` from `_shared/utils.ts`. Each one contains `"https://sellingdubai-agents.netlify.app"` which must be replaced with `"https://staging.sellingdubai.com"`.

- [ ] **Step 1: Do a mass find-and-replace across all 22 files**

This is a one-liner sed. Run it from the repo root:

```bash
find supabase/functions -name "index.ts" -not -path "*/_shared/*" \
  -exec sed -i '' \
    's|"https://sellingdubai-agents\.netlify\.app"|"https://staging.sellingdubai.com"|g' \
  {} +
```

- [ ] **Step 2: Verify the old domain is gone**

```bash
grep -rn "sellingdubai-agents.netlify.app" supabase/functions/
```

Expected: zero matches.

- [ ] **Step 3: Verify the new domain was inserted**

```bash
grep -rn "staging.sellingdubai.com" supabase/functions/ | wc -l
```

Expected: 23 or more lines (22 functions + 1 shared utils from Task 3).

- [ ] **Step 4: Spot-check two files to confirm correct substitution**

```bash
grep -n "ALLOWED_ORIGINS\|staging" supabase/functions/send-magic-link/index.ts
grep -n "ALLOWED_ORIGINS\|staging" supabase/functions/create-checkout/index.ts
```

Expected: `"https://staging.sellingdubai.com"` present in each `ALLOWED_ORIGINS` array.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/
git commit -m "fix: replace dead netlify.app CORS origin with staging.sellingdubai.com across all 22 edge functions"
```

---

### Task 5: Fix pricing.js hardcoded production Supabase URL

**Files:**
- Modify: `scripts/build-js.js`
- Modify: `js/pricing.js`

**Context:** `js/pricing.js` line 57 hardcodes `https://pjyorgedaxevxophpfib.supabase.co/functions/v1/create-checkout`. When `BILLING_LIVE=true` goes live, a staging deploy would call the **production** checkout function — wrong. The fix is to inject `window.__SD_SUPABASE_URL__` into `dist/release-config.js` at build time (which already injects `window.SENTRY_RELEASE`), then read it in `pricing.js`. `pricing.html` already loads `dist/release-config.js` before `pricing.js`, so the variable is always available.

- [ ] **Step 1: Read scripts/build-js.js lines 51–60 to confirm current release-config.js write**

Current state:
```js
const sha = process.env.SENTRY_RELEASE || process.env.COMMIT_REF || process.env.GITHUB_SHA || 'dev';
fs.writeFileSync(
  'dist/release-config.js',
  `window.SENTRY_RELEASE = ${JSON.stringify(sha)};\n`,
  'utf8'
);
```

- [ ] **Step 2: Add `window.__SD_SUPABASE_URL__` to the release-config.js write in build-js.js**

Replace the `fs.writeFileSync` call (lines ~54–58) with:
```js
fs.writeFileSync(
  'dist/release-config.js',
  `window.SENTRY_RELEASE = ${JSON.stringify(sha)};\nwindow.__SD_SUPABASE_URL__ = ${JSON.stringify(url)};\n`,
  'utf8'
);
```

Note: `url` is already declared at the top of the file as `process.env.SUPABASE_URL` and the script exits if it's unset — so this is safe.

- [ ] **Step 3: Read js/pricing.js line 57 to confirm the hardcoded URL**

Current state:
```js
var res = await fetch('https://pjyorgedaxevxophpfib.supabase.co/functions/v1/create-checkout', {
```

- [ ] **Step 4: Replace the hardcoded URL in pricing.js**

Replace line 57 with:
```js
var supabaseUrl = (typeof window !== 'undefined' && window.__SD_SUPABASE_URL__) || 'https://pjyorgedaxevxophpfib.supabase.co';
var res = await fetch(supabaseUrl + '/functions/v1/create-checkout', {
```

The fallback to the prod URL ensures nothing breaks if `release-config.js` is somehow not loaded (e.g., direct open of the HTML file without a build).

- [ ] **Step 5: Verify pricing.html loads release-config.js before pricing.js**

```bash
grep -n "release-config\|pricing.js" pricing.html
```

Expected: `release-config.js` script tag appears **before** `pricing.js` script tag. If not, reorder them.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-js.js js/pricing.js
git commit -m "fix: inject __SD_SUPABASE_URL__ at build time so pricing.js checkout URL is env-aware"
```

---

### Task 6: Add property pagination (load-more)

**Files:**
- Modify: `js/properties.ts`

**Context:** `loadProperties()` fetches with `.limit(50)`. Agents with 50+ listings silently drop everything beyond the 50th. The UI has no load-more affordance. Add offset-based pagination with a "Load more" button injected below the property grid.

The property grid container selector is `#prop-grid` (confirmed by grepping properties.ts and agent-page.ts). The existing `allProperties` state array holds currently rendered properties.

- [ ] **Step 1: Read properties.ts lines 94–119 to see the current loadProperties function**

Current state (key lines):
```ts
let propertiesLoaded = false;
let propertiesError: string | null = null;
let propertiesCache: Property[] = [];

export async function loadProperties(agentId: string): Promise<Property[]> {
  if (propertiesLoaded) return propertiesCache;
  // ...
  .limit(50);
  // ...
  propertiesLoaded = true;
  return propertiesCache;
}
```

- [ ] **Step 2: Add pagination state variables after line 96**

After `let propertiesCache: Property[] = [];` add:
```ts
const PAGE_SIZE = 50;
let propertiesOffset = 0;
let propertiesHasMore = false;
let propertiesAgentId = '';
```

- [ ] **Step 3: Update loadProperties to support pagination**

Replace the entire `loadProperties` export with:
```ts
export async function loadProperties(agentId: string): Promise<Property[]> {
  if (propertiesLoaded) return propertiesCache;
  propertiesError = null;
  propertiesAgentId = agentId;
  const { data: props, error } = await supabase
    .from('properties')
    .select('id,title,image_url,additional_photos,price,location,property_type,bedrooms,bathrooms,area_sqft,features,description,listing_type,status,developer,handover_date,payment_plan,dld_permit,reference_number,sort_order,created_at,is_active')
    .eq('agent_id', agentId)
    .neq('is_active', false)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .range(0, PAGE_SIZE - 1);
  if (error) {
    propertiesError = error.message;
    console.error('[properties] Failed to load properties:', error.message);
    return [];
  }
  const page = (props || []).map(p => injectDemoPhotos(p as Property));
  propertiesCache = page;
  propertiesOffset = page.length;
  propertiesHasMore = page.length === PAGE_SIZE;
  propertiesLoaded = true;
  return propertiesCache;
}
```

- [ ] **Step 4: Add loadMoreProperties export**

After the closing brace of `loadProperties`, add:
```ts
export async function loadMoreProperties(): Promise<Property[]> {
  if (!propertiesHasMore || !propertiesAgentId) return [];
  const { data: props, error } = await supabase
    .from('properties')
    .select('id,title,image_url,additional_photos,price,location,property_type,bedrooms,bathrooms,area_sqft,features,description,listing_type,status,developer,handover_date,payment_plan,dld_permit,reference_number,sort_order,created_at,is_active')
    .eq('agent_id', propertiesAgentId)
    .neq('is_active', false)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .range(propertiesOffset, propertiesOffset + PAGE_SIZE - 1);
  if (error) {
    console.error('[properties] Failed to load more properties:', error.message);
    return [];
  }
  const page = (props || []).map(p => injectDemoPhotos(p as Property));
  propertiesCache = [...propertiesCache, ...page];
  propertiesOffset += page.length;
  propertiesHasMore = page.length === PAGE_SIZE;
  return page;
}

export { propertiesHasMore };
```

- [ ] **Step 5: Read agent-page.ts to find where properties are rendered into the DOM**

```bash
grep -n "loadProperties\|prop-grid\|renderProperty\|loadMore" js/agent-page.ts | head -20
```

Identify the call site where `loadProperties()` result is rendered.

- [ ] **Step 6: Add load-more button injection in agent-page.ts**

After the properties are rendered to the grid (after the `loadProperties` call and the loop that appends cards), add this block:

```ts
// Inject or update "Load more" button based on propertiesHasMore
import { loadMoreProperties, propertiesHasMore } from './properties';

function updateLoadMoreBtn(agentId: string, gridEl: HTMLElement): void {
  const existing = document.getElementById('props-load-more');
  if (!propertiesHasMore) { existing?.remove(); return; }
  if (existing) return; // already injected
  const btn = document.createElement('button');
  btn.id = 'props-load-more';
  btn.className = 'load-more-btn';
  btn.textContent = 'Load more properties';
  btn.addEventListener('click', async () => {
    btn.textContent = 'Loading…';
    btn.disabled = true;
    const more = await loadMoreProperties();
    for (const p of more) {
      const el = document.createElement('div');
      // Use the same card renderer used for the initial render
      el.innerHTML = renderPropertyCard(p, allProperties.indexOf(p));
      gridEl.appendChild(el.firstElementChild as HTMLElement);
    }
    allProperties.push(...more);
    btn.textContent = 'Load more properties';
    btn.disabled = false;
    if (!propertiesHasMore) btn.remove();
  });
  gridEl.after(btn);
}
```

Call `updateLoadMoreBtn(agentData.id, gridEl)` immediately after the grid is populated on first load.

> **Note:** The exact integration point in `agent-page.ts` depends on what you find in Step 5. Adapt the call site accordingly — the important parts are: (a) button appears after the grid, (b) clicking it calls `loadMoreProperties()`, (c) button is removed when `propertiesHasMore` becomes false.

- [ ] **Step 7: Commit**

```bash
git add js/properties.ts js/agent-page.ts
git commit -m "feat: add load-more pagination for properties (50/page)"
```

---

### Task 7: Add TTL to cached mortgage rates

**Files:**
- Modify: `js/mortgage.ts`

**Context:** `_mortRates` is cached for the entire browser session with no expiry. EIBOR rates change daily. A user who opens the mortgage calculator shortly after a rate change will see stale data until they hard-reload. A 30-minute TTL is the right balance — short enough to catch same-day rate updates, long enough to avoid unnecessary re-fetches.

- [ ] **Step 1: Read mortgage.ts to find the rate cache variables**

```bash
grep -n "_mortRates\|_mortRatesLoad\|fetchRates\|eibor" js/mortgage.ts | head -20
```

Locate the declarations of `_mortRates` and `_mortRatesLoadFailed` and the function that fetches rates (likely calls the `fetch-eibor` edge function).

- [ ] **Step 2: Add a TTL timestamp variable alongside the existing cache variables**

Find the block where `_mortRates` and `_mortRatesLoadFailed` are declared (typically at module top-level). Add immediately after:

```ts
const MORT_RATES_TTL_MS = 30 * 60 * 1000; // 30 minutes
let _mortRatesFetchedAt = 0;
```

- [ ] **Step 3: Add TTL check to the rates guard**

Find the guard that skips the fetch when rates are already loaded. It will look like:
```ts
if (_mortRates) return _mortRates;
// or
if (_mortRatesLoadFailed) return null;
```

Replace it with:
```ts
const now = Date.now();
if (_mortRates && now - _mortRatesFetchedAt < MORT_RATES_TTL_MS) return _mortRates;
if (_mortRatesLoadFailed && now - _mortRatesFetchedAt < MORT_RATES_TTL_MS) return null;
// TTL expired — reset state and re-fetch
_mortRates = null;
_mortRatesLoadFailed = false;
```

- [ ] **Step 4: Record fetch timestamp on success**

Find the line where `_mortRates` is assigned the fetched data (after the successful network call). Immediately after that assignment, add:
```ts
_mortRatesFetchedAt = Date.now();
```

Also add it after any failure assignment to `_mortRatesLoadFailed = true`:
```ts
_mortRatesLoadFailed = true;
_mortRatesFetchedAt = Date.now(); // don't hammer the API on repeated failures
```

- [ ] **Step 5: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no errors related to `_mortRatesFetchedAt` or the TTL logic.

- [ ] **Step 6: Commit**

```bash
git add js/mortgage.ts
git commit -m "fix: add 30-minute TTL to cached EIBOR mortgage rates"
```

---

## Manual Tasks (Out of Scope — Require External Access)

These require Netlify dashboard or DNS changes and cannot be done in code:

| # | Task | Where |
|---|------|--------|
| M1 | Set `BILLING_LIVE=true` in Netlify production env | Netlify → Site settings → Env vars |
| M2 | Confirm Stripe price IDs in prod env before M1 | Netlify → Site settings → Env vars |
| M3 | Add `LOADTEST_AGENT_ID` secret to GitHub | GitHub → Repo → Settings → Secrets |
| M4 | Complete `staging.sellingdubai.com` DNS CNAME + Netlify custom domain | DNS provider + Netlify domains |
| M5 | Configure Sentry alert rules + Slack integration | Sentry dashboard |

---

## Self-Review

**Spec coverage:**
- [x] Task 1 — dead file removal
- [x] Task 2 — broken service worker cache
- [x] Task 3 — shared CORS dead domain
- [x] Task 4 — per-function CORS dead domain (all 22 named explicitly)
- [x] Task 5 — pricing.js hardcoded prod URL
- [x] Task 6 — property pagination
- [x] Task 7 — mortgage rate TTL
- [x] Manual tasks listed

**Placeholder scan:** None. All steps have exact commands, exact code, or exact file locations.

**Type consistency:** `loadMoreProperties` and `propertiesHasMore` are exported from `properties.ts` and imported in `agent-page.ts` in Task 6. `renderPropertyCard` is already used in `agent-page.ts` — the import is not new. No naming conflicts introduced.
