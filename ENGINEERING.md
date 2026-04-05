# Engineering Reference

## Architecture Overview

SellingDubai is a real-estate agent profile and lead-capture platform for the Dubai market. The system has three tiers: a static frontend, Supabase edge functions, and a Supabase Postgres database.

### Stack at a glance

| Tier | Technology | Hosting |
|------|-----------|---------|
| Frontend | Static SPA (HTML/CSS/TypeScript bundled by esbuild) | Netlify CDN |
| API | 41 Deno edge functions | Supabase Edge Runtime (`supabase.co/functions/v1/*`) |
| Database | Postgres with RLS | Supabase (Pro plan, `eu-central-1`) |
| Images | Netlify Image CDN transforms | `/.netlify/images?url=...` |
| OG / meta injection | Netlify edge function (`og-injector`) | Netlify Edge (`/a/*`) |

### Frontend

Static SPA — no SSR. Pages are plain `.html` files. Interactive behaviour is TypeScript compiled by esbuild into three entry-point bundles:

- `js/init.ts` — initialises the agent profile page on first load
- `js/agency-page.ts` — agency landing page
- `js/event-delegation.ts` — global UI event delegation (navigation, modals)

esbuild code-splitting generates lazy chunks in `dist/chunks/` for non-critical paths.

### Edge functions

41 Deno functions live in `edge-functions/`. They are stateless HTTP handlers deployed to `https://pjyorgedaxevxophpfib.supabase.co/functions/v1/<name>`.

Auth model:
- Public endpoints (e.g. `capture-lead-v4`, `waitlist-join`) — no auth, but rate-limited by IP hash.
- Authenticated endpoints — validate Supabase JWT from `Authorization: Bearer <token>` header.
- Admin/system operations — use the service role key server-side only; never exposed to the browser.

Two functions are invoked by the Supabase cron scheduler rather than HTTP: `sync-rem-offplan` (off-plan inventory sync) and `lead-followup-nagger` (follow-up reminders).

### Database

Supabase Postgres. 25 tables, 21 migrations, RLS enabled on every table. See `supabase/SCHEMA.md` for full column documentation.

### Third-party integrations

| Service | Purpose | Where configured |
|---------|---------|-----------------|
| Stripe | Subscription billing, checkout, portal | `create-checkout`, `stripe-webhook`, `create-portal-session` |
| Resend | Transactional email (magic links, notifications) | `send-magic-link`, `notify-mortgage-lead` |
| Twilio | WhatsApp OTP during agent sign-up | `send-otp` |
| Sentry | Frontend error monitoring + structured edge function event tracking | `js/sentry-init.ts`, `_shared/logger.ts` |
| Google Analytics / GTM | Page analytics | `js/gtag-init.js` |
| Facebook Pixel | Conversion tracking | inline in HTML |
| REM API | Off-plan inventory sync | `sync-rem-offplan` |

### ASCII architecture diagram

```
  Browser
    |
    |  HTTPS
    v
  Netlify CDN  ──────────────────────────────────────────
  (static SPA)         |                       |
    |             /a/* path             /.netlify/images
    |          og-injector            Image CDN transform
    |         (Netlify edge)               (webp, resize)
    |
    |  fetch() calls
    v
  Supabase Edge Runtime
  /functions/v1/<name>   (41 Deno functions)
    |
    |  supabase-js (service role / anon)
    v
  Supabase Postgres
  (25 tables, RLS, 21 migrations)

  External services called from edge functions:
    Stripe ──── create-checkout, stripe-webhook
    Resend ──── send-magic-link, notify-mortgage-lead
    Twilio ──── send-otp
    REM API ─── sync-rem-offplan
```

---

## Local Development

### One command to start

```bash
npm run dev   # starts Supabase local stack via scripts/dev.sh
```

### Prerequisites

- Node.js 20+
- Deno 2.x
- Supabase CLI: `brew install supabase/tap/supabase`

### First-time setup

```bash
# 1. Authenticate and link to the remote project
supabase login
supabase link --project-ref pjyorgedaxevxophpfib

# 2. Pull the production schema into supabase/migrations/
supabase db pull

# 3. Create your local env file
cp supabase/.env.example supabase/.env
# Fill in local values — do NOT use production keys here

# 4. Start the local stack
npm run dev
```

### Local URLs after `npm run dev`

