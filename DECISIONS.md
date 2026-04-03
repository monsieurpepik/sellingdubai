# Architecture Decisions Log

## 2026-04-02 — Extract renderOffPlanBreakdown to mortgage-offplan.js

**What:** Extracted `renderOffPlanBreakdown` from `js/mortgage.js` into a new `js/mortgage-offplan.js` module. The new module exports one pure function that takes a `proj` object and returns `{ html, bookingAmt, dldFee, agentComm, totalCash, loanAmount }` without side effects on `_mortState`. In `mortGoStep`, when step === 1 and mode === 'offplan', the function is loaded via dynamic `import('./mortgage-offplan.js')` and state is updated from the returned values.

**Why:** `dist/chunks/mortgage-*.js` was ~23.2KB, over the 20KB soft limit. `renderMortOffPlanStep1` (~3KB) is only needed in offplan mode. By making it a pure function in a separate chunk loaded on demand, the cost is deferred to first offplan calculator open.

**Result:** `mortgage-*.js` dropped from 23,831 bytes (~23.2KB) to 20,824 bytes (~20.3KB) — a reduction of ~3KB. A new `mortgage-offplan-*.js` chunk is 3,345 bytes (~3.3KB). The mortgage chunk is 0.3KB over the 20KB soft limit, which is acceptable given it is lazy-loaded on first mortgage modal open (no first-paint impact) and cannot be reduced further without splitting core state-management logic.

## 2026-04-02 — Luxury Off-Plan & Mortgage Refactor: chunk size increases

### mortgage chunk: ~18.2KB → ~23.2KB

`dist/chunks/mortgage-*.js` now exceeds the 20KB soft limit by ~3.2KB.

Three additions drove the increase:
- **Off-plan Step 1** (`renderMortOffPlanStep1`): milestone cost breakdown table, DLD fee row, agent commission checkbox, total cash and loan amount summary, "Calculate Mortgage Payments" CTA (~3KB of new rendering logic).
- **State consolidation**: `_mortState` object + `_mortStateDefaults` const replacing 8 `window._mort*` globals — minor size impact but cleaner coupling.
- **Amortization bar**: principal vs total interest bar injected into the pre-qualified result screen (~0.8KB of inline HTML generation).

Cannot be split further: `renderMortOffPlanStep1`, `window.mortOpProceed`, and `window._mortOpToggleAgent` all read/write `_mortState` directly — extracting them to a sub-module would require either shared mutable state across chunks (complexity) or prop-drilling the entire state object (defeats the consolidation). The mortgage chunk is already lazy-loaded on first "Get Pre-Approved" or "Calculate Mortgage" click, so no first-paint impact. Accepted overage.

### project-detail chunk: 20.3KB → 21.6KB (JSON-LD injection + DOM sanitizer)

`dist/chunks/project-detail-*.js` grew from 20.3KB to 21.6KB (~1.3KB increase across two changes).

- **JSON-LD injection** (+0.9KB): `_injectProjectSchema(project)` injects an `ApartmentComplex` schema into `<head>` on project open and removes it on close. Tightly coupled to the project fetch result.
- **DOM-based sanitizeHtml** (+0.4KB): Replaced regex blocklist with a `<template>`-based DOM parser that removes dangerous elements and strips `javascript:`/`data:` protocol URLs. Handles SVG XSS and malformed markup that regex patterns miss.

Both are tightly coupled to the project detail render path and cannot be split into sub-chunks. Chunk is lazy-loaded on first project card tap (no first-paint impact). Accepted overage.

## 2026-03-30 — project-detail chunk at 23.1KB (DLD async section)

`dist/chunks/project-detail-*.js` is 23.1KB, 3.1KB over the 20KB soft limit.
Added async DLD official data fetch: second Supabase query after project render, client-side name-overlap scoring across up to 20 candidates, and inline HTML for status/progress/completion card.
Cannot be split further — the DLD logic is tightly coupled to the project object and the DOM element rendered inline. The async pattern (fire-and-forget IIFE after sheet.innerHTML) keeps it non-blocking so no first-paint impact. Acceptable overage.

Previous entry (now superseded): Added `percent_completed` SELECT field and construction progress bar HTML (~0.8KB). That field and bar have been removed; the DLD section replaces them.

## 2026-03-27 — Modular JS Extraction + Performance + Design System

### What we did

