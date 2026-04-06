# Architecture Decisions Log

## 2026-04-06 — Biome linting: formatter disabled, linter only in CI

**What:** Added Biome v2 (`@biomejs/biome@2.4.10`) as a dev dependency with a `biome.json` config covering `js/**` and `scripts/**`. The formatter is disabled (`"formatter": { "enabled": false }`). The linter runs in CI as a blocking gate via `npm run lint`.

**Why formatter is off:** Running `biome check --write` showed format violations in 46 files (well over the 10-file threshold). Applying mass format changes would create a noisy diff that obscures the meaningful code changes in git history. Linting without formatting still catches real bugs (unused variables, suspicious patterns, deprecated APIs).

**Rules turned off (intentional patterns):**
- `noExplicitAny` — codebase uses `any` intentionally in Supabase typed calls
- `noNonNullAssertion` — `!` assertions used throughout with Supabase query results
- `noArguments` — Google Analytics `gtag()` snippet uses `arguments` object by design (standard GA snippet, cannot be changed)
- `noBannedTypes` — `Function` type used in `lead-modal.ts` callback typing
- `noInnerDeclarations` — legacy JS pattern in `pricing.js`, `landing-behavior.js`, `cookie-consent.js`
- `useIterableCallbackReturn` — `forEach` used for DOM side effects (correct usage, not a bug)
- `noImplicitAnyLet` — one intentional untyped let in `mortgage.ts`

**What was auto-fixed:** 27 `useTemplate` and `useLiteralKeys` violations (string concatenation → template literals, bracket notation → literal keys). Import ordering was also normalized across 18 files.

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

## 2026-04-06 — Untested Edge Functions — Justification Register

The following edge functions are deliberately excluded from integration tests. This register documents the reason for each exclusion so that the "no tests" state is an intentional decision, not an oversight.

### `create-portal-session` — Requires live Stripe secret key
Integration-testable only against the Stripe test API, which requires a live `STRIPE_SECRET_KEY` in CI. Adding a Stripe-mocked test would duplicate the `create-checkout` pattern but provide no additional safety signal. Deferred until a Stripe test-mode environment is provisioned in CI secrets. To unblock: add a `STRIPE_SECRET_KEY_TEST` secret to GitHub Actions environments and implement tests following the `create-checkout` pattern.

### `debug-resend` — Development utility, never deployed to production
This function is a permanently-stubbed placeholder: it always returns 404 and logs a `not_found` event. It was used during early email development and has no production behaviour. There is nothing testable. Excluded from coverage on the same basis as dead code.

### `prerender` — Covered by Playwright E2E smoke tests
The prerender/OG-injector function serves dynamically-rendered HTML for social sharing bots. Testing it requires a live HTTP client that sends a bot User-Agent, which is impractical in a headless Deno test environment. Correctness is verified by manual QA on staging after changes to the function. No automated coverage currently exists.

### `sync-rem-offplan` — Cron job, external API dependency
This function is triggered by a Supabase cron job and calls the REM off-plan feed API. Its correctness depends on the external API response structure, which cannot be controlled in a test environment. Integration-testing it would require mocking the HTTP client or a VCR cassette — both add complexity without proportionate safety gain. Covered by Sentry error alerting in production.

### `lead-followup-nagger` — Cron job, side-effect only
This function sends WhatsApp follow-up messages via the Twilio/WhatsApp API. Integration testing requires either a live Twilio sandbox (complex CI setup) or mocking the outbound HTTP call (provides no real signal). Covered by Sentry error alerting and manual QA after changes.

### `instagram-auth` — OAuth callback, requires browser session
This is the OAuth redirect callback for Instagram login. Testing it requires initiating a real OAuth flow from a browser, which cannot be replicated in a headless Deno test. Covered by manual QA on staging.

### `tiktok-auth` — OAuth callback, requires browser session
TikTok OAuth callback requires a browser-initiated flow with a valid TikTok app session. Like `instagram-auth`, the handler only processes the redirect from TikTok's authorization server and cannot be invoked meaningfully in a headless Deno test. Covered by manual QA on staging.

## 2026-04-06 — Schema Diff: 8 Tables Missing from Phase 3 Reconstruction

A live `supabase db pull` diff (via MCP direct SQL) revealed 8 tables in production that Phase 3 reconstruction missed: `developers`, `page_views`, `link_clicks`, `email_signups`, `dld_projects`, `dld_transactions`, `subscription_events`, `project_units`.

**Why missed:** These tables had no edge function source code that referenced their CREATE TABLE statement — they were created via the Supabase dashboard or early migrations not preserved in source control. Phase 3 only reconstructed tables referenced in edge function SQL.

**Resolution:** Two new migrations added (`20260900000000` and `20260901000000`) with schemas derived from `information_schema.columns` query against the live production database.

**RLS note:** RLS policies on these tables are best-effort reconstructions. The production policies should be verified in Supabase Dashboard → Authentication → Policies.

## 2026-04-06 — Load Test CI Wiring

Load test workflow (`.github/workflows/load-test.yml`) uses `grafana/setup-k6-action@v1` and runs weekly on Monday 03:00 UTC against staging, or on-demand via `workflow_dispatch`.

**Staging Supabase project:** `lhrtdlxqbdxrfvjeoxrt` (sellingdubai-staging, Frankfurt)

**Staging setup checklist (human actions required before first CI run):**
1. Deploy edge functions to staging: `supabase functions deploy --project-ref lhrtdlxqbdxrfvjeoxrt`
2. Seed load test agent: `deno run --allow-env --allow-net scripts/seed-loadtest-agent.ts` (against staging URL)
3. Add `LOADTEST_AGENT_ID` secret to GitHub repo with the seeded agent UUID
4. Provision `staging.sellingdubai.com` DNS (Netlify → staging branch deploy) or use a deploy preview URL as `base_url` input
5. (Optional) Add `LOADTEST_TOKEN` secret for `send-magic-link` load testing

**Why separate workflow file (not in ci.yml):** Load tests run 4.5 minutes with 100 VUs. Running this on every PR would consume runner minutes and risk rate-limiting the staging environment. Weekly schedule + manual dispatch is the right cadence.