| Service | URL |
|---------|-----|
| Supabase API | `http://127.0.0.1:54321` |
| Supabase Studio | `http://127.0.0.1:54323` |
| Email inbox (magic links) | `http://127.0.0.1:54324` |

### Serving edge functions locally

In a second terminal:

```bash
supabase functions serve --env-file ./supabase/.env --no-verify-jwt
```

### Production guard

`scripts/dev.sh` aborts with a fatal error if `supabase/.env` contains the production `SUPABASE_URL` (`pjyorgedaxevxophpfib.supabase.co`). This prevents accidentally running local edge functions against live production data.

### Pre-deploy gate

```bash
npm run check   # runs scripts/pre-deploy-check.sh — exits 1 if any check fails
```

Checks performed: build passes, `init.bundle.js` < 30KB, no chunk > 20KB, no raw Supabase storage URLs, no old waitlist anchors on CTAs, `BILLING_LIVE` flag status, field name consistency, no hardcoded prod URLs in edge functions.

---

## CI/CD Pipeline

Every push to `main` and every PR triggers the pipeline. Merges to `main` that pass all jobs also trigger a production deploy.

### Jobs

```
push/PR
  │
  ├─ ci (Build & Test)
  │    npm run check (build + bundle sizes + routing checks)
  │    tsc --noEmit (type check)
  │    npm test (edge function integration tests via Deno)
  │
  ├─ bundle-size (PRs only)
  │    Compares dist sizes between base and PR branches
  │    Posts table comment on the PR with delta and budget status
  │
  └─ e2e (needs: ci)
       npm run build
       npx playwright test (headless Chromium against static build)

push to main only:
  └─ deploy (needs: ci, e2e)
       npm run build (with SENTRY_RELEASE=git-sha)
       sentry-cli: create release, set commits, upload source maps
       Remove .map files from dist/
       npx netlify-cli deploy --prod
       sentry-cli: associate deploy to release
       bash scripts/smoke-test.sh (live URL health checks)
```

### Bundle size thresholds

| File | Budget |
|------|--------|
| `dist/init.bundle.js` | < 30 KB |
| Any file in `dist/chunks/` | < 20 KB |

Budget violations cause the `ci` job to fail via `npm run check`. On PRs, the `bundle-size` job also posts a before/after table comment.

### Branch protection (required before merge)

- Build & Test (`ci` job)
- E2E Tests (`e2e` job)

### Required GitHub Actions secrets

| Secret | Purpose |
|--------|---------|
| `NETLIFY_AUTH_TOKEN` | Netlify deploy auth |
| `NETLIFY_SITE_ID` | Target Netlify site |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (tests only) |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI auth |
| `BILLING_LIVE` | Controls `BILLING_LIVE` flag in pricing.html build |
| `SENTRY_AUTH_TOKEN` | Source map upload + release tagging |
| `SENTRY_ORG` | Sentry org slug |
| `SENTRY_PROJECT` | Sentry project slug |
| `SMOKE_BASE_URL` | Smoke test target (`https://sellingdubai.ae`) |
| `SMOKE_SUPABASE_URL` | Supabase URL for smoke test edge function checks |

---

## Test Strategy

### Integration tests — edge functions

~30 of 41 edge functions have integration tests. Test files live at `edge-functions/<name>/test.ts`. Tests run against the real local Supabase stack (not mocked), so they cover actual DB writes, RLS policies, and edge function logic end-to-end.

```bash
npm run test:functions   # requires local Supabase stack running (npm run dev)
```

In CI, tests run against a real Supabase project (via `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` secrets).

### Test helpers

`edge-functions/_shared/test-helpers.ts` provides seed/cleanup utilities for every test:

| Helper | Purpose |
|--------|---------|
| `seedAgent` / `cleanupAgent` | Create and tear down test agent rows |
| `seedMagicLink` / `seedUsedMagicLink` | Create valid / already-used magic link tokens |
| `seedOtp` / `cleanupOtp` | Create and tear down OTP records |
| `signStripePayload` | Build a Stripe webhook payload with valid HMAC signature |

### E2E tests

Playwright in `e2e/`. Runs headless Chromium in CI against the static build output (`npm run build`). Covers critical user flows: agent profile page render, lead capture form, OG meta injection.

### Type checking

```bash
npm run typecheck   # tsc --noEmit on all Category A TypeScript files
```

This is also run as part of `npm run check` (the pre-deploy gate) and in the `ci` job.

### What is not covered by integration tests and why