**JS Modularization**
- Extracted monolithic `app.js` (2,313 lines) into 12 ES modules in `js/`
- `config.js`, `state.js`, `utils.js`, `icons.js`, `analytics.js`, `properties.js`, `filters.js`, `gallery.js`, `property-detail.js`, `mortgage.js`, `lead-modal.js`, `agent-page.js`, `init.js`
- Shared mutable state (`currentAgent`, `allProperties`, `currentFilters`) lives in `state.js` with setter functions
- Original `app.js` preserved as `app.js.bak`, commented out in index.html as fallback

**Build Pipeline**
- Added esbuild with ESM code splitting: `init.bundle.js` (22.7KB) + lazy-loaded chunks
- Mortgage calculator (16.2KB) only loads on first "Get Pre-Approved" click
- `property-detail` chunk intentionally ~20.5KB (exceeds 20KB budget by <3%): contains property detail modal, gallery, and floor-plan viewer — all coupled logic that would require cross-chunk imports if split further, with no meaningful LCP impact as it only loads on user interaction
- CSS minification via esbuild: `styles.css` → `dist/styles.min.css`
- Netlify build runs `npm run build` automatically (CSS + JS + styles)
- Hashed chunk filenames with 1-year immutable cache headers

**Performance**
- Initial JS: 124KB → 22.7KB (82% reduction)
- Error boundaries: each module loads in try/catch, one failure doesn't kill the app
- Property card images: Netlify Image CDN (WebP, 800px max, q80)
- Explicit `width`/`height` on all images (fixes CLS)
- Supabase CDN script preloaded
- Lighthouse: Performance 77, Accessibility 100, Best Practices 100, SEO 100

**Security**
- Hardened CSP: `frame-ancestors 'none'`, `form-action 'self'`, `upgrade-insecure-requests`
- HSTS: 2 years with `preload`
- COOP/CORP headers added
- Permissions-Policy expanded to 11 APIs
- X-XSS-Protection set to `0` (per OWASP — deprecated header)
- RLS policies written for all 7 Supabase tables
- Database indexes written for all query patterns

**Design System**
- 548 hardcoded CSS values migrated to custom properties
- Colors (111), border-radius (86), font-size (148), durations (203)
- `:root` defines 45+ tokens across 5 categories

**Premium UI**
- `prefers-reduced-motion` global rule
- Carousel dots: glass pill with elongated active indicator (Airbnb pattern)
- Price typography: stacked "AED" label above bold number
- Photo viewer: opacity crossfade between photos (no hard cuts)
- Range slider: 2px track, 20px thumb, brand-blue glow on drag
- Mortgage steps: circular numbered indicators with connecting lines

**Testing**
- Deno integration tests for `capture-lead-v4` (14 tests) and `send-magic-link` (9 tests)
- Covers: happy path, validation, rate limiting, dedup, honeypot, CORS, enumeration prevention
- JS module smoke test at `js/test-modules.html`

## 2026-03-29 — Security Hardening Round 2

### Intentional non-obvious choices

**pricing.html has `<meta name="robots" content="noindex, nofollow">`**
This is intentional. Billing is not yet live (BILLING_LIVE=false). We do not want the pricing page indexed before Stripe is configured and tested in production. Remove the noindex tag and flip BILLING_LIVE to true when billing opens.

**landing.html CTAs point to `#waitlist` anchor**
Intentional through 2026-04-05 (billing launch date). Once billing opens, update all CTAs on landing.html from `#waitlist` to `/join` and remove the waitlist section.

### What's next

- Migrate remaining hardcoded colors (non-exact matches) to design tokens
- Self-host Google Fonts for performance (eliminates render-blocking request)
- Add `srcset` to agent avatar for responsive images
- Write Deno tests for remaining edge functions (verify-magic-link, update-agent, whatsapp-ingest)
- Consider dark/light theme toggle using the token system
- Fix the stray `}` CSS syntax warnings (lines 587, 2386)

## 2026-03-30 — REM Off-Plan: Enrich Sync with Detail API

### Decision

Update `sync-rem-offplan` (Supabase Edge Function) to call the REM detail endpoint for each project after the main list sync:

```
POST https://my.remapp.ae/api/public/websites_project_detail
```

Store four new fields on `public.projects`:

- `gallery_images TEXT[]` — array of image URLs from the detail response
- `floor_plan_urls TEXT[]` — floor plan images
- `payment_plan_detail JSONB` — full payment plan breakdown (booking %, construction instalments %, handover %)
- `available_units JSONB` — unit types with availability, sizes, prices

### Why

The current sync only hits the REM list endpoint, which returns summary data (cover image only). The detail endpoint returns the full gallery, floor plans, structured payment plan, and unit availability per project. Without this enrichment, `project-detail.js` is limited to one hero image and no unit data. Storing at sync time (not at request time) keeps the detail page fast and avoids browser CORS issues with the REM API.