| Function | Reason excluded |
|----------|----------------|
| `og-injector` | Netlify edge function — covered by Playwright E2E |
| `prerender` | Covered by Playwright E2E |
| `sync-rem-offplan` | Supabase cron scheduler invocation; no HTTP interface to test |
| `lead-followup-nagger` | Supabase cron scheduler invocation; no HTTP interface to test |
| `debug-resend` | Dev utility only — not deployed to production |
| `instagram-auth` | OAuth callback — covered by E2E flow |
| `tiktok-auth` | OAuth callback — covered by E2E flow |

---

## Schema & Migrations

### Migration history

21 migration files in `supabase/migrations/`, applied in timestamp order from `20240101000000` (base schema) through `20260402062459` (off-plan enrichment). Every schema change goes through a migration file — no manual `ALTER TABLE` in production.

```bash
supabase db reset    # drops and re-applies all 21 migrations from scratch (reproducible)
supabase db pull     # syncs any prod schema changes back into supabase/migrations/
```

Full migration history and column-level documentation: `supabase/SCHEMA.md`

### Tables (25 total)

| Category | Tables |
|----------|--------|
| Agents & agencies | `agents`, `agencies`, `agency_memberships` |
| Properties | `properties` |
| Off-plan inventory | `developers`, `projects`, `project_units`, `agent_projects`, `featured_projects`, `project_agent_assignments`, `project_leads` |
| Leads | `leads`, `mortgage_applications` |
| Auth | `magic_links`, `email_verification_codes` |
| Payments | (billing columns on `agents`) |
| Network | `referrals`, `lead_referrals`, `co_broke_deals`, `buyer_requests`, `property_matches` |
| Analytics | `events`, `page_events` |
| Rates | `mortgage_rates`, `market_rates` |
| Misc | `waitlist`, `dld_brokers` |

### RLS policy

Default deny on all 25 tables. Public (anon) access granted only where explicitly required:

| Table | Anon access |
|-------|-------------|
| `agents` | SELECT where `is_active = true AND verification_status = 'verified'` |
| `properties` | SELECT where active and linked to verified agent |
| `mortgage_rates` | SELECT where active |
| `mortgage_applications` | INSERT only (anon UPDATE is explicitly blocked via `USING(false)`) |
| `market_rates`, `developers`, `projects`, `project_units`, `agent_projects` | SELECT |
| `waitlist` | INSERT + SELECT own row |
| All other tables | service_role only |

### RPCs

| Function | Signature | Purpose |
|----------|-----------|---------|
| `increment_bonus_listings` | `(agent_uuid UUID) RETURNS VOID` | Increments `agents.bonus_listings` by 1. Called by `manage-cobroke` and `manage-referral` on deal close. SECURITY DEFINER. |
| `set_updated_at` | `() RETURNS TRIGGER` | Generic `updated_at = now()` trigger on agents, agencies, developers, projects, project_units. |

---

## Billing & Stripe

### Integration

| Edge function | Purpose |
|---------------|---------|
| `create-checkout` | Creates a Stripe Checkout session for the selected subscription tier |
| `stripe-webhook` | Handles subscription lifecycle events (`customer.subscription.created/updated/deleted`) |
| `create-portal-session` | Creates a Stripe Customer Portal session for plan changes and cancellation |

### Subscription model

The `tier` column on the `agents` table drives feature gating: `'free'` | `'premium'`. Stripe subscription state is mirrored in `stripe_subscription_status`, `stripe_plan`, and `stripe_current_period_end` on the same row.

### BILLING_LIVE flag

`pricing.html` contains:

```javascript
const BILLING_LIVE = false;  // set to true only when Stripe price IDs are confirmed in prod env vars
```

When `false`, the pricing page renders in preview mode — no real checkout sessions are created. Flip to `true` only when:
1. Stripe price IDs are set as Netlify environment variables
2. Production Stripe keys (not test keys) are confirmed in the Supabase edge function env

The pre-deploy check (`npm run check`) reports the current `BILLING_LIVE` value as a warning if it is `true`, prompting a deliberate confirmation.

### Webhook security

`stripe-webhook` verifies the `Stripe-Signature` header using HMAC with the webhook signing secret. Any signature failure is logged as a `signature_failure` structured event (see Observability) and triggers an immediate Sentry alert.

### Test vs production keys

- Local `.env`: Stripe test keys (`sk_test_...`)
- Production: Stripe live keys set as Netlify environment variables — never committed to the repo

---

## Security Posture

### Content Security Policy

Set via `netlify.toml` `[[headers]]` for all pages (`for = "/*"`). Key directives:

| Directive | Value |
|-----------|-------|
| `script-src` | `'self'` + explicit CDN allowlist (jsDelivr, Facebook, GTM, GA, Sentry) — no `unsafe-inline` |
| `style-src` | `'self' 'unsafe-inline'` + Google Fonts (required for font loading pattern) |
| `connect-src` | `'self'` + Supabase, GA, Facebook, Sentry ingest |
| `frame-src` | Google Maps, Stripe Checkout, Stripe Billing only |
| `object-src` | `'none'` |
| `frame-ancestors` | `'none'` (prevents clickjacking) |
| `upgrade-insecure-requests` | Enabled |

Additional security headers on all pages: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security` (2-year, preload), `Cross-Origin-Opener-Policy: same-origin`.

### Row Level Security

All 25 Supabase tables have RLS enabled. Default deny. Anon grants are minimal and explicit — see Schema section for the full RLS summary table.

### Rate limiting

The following edge functions enforce per-IP rate limits in the edge function logic (IP hash stored in the database for tracking):

| Function | Limit |
|----------|-------|
| `send-magic-link` | Per-IP hourly limit |
| `send-otp` | 5/email/hour, 15/IP/hour |
| `respond-to-match` | Per-IP limit |
| `submit-mortgage` | Per-IP limit |

Rate limit breaches are logged as `rate_limit_exceeded` structured events in Sentry.

### JWT validation

All authenticated edge functions validate the Supabase JWT from the `Authorization: Bearer` header before executing any business logic. Service-role-only operations use the service key injected at runtime via `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` — it is never present in client-side JavaScript.

### HMAC verification

`stripe-webhook` validates the `Stripe-Signature` header on every inbound request using the Stripe webhook signing secret. Requests that fail signature verification are rejected with a 400 and the event is logged.

### Image security

All agent and property images are served via Netlify Image CDN transform URLs (`/.netlify/images?url=<original>&w=<width>&fm=webp&q=80`). Raw Supabase storage URLs are never rendered in the UI. The pre-deploy check enforces this rule automatically.

### Client-side credentials

`SUPABASE_ANON_KEY` is the only credential present in client JavaScript. It is the public read-only key, scoped entirely by RLS policies. No service role key, Stripe secret, or third-party API key is ever bundled into the frontend.

### Anon key rotation

The public anon key appears in two places — update both simultaneously:

1. `js/sd-config.js` — `window.SD_CONFIG.SUPABASE_ANON_KEY`
2. `js/config.ts` — `export const SUPABASE_ANON_KEY`

---

## TypeScript Setup

The project uses TypeScript 6.0.2 in strict mode for all Category A (esbuild-bundled) modules.

### Type checking

```bash
npm run typecheck   # runs tsc --noEmit — fails on any type error
```

Run this before every deploy. The `pre-deploy-check.sh` script also calls it.

### Configuration

`tsconfig.json` at repo root. Key settings:

| Setting | Value | Why |
|---|---|---|
| `strict` | `true` | Enables all strict checks |
| `noUncheckedIndexedAccess` | `true` | Array/Record access returns `T \| undefined` |
| `exactOptionalPropertyTypes` | `true` | Optional props cannot be set to `undefined` explicitly |
| `moduleResolution` | `"bundler"` | Matches esbuild's module resolution |
| `noEmit` | `true` | esbuild handles transpilation — tsc is type-check only |

### File categories

**Category A — TypeScript (esbuild-bundled):** All modules under `js/` that are entry points or imported by entry points via ES `import`. These are `.ts` files, type-checked by `tsc --noEmit` and bundled by `esbuild`.

Entry points: `js/init.ts`, `js/agency-page.ts`, `js/event-delegation.ts`

**Category B — JS with @ts-check (IIFE / standalone):** Standalone scripts loaded via `<script>` tags. These remain `.js` files but have `// @ts-check` at the top and JSDoc annotations on key variables. Checked by the TypeScript language server in editors; not part of the `tsc --noEmit` pass.

Category B files: `js/dashboard.js`, `js/edit.js`, `js/join.js`, `js/agency-dashboard.js`, `js/pricing.js`, `js/landing-behavior.js`, `js/landing-chip-anim.js`, `js/cookie-consent.js`, `js/sd-config.js`, `js/gtag-init.js`, `js/sentry-init.js`, `js/async-css.js`