### Schema change required

Run in Supabase SQL editor before deploying the updated Edge Function:

```sql
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS gallery_images  TEXT[],
  ADD COLUMN IF NOT EXISTS floor_plan_urls TEXT[],
  ADD COLUMN IF NOT EXISTS payment_plan_detail JSONB,
  ADD COLUMN IF NOT EXISTS available_units JSONB;
```

### What this unlocks in project-detail.js

- Full photo gallery with swipe (from `gallery_images`)
- Floor plan viewer (from `floor_plan_urls`)
- Payment plan breakdown cards — booking %, construction instalments %, handover % (replaces "Contact agent" fallback)

## 2026-03-30 — Lightbox, thumb filter, icon amenities in project-detail

### project-detail chunk size: 20.3KB (over 20KB guideline)

The lightbox implementation (inline DOM creation, touch events for swipe + pinch-zoom, render loop) adds ~4KB
to the `project-detail` chunk (16.2KB → 20.3KB). No suitable way to split it further without adding a new
round-trip for a feature that fires on first photo tap. Accepted as necessary — all other chunks remain under 20KB.

### Brochure lead gate

Clicking "Get Brochure — Free" opens the lead modal instead of direct PDF link. After submit, `window.open()`
delivers the PDF. Popup-blocked fallback shows an inline `<a>` link in the success message.

### Thumbnail filter

Filters gallery URLs matching `/[/_-]thumb(nail)?[/_.-]/i` — REM API returns both full-size and thumbnail
variants; this keeps only full-size images in the gallery and lightbox.
- Available units table — beds, size, price, availability status (from `available_units`)

## 2026-03-30 — REM Sync Scheduled Trigger

### sync-rem-offplan cron schedule

`sync-rem-offplan` is a Supabase edge function (not a Netlify function), so it cannot be scheduled via `netlify.toml`. To run it on a daily schedule, enable pg_cron in your Supabase project and add:

```sql
SELECT cron.schedule(
  'sync-rem-offplan-daily',
  '0 3 * * *',  -- 03:00 UTC daily
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/sync-rem-offplan',
      headers := '{"Authorization": "Bearer ' || current_setting('app.service_role_key') || '", "Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);
```

Alternatively, use an external cron service (e.g. cron-job.org) to POST to the function URL with the service role key as a Bearer token. The function is idempotent — safe to re-run.

## 2026-04-03 — Migration Reconstruction Strategy (Phase 3)

### Why migrations were reconstructed rather than pulled

`supabase db pull` requires a live database connection. The project uses Netlify for the frontend and Supabase for the backend, but there is no local tunnel or direct DB access available during this engineering pass. The schema was instead reconstructed from two authoritative sources:

1. **`sql/` directory** — 14 SQL files (`sql/001` through `sql/014`) that record schema changes made after the initial deploy. These were the primary source for all ALTER TABLE and CREATE TABLE statements.

2. **Edge function source code** — The `supabase/functions/` directory contains the ground truth for table shapes that predate the `sql/` tracking system. Column names, types, CHECK constraints, and FK relationships were inferred from INSERT/SELECT statements in each function.

### What was discovered

Nine tables existed in production with no corresponding `sql/` migration: `email_verification_codes`, `dld_brokers`, `lead_referrals`, `co_broke_deals`, `buyer_requests`, `property_matches`, `referrals`, `featured_projects`, `project_agent_assignments`. These were reconstructed entirely from edge function source code.

The five foundation tables (`agents`, `properties`, `leads`, `page_events`, `mortgage_applications`) also had no CREATE TABLE in any `sql/` file — they predate the tracking system and were reconstructed into `20240101000000_base_schema.sql`.

### Migration ordering

Timestamps were assigned by feature dependency order, not by wall-clock creation date. All timestamps use `YYYYMM01000000` format for clarity. The one exception is `20260402062459_off_plan_enrichment.sql`, which was already present with a real timestamp and was not modified.

### Trade-offs

- **Risk:** The reconstructed base schema may have minor column-level discrepancies (e.g. a constraint present in prod but not in any function). The definitive fix is `supabase db pull` after establishing DB access.
- **Benefit:** `supabase db reset` now runs cleanly from scratch, enabling local development and CI schema validation.
- **Idempotency:** All migrations use `IF NOT EXISTS` guards, so running them against a prod-like schema that already has the tables is safe — they will no-op.

### Next step

Once DB access is available, run `supabase db pull` and diff the output against these migrations. Any gaps become a new `2026xxxx_schema_corrections.sql` migration.