### Type coverage target

**>= 95% of Category A lines are type-annotated.** The remaining ~5% are necessary `as unknown as T` double-casts for Supabase `Json` columns (facilities, nearby_locations) and partial select results that are narrower than the full generated Row type.

### Common patterns

**Supabase Json columns to typed arrays:**
```typescript
const facilities: Facility[] = Array.isArray(row.facilities) && row.facilities.length
  ? row.facilities as unknown as Facility[] : [];
```

**Columns not in generated DB types (e.g. land_area):**
```typescript
const ext = result as Property & { land_area?: number | null };
```

**Partial select result cast:**
```typescript
const agent = data as unknown as Agent;
```

**noUncheckedIndexedAccess fallbacks:**
```typescript
const icon = ICONS[key] ?? '';
const first = arr[0] ?? defaultValue;
```

**Timer types:**
```typescript
let timer: ReturnType<typeof setTimeout> | null = null;
```

**Lazy module refs:**
```typescript
let _mod: Promise<unknown> | null = null;
```

---

## Performance

### Baseline

Lighthouse Performance score: ~82 (improved from 56 before the optimisation initiative).

### Bundle budget

| File | Budget | Current |
|------|--------|---------|
| `dist/init.bundle.js` | < 30 KB | ~23 KB |
| Any `dist/chunks/*.js` | < 20 KB | — |

Both thresholds are enforced in CI via `npm run check` and the `bundle-size` PR job. Exceeding the init bundle budget requires splitting the new code into a lazy chunk.

### Lazy loading

Every module that is not required before first interactivity uses dynamic `import()`. esbuild code-splitting generates content-hashed chunks in `dist/chunks/`. Chunks receive `Cache-Control: public, max-age=31536000, immutable` (the hash changes on every build).

### Image CDN

All agent and property images are transformed at request time:

```
/.netlify/images?url=<supabase-storage-url>&w=<width>&fm=webp&q=80
```

Allowlisted remote domains in `netlify.toml` under `[images] remote_images`: Supabase storage, REM API files, Google profile photos, CloudFront.

### Fonts

- Manrope + Inter (Latin subset) — loaded async with `rel="preload" as="style" onload`
- Material Symbols icon font — single request, extended via `&icon_names=` parameter; no second icon font
- No new Google Fonts without explicit approval
- System font fallback: `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`

### Third-party scripts

Current approved scripts: Sentry CDN, Supabase JS CDN, Google Fonts, Google Analytics/GTM, Facebook Pixel. All approved in `DECISIONS.md`. No new third-party scripts without explicit approval and weight justification.

### Edge function calls on page load

All non-blocking — wrapped in `Promise.allSettled()`, never sequentially awaited. The pre-deploy check flags any direct `await fetch` or `await supabase` calls at module scope.

### Cache headers summary

| Path | Cache-Control |
|------|--------------|
| `/*.html`, `/` | `no-cache, must-revalidate` |
| `/dist/*.js` (entry bundles) | `no-cache, must-revalidate` |
| `/dist/chunks/*` (hashed) | `public, max-age=31536000, immutable` |
| `/dist/*.css` | `public, max-age=31536000, immutable` |
| `/fonts/*.woff2` | `public, max-age=31536000, immutable` |

---

## Load Testing & SLOs

### SLO commitments

Full commitments: `SLO.md`

| Metric | Endpoint | Target |
|--------|----------|--------|
| Latency p95 | `capture-lead-v4` | < 800 ms |
| Latency p95 | `send-magic-link` | < 1000 ms |
| Latency p95 | `manage-properties` (list) | < 1000 ms |
| Latency p95 | `og-injector` (Netlify edge) | < 1000 ms |
| 5xx error rate | All edge functions | < 0.1% |
| Lighthouse score | Page load | >= 80 |
| Availability | Frontend (Netlify) | 99.99% / month |
| Availability | API (Supabase) | 99.9% / month |
| Availability | Composite | 99.89% / month |

Allowed downtime at 99.9%: ~43.8 minutes per month.

### Load test baseline results

Full results: `LOAD-TEST-RESULTS.md`

| Endpoint | p95 | SLO | Result |
|----------|-----|-----|--------|
| `capture-lead-v4` | 536 ms | < 800 ms | PASS |
| `manage-properties` (list) | 280 ms | < 1000 ms | PASS |
| `og-injector` | N/A (DNS failure in test run) | < 1000 ms | — |
| `send-magic-link` | N/A (token not set in test run) | < 1000 ms | — |

Test environment: 1–5 VUs, reduced from the target 100-VU ramp (staging environment not yet provisioned). Full ramp should run against `staging.sellingdubai.com` before major releases.

### Running the load test

```bash
# Prerequisites
brew install k6

# Seed a test agent and export the ID
deno run --allow-env --allow-net scripts/seed-loadtest-agent.ts
export TEST_AGENT_ID=<uuid-from-seeder>

# Run the test
./scripts/load-test.sh
```

Production guard: the script refuses to run against the bare `sellingdubai.com` domain to prevent load testing the live site.

### SLO breach procedure

1. Sentry alert fires within 5 minutes (configured alert rules in Observability section).
2. On-call engineer reads Sentry breadcrumbs and structured edge function logs.
3. If breach lasts > 15 minutes: post to Slack `#incidents`.
4. Mitigate: roll back deploy or toggle feature flag.
5. Post-mortem written within 48 hours; `DECISIONS.md` updated with root cause.

---

## Observability

### Sentry

- **SDK:** Loaded from CDN (`browser.sentry-cdn.com`) in `js/sentry-init.ts`
- **DSN:** `https://689d6d66d9267e827b1d4129c4fe4ee8@o4511110584926208.ingest.us.sentry.io/4511110595215360`
- **Releases:** Tagged with git SHA on every production deploy via `sentry-cli` in CI
- **Source maps:** Uploaded to Sentry, then deleted from `dist/` before Netlify deploy
- **Release config:** `dist/release-config.js` written at build time; sets `window.SENTRY_RELEASE` before `sentry-init.js` loads
- **Error helper:** `js/errors.ts` → `reportError(context, error, extras?)` used in esbuild-processed modules; exposed as `window.reportError` for plain IIFE scripts (dashboard.js, edit.js, join.js)

### Sentry Alert Rules

| Alert | Trigger | Channel |
|-------|---------|---------|
| capture-lead-v4 error rate | > 1% in 5 min window | Slack `#engineering` |
| stripe-webhook signature failure | Any occurrence | Slack `#engineering` + Email |
| send-magic-link rate limit | > 10/hour | Slack `#engineering` |
| JS error rate spike | > 3× 7-day baseline | Slack `#engineering` |

Configure in: **Sentry → [project] → Alerts**

Filter tags used by alert rules:
- `tags[context]` — set by `reportError(context, ...)` in `js/errors.ts`
- `tags[event]` — set by structured edge function logs (`signature_failure`, `rate_limit_exceeded`)

### Required CI Secrets

Add these in **GitHub → Repository → Settings → Secrets → Actions**:

| Secret | Where to get it |
|--------|----------------|
| `SENTRY_AUTH_TOKEN` | Sentry → Settings → Auth Tokens → Create Internal Token (scope: `project:releases`) |
| `SENTRY_ORG` | Sentry → Settings → General → Organization Slug |
| `SENTRY_PROJECT` | Sentry → Settings → Projects → [your project] → Slug |

### Edge Function Structured Logging

Every HTTP-handler edge function (39 of 41) emits JSON-structured logs via `_shared/logger.ts`.

Excluded from logging (Supabase scheduler invocation — `request_id` is not meaningful):
- `sync-rem-offplan`
- `lead-followup-nagger`

Log format:
```json
{
  "function": "capture-lead-v4",
  "request_id": "a1b2c3d4-e5f6-...",
  "event": "lead_captured",
  "agent_id": "uuid-here",
  "status": 200,
  "duration_ms": 342,
  "timestamp": "2026-04-03T12:00:00.000Z"
}
```

Logs are visible in **Supabase Dashboard → Edge Functions → Logs**.
Filter by `event` or `request_id` for incident tracing.

Special events:
- `signature_failure` — stripe-webhook: Stripe signature verification failed (potential replay attack)
- `rate_limit_exceeded` — send-magic-link, send-otp, respond-to-match, submit-mortgage: rate limit hit
- `auth_failed` — auth token invalid or expired
- `bad_request` — malformed or missing request body fields

---

### Rotating the Supabase anon key

The public anon key appears in two places — update both simultaneously:

1. `js/sd-config.js` — `window.SD_CONFIG.SUPABASE_ANON_KEY`
2. `js/config.ts` — `export const SUPABASE_ANON_KEY`

The anon key is safe to expose (it is a public read-only key scoped by RLS policies).
