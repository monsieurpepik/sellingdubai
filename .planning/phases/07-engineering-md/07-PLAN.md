---
phase: 07-engineering-md
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - ENGINEERING.md
autonomous: true
requirements:
  - ENGMD-01
  - ENGMD-02
  - ENGMD-03
  - ENGMD-04
  - ENGMD-05

must_haves:
  truths:
    - "A reviewer can read ENGINEERING.md in ≤ 20 minutes and get every DD question answered"
    - "Every factual claim links to a checkable artifact (SCHEMA.md, SLO.md, LOAD-TEST-RESULTS.md, DECISIONS.md)"
    - "The architecture ASCII diagram is accurate to the live system"
    - "Local dev setup instructions reproduce the environment from scratch"
    - "Every DD checklist question maps to a specific section"
  artifacts:
    - path: "ENGINEERING.md"
      provides: "Complete DD-ready engineering document"
      min_lines: 200
  key_links:
    - from: "ENGINEERING.md"
      to: "supabase/SCHEMA.md"
      via: "cross-reference link"
    - from: "ENGINEERING.md"
      to: "SLO.md"
      via: "cross-reference link"
    - from: "ENGINEERING.md"
      to: "LOAD-TEST-RESULTS.md"
      via: "cross-reference link"
    - from: "ENGINEERING.md"
      to: "DECISIONS.md"
      via: "cross-reference link"
---

<objective>
Write ENGINEERING.md — the single document a technical due diligence reviewer
(YC partner, Series A investor, senior engineer) reads to understand the entire
engineering posture of SellingDubai in one sitting.

Purpose: Close the last DD gap. Phases 1-6 built the substance; Phase 7 documents it.
Every section points to a specific artifact so every claim is verifiable.

Output: ENGINEERING.md at project root, ≤ 2500 words, ≤ 20 minutes to read.
</objective>

<execution_context>
This plan is self-contained. Execute all tasks in order without referencing ROADMAP.md.
</execution_context>

<context>
@supabase/SCHEMA.md
@DECISIONS.md
@README.md
@netlify.toml
@.github/workflows/ci.yml
@CLAUDE.md

# Phase 6 outputs — if these files do not exist yet, use placeholders as noted in each task
# @SLO.md
# @LOAD-TEST-RESULTS.md
</context>

<tasks>

## Task 1: Gather and verify all inputs

**Files:** (read-only, no writes)
- `supabase/SCHEMA.md`
- `DECISIONS.md`
- `README.md`
- `.github/workflows/ci.yml`
- `netlify.toml`
- `SLO.md` (may not exist yet — note if missing)
- `LOAD-TEST-RESULTS.md` (may not exist yet — note if missing)

**Action:**

Read each file and extract the specific data points listed below. Record any file
that does not exist so Task 2 can insert the correct placeholder instead of a
wrong value.

Extract from `supabase/SCHEMA.md`:
- Total migration file count and date range
- Table list (names only, for the schema section)
- Which tables have RLS enabled (for security section)
- Whether `supabase db reset` passes (look for any note in the file)

Extract from `DECISIONS.md`:
- The accepted chunk-size overages and their justifications (for performance section)
- Any security-relevant decisions (CSP, RLS, HMAC)
- Migration strategy decision if present

Extract from `README.md`:
- The exact local dev commands as written
- The branch protection status checks (`Build & Test`, `E2E Tests`)
- The BILLING_LIVE gate description (verbatim)

Extract from `.github/workflows/ci.yml`:
- Job names: `ci`, `bundle-size`, `e2e`, `deploy`
- Trigger conditions (push to main, PRs)
- That `deploy` requires `ci` + `e2e` to pass

Extract from `netlify.toml`:
- CSP header location/existence (Content-Security-Policy)
- Cache-Control headers for hashed assets

Extract from `SLO.md` (if exists):
- Availability SLO percentage
- Lead capture p95 target
- Lighthouse floor
- Error rate ceiling

Extract from `LOAD-TEST-RESULTS.md` (if exists):
- p50, p95, p99 for capture-lead-v4 and send-magic-link at 50 concurrent
- Saturation point

**Verify:** Confirm you have read each file or have noted it as missing. List the
files found vs missing so Task 2 knows which values to fill vs placeholder.

**Done:** All source data is in working memory. Missing files are noted.

---

## Task 2: Write ENGINEERING.md

**Files:** `ENGINEERING.md`

**Action:**

Write ENGINEERING.md to the project root. The document must be written for a
technical audience that is unfamiliar with the codebase — assume they are a
senior engineer doing DD, not someone who built the system.

Target: 1500–2500 words, ≤ 20 minutes to read. No marketing language. Every
claim must have a verifiable source in parentheses or a cross-reference link.

Use the exact section structure below. Do not reorder or rename sections.

---

### Document structure (implement exactly)

```
# Engineering Overview — SellingDubai

> Verified profile platform for RERA-licensed real estate agents in Dubai.
> Production: sellingdubai.com · GitHub: monsieurpepik/sellingdubai
> CI badge: [![CI/CD](https://github.com/monsieurpepik/sellingdubai/actions/workflows/ci.yml/badge.svg)](...)

---

## 1. Architecture

### 1.1 System Diagram

ASCII diagram showing the full request path:

  Browser
    │
    ▼
  Netlify CDN  (static assets, 1-year immutable cache on hashed chunks)
    │
    ├──► og-injector  (Netlify edge function — OG meta tag injection for crawlers)
    │
    └──► Supabase Edge Functions  (Deno runtime, ~40 functions)
              │
              ▼
         Postgres  (Supabase managed, pjyorgedaxevxophpfib)

### 1.2 Component Roles

- **Frontend (SPA):** Vanilla HTML/CSS/TypeScript built with esbuild code splitting.
  Entry point: `dist/init.bundle.js` (< 30 KB). All non-critical features lazy-loaded
  via dynamic `import()`. No framework dependency.

- **Netlify CDN:** Hosts static assets. Cache-Control: immutable on hashed filenames.
  Also hosts the `og-injector` Netlify edge function for social sharing meta tags.

- **Supabase Edge Functions:** ~40 Deno functions handling all server-side logic —
  lead capture, auth (magic links + OTP), billing, agent management, analytics.
  Deployed independently via `supabase functions deploy`.

- **Postgres (Supabase):** Single database. 21 migration files covering all features.
  See `supabase/SCHEMA.md` for full table list and RLS audit.

- **External services:**
  - Resend — transactional email (magic links, lead notifications)
  - Stripe — subscription billing (gated by BILLING_LIVE flag)
  - Sentry — error tracking with releases and source maps
  - Google Analytics / GTM — product analytics

---

## 2. Local Dev Setup

One-command start after first-time setup:

```bash
npm run dev
```

### First-time setup (run once)

```bash
brew install supabase/tap/supabase
supabase login && supabase link --project-ref pjyorgedaxevxophpfib
supabase db pull          # pulls prod schema into supabase/migrations/
cp supabase/.env.example supabase/.env   # fill in local values
npm run dev               # starts Supabase local stack
```

In a second terminal:

```bash
supabase functions serve --env-file ./supabase/.env --no-verify-jwt
```

Local URLs after `npm run dev`:
- API: http://127.0.0.1:54321
- Studio: http://127.0.0.1:54323
- Email inbox (magic links): http://127.0.0.1:54324

**Prod guard:** `scripts/dev.sh` aborts if `supabase/.env` contains the production
`SUPABASE_URL`. Edge functions never connect to prod during local dev.

---

## 3. CI/CD Pipeline

### 3.1 Pipeline Diagram

```
Push / PR to main
       │
       ├──► [Build & Test]  pre-deploy gate (npm run check) + edge function tests (Deno)
       │          │
       │          ▼
       └──► [E2E Tests]     Playwright (chromium) against built static site
                  │
                  ▼ (main branch only, after both jobs pass)
             [Deploy]       Netlify production deploy
```

PRs additionally get: `[Bundle Size]` — posts before/after diff comment (advisory, not a required check).

### 3.2 Required Status Checks

Branch protection on `main` requires both to pass before merge:
- `Build & Test` — runs `npm run check` (build + chunk size + routing + field consistency) then all edge function tests
- `E2E Tests` — runs Playwright journey specs (buyer search, property detail, lead form, agent login)

Source: `.github/workflows/ci.yml`, README (Branch Protection section).

### 3.3 Deploy

Every push to `main` that passes CI triggers a Netlify production deploy automatically.
Edge functions are deployed separately:

```bash
supabase functions deploy <function-name> --project-ref pjyorgedaxevxophpfib
```

---

## 4. Test Strategy

### 4.1 Edge Function Integration Tests

[test count from Phase 1] test files covering the critical function surface.
All tests use `_shared/test-helpers.ts` (seedAgent, cleanupAgent, seedMagicLink,
signStripePayload) against a real local Supabase instance.

**Tested functions include:**
- `capture-lead-v4` — rate limiting, CORS, lead persistence (118 + 314 lines)
- `stripe-webhook` — HMAC signature verification, subscription state transitions (105 lines)
- `create-checkout` — Stripe session creation, auth gate (94 lines)
- `verify-magic-link` — token validation, expiry, revocation (70 lines)
- `update-agent` — field validation, auth gate (86 lines)
- `whatsapp-ingest` — OTP flow, AI description generation (80 lines)
- `send-magic-link` — delivery, rate limiting (150 lines, 9 tests)
- [additional functions from Phase 1]

**Explicitly out of scope (justified):**
- `og-injector` — Netlify edge, covered by Playwright E2E
- `prerender` — OG tag injection, covered by E2E
- `sync-rem-offplan` — scheduled job (pg_cron), no HTTP interface; mock tested
- `lead-followup-nagger` — scheduled cron, mock tested
- `debug-resend` — dev utility only, not deployed to prod
- `instagram-auth` / `tiktok-auth` — OAuth callbacks, covered by E2E

See `DECISIONS.md` for full Tier 3 justification list.

### 4.2 E2E Tests (Playwright)

Playwright runs headless (chromium) in CI after the build step:
- Buyer search and property detail
- Lead capture form submission
- Agent login (magic link flow)
- OG meta tag injection (og-injector smoke)

### 4.3 What Is Not Tested and Why

| Gap | Justification |
|-----|---------------|
| Scheduled cron jobs | No HTTP interface; logic tested via unit mocks |
| OAuth callbacks (Instagram, TikTok) | Covered by E2E; third-party auth flow |
| `debug-resend` | Dev utility only; excluded from production |

---

## 5. Schema and Migration Strategy

21 migration files in `supabase/migrations/` covering the full feature history
(timestamps 20240101–20260402). The database is reproducible from scratch:

```bash
supabase db reset && npm run test:functions
```

Logical migration boundaries:
agents → properties → leads → billing → analytics → magic_links → agencies →
off_plan_inventory → referrals → mortgages → cobrokerage → buyer_requests → enrichment

**Tables:** agents, properties, leads, events, page_events, mortgage_applications,
project_leads, mortgage_rates, waitlist, magic_links, agencies, market_rates,
developers, projects, project_units, agent_projects, buyer_requests,
cobroke_deals, agent_referrals, lead_referrals, featured_projects.

Full column definitions, indexes, and relationships: `supabase/SCHEMA.md`.

**RLS:** Enabled on all user-facing tables. Service-role-only tables (internal
analytics, cron state) use RLS off with explicit justification. Full RLS audit
in `supabase/SCHEMA.md`.

---

## 6. Billing and Stripe Setup

Billing is gated behind a feature flag in `pricing.html`:

```js
const BILLING_LIVE = false; // Set to true only when Stripe price IDs confirmed in prod
```

**Why the gate exists:** Stripe price IDs live in Netlify environment variables.
The gate prevents accidental billing UI exposure before those IDs are confirmed in
production. The flag is checked at runtime; no rebuild required to enable billing.

**Stripe integration:**
- `create-checkout` — creates Stripe Checkout session, requires valid agent JWT
- `create-portal-session` — opens Stripe billing portal for subscription management
- `stripe-webhook` — receives Stripe events, verifies HMAC signature with
  `STRIPE_WEBHOOK_SECRET`, updates `agents.stripe_subscription_status` in Postgres

**Enabling billing in production:**
1. Confirm Stripe price IDs in Netlify env vars (`STRIPE_PRICE_ID_*`)
2. Set `BILLING_LIVE = true` in `pricing.html`
3. Run end-to-end checkout test in Stripe test mode before going live

---

## 7. Security Posture

### Content Security Policy

CSP header defined in `netlify.toml`, applied to all responses. Approved third-party
origins: `browser.sentry-cdn.com`, Supabase JS CDN, Google Fonts, Google Analytics/GTM,
Facebook Pixel. No new third-party scripts without explicit `DECISIONS.md` entry.

### Row-Level Security

RLS enabled on all user-facing Postgres tables. Agents can only read and write their
own rows. Anonymous access is limited to lead submission and property browsing.
Full policy list in `supabase/SCHEMA.md`.

### Rate Limiting

`capture-lead-v4`, `capture-project-lead`, and `submit-mortgage` implement
server-side rate limiting using HMAC of `ip + RATE_LIMIT_SALT` stored in Postgres.
No reliance on client-supplied identity for rate limit keys.

### HMAC Webhook Verification

`stripe-webhook` verifies every incoming payload with `STRIPE_WEBHOOK_SECRET` using
the Stripe signature verification algorithm. Requests with invalid or missing
signatures return 400 immediately. Tested in `stripe-webhook/test.ts`.

### JWT Verification

All agent-facing edge functions verify the Supabase JWT from the `Authorization`
header before processing. Functions that accept anonymous requests (lead capture)
do not require JWT but do enforce rate limits.

### Auth Flow

Magic link auth: agent enters email → `send-magic-link` sends a signed token →
`verify-magic-link` validates token, checks expiry (magic_links table), marks token
used and sets `revoked_at` to prevent replay. OTP backup via WhatsApp (`send-otp`).
Session revocation via `revoke-session` (sets `magic_links.revoked_at`).

---

## 8. Observability

### Error Tracking (Sentry)

Sentry configured with:
- Releases tagged with git SHA on every deploy
- Source maps uploaded to Sentry (not served publicly — no `sourceMappingURL` in prod assets)
- Custom error helper `js/errors.ts`: `reportError(context, error, extras?)` — structured context attached to every capture

**Alerts configured:**
- `capture-lead-v4` error rate > 1% → Slack `#engineering`
- `stripe-webhook` signature failure → immediate Slack + email
- `send-magic-link` rate limit > 10/hour → Slack (abuse signal)
- JS error rate spike > 3x 7-day baseline → Slack

### Structured Logging

Every edge function emits a structured log on completion:

```json
{ "event": "capture_lead", "agent_id": "...", "duration_ms": 142, "status": 200, "request_id": "..." }
```

Logs are visible in Supabase Dashboard → Edge Function logs and aggregated in Sentry
performance traces.

---

## 9. Performance

### Bundle Budget

| Asset | Budget | Current | Status |
|-------|--------|---------|--------|
| `init.bundle.js` | ≤ 30 KB | ~23 KB | Within budget |
| Lazy chunks | ≤ 20 KB each | See DECISIONS.md | Accepted overages documented |

Chunks that exceed 20 KB have explicit `DECISIONS.md` entries explaining why they
cannot be split further (tight coupling, lazy-loaded so no LCP impact).

### Lighthouse

Target: ≥ 82 (Performance score on sellingdubai.com). Score improved from 56 → 82
through: esbuild code splitting (124 KB → 23 KB initial JS), CSS minification,
Netlify Image CDN transforms, async font loading with `rel="preload"`.

### Lazy Loading

All non-first-paint features use dynamic `import()`:
- Mortgage calculator — loads on first "Get Pre-Approved" click
- Property detail modal — loads on first property card tap
- Off-plan project detail — loads on first project open

`init.bundle.js` contains only the code required before interactivity.

### CI Enforcement

The `bundle-size` CI job posts a before/after bundle diff comment on every PR.
It flags any chunk crossing the budget thresholds. The `npm run check` pre-deploy
gate enforces the 30 KB `init.bundle.js` limit on every CI run.

---

## 10. Load Testing and SLOs

Load tests run with k6. Script: `scripts/load-test.sh`.
Results: `LOAD-TEST-RESULTS.md`. SLO commitments: `SLO.md`.

### SLOs

| Metric | Target | Source |
|--------|--------|--------|
| Availability | 99.9% | Netlify + Supabase SLA-backed |
| Lead capture (capture-lead-v4) p95 latency | < 800 ms | `SLO.md` |
| Page load (Lighthouse Performance) | ≥ 82 | `SLO.md` |
| Error rate | < 0.1% | `SLO.md` |

### Load Test Baselines

Ramp: 1 → 10 → 50 → 100 concurrent users, 60 seconds per stage.

| Endpoint | p50 | p95 | p99 | Error rate @ 50 concurrent |
|----------|-----|-----|-----|----------------------------|
| capture-lead-v4 | [from LOAD-TEST-RESULTS.md] | [from LOAD-TEST-RESULTS.md] | [from LOAD-TEST-RESULTS.md] | [from LOAD-TEST-RESULTS.md] |
| send-magic-link | [from LOAD-TEST-RESULTS.md] | [from LOAD-TEST-RESULTS.md] | [from LOAD-TEST-RESULTS.md] | [from LOAD-TEST-RESULTS.md] |
| manage-properties (list) | [from LOAD-TEST-RESULTS.md] | [from LOAD-TEST-RESULTS.md] | [from LOAD-TEST-RESULTS.md] | [from LOAD-TEST-RESULTS.md] |
| og-injector | [from LOAD-TEST-RESULTS.md] | [from LOAD-TEST-RESULTS.md] | [from LOAD-TEST-RESULTS.md] | [from LOAD-TEST-RESULTS.md] |

Saturation point: [from LOAD-TEST-RESULTS.md]. Full results in `LOAD-TEST-RESULTS.md`.

---

## Cross-Reference Index

| Topic | Document |
|-------|----------|
| Table definitions, RLS policies, indexes | `supabase/SCHEMA.md` |
| Architecture and performance decisions | `DECISIONS.md` |
| SLO commitments | `SLO.md` |
| Load test raw results | `LOAD-TEST-RESULTS.md` |
| Environment variables | `README.md` |
| Pre-deploy checklist | `CLAUDE.md` |
```

---

**Placeholder rules for Task 2:**

If `SLO.md` does not exist: fill the SLO table with `[from SLO.md — Phase 6 output]`
for every value.

If `LOAD-TEST-RESULTS.md` does not exist: use `[from LOAD-TEST-RESULTS.md — Phase 6 output]`
in every latency cell.

For test count: use `[test count from Phase 1 — run npm test to get current count]`
in Section 4.1 unless you can derive the actual count by counting test files in
`supabase/functions/*/test.ts`.

For the CI badge URL: use the exact badge markdown from `README.md` line 3 verbatim.

Do NOT invent numbers. If a value is not in the source files, use a placeholder.

**Verify:** `wc -w ENGINEERING.md` returns a value between 1200 and 2500.

**Done:** `ENGINEERING.md` exists at the project root with all 10 sections present,
CI badge visible, and every cross-reference pointing to a file that exists.

---

## Task 3: Verify cross-references and word count

**Files:** (read-only verification)
- `ENGINEERING.md` (just written)
- `supabase/SCHEMA.md`
- `SLO.md` (may not exist)
- `LOAD-TEST-RESULTS.md` (may not exist)
- `DECISIONS.md`

**Action:**

Run the following checks in order. Fix any failures in `ENGINEERING.md` before
marking the task done.

**Check 1 — Word count:**

```bash
wc -w /Users/bobanpepic/Desktop/sellingdubai-app/ENGINEERING.md
```

Must return 1200–2500. If over 2500, identify the longest section and trim prose
(not data tables). If under 1200, something was omitted — add the missing content.

**Check 2 — All 10 sections present:**

```bash
grep "^## " /Users/bobanpepic/Desktop/sellingdubai-app/ENGINEERING.md
```

Must show exactly:
```
## 1. Architecture
## 2. Local Dev Setup
## 3. CI/CD Pipeline
## 4. Test Strategy
## 5. Schema and Migration Strategy
## 6. Billing and Stripe Setup
## 7. Security Posture
## 8. Observability
## 9. Performance
## 10. Load Testing and SLOs
```

**Check 3 — Cross-reference files exist:**

```bash
ls /Users/bobanpepic/Desktop/sellingdubai-app/supabase/SCHEMA.md
ls /Users/bobanpepic/Desktop/sellingdubai-app/DECISIONS.md
ls /Users/bobanpepic/Desktop/sellingdubai-app/README.md
ls /Users/bobanpepic/Desktop/sellingdubai-app/SLO.md        # note if missing
ls /Users/bobanpepic/Desktop/sellingdubai-app/LOAD-TEST-RESULTS.md  # note if missing
```

For any file that does not exist, confirm that `ENGINEERING.md` uses the correct
placeholder form (`[from SLO.md — Phase 6 output]`) rather than an invented value.

**Check 4 — No invented numbers:**

Grep for any raw latency numbers that were not found in the source files:

```bash
grep -E "[0-9]+ms|[0-9]+ ms" /Users/bobanpepic/Desktop/sellingdubai-app/ENGINEERING.md
```

For each match, verify the number appears verbatim in the source document it came
from. If you cannot find the source, replace the value with a placeholder.

**Check 5 — CI badge present:**

```bash
grep "badge.svg" /Users/bobanpepic/Desktop/sellingdubai-app/ENGINEERING.md
```

Must return a line containing the badge URL from `README.md`.

**Verify:**
```bash
wc -w /Users/bobanpepic/Desktop/sellingdubai-app/ENGINEERING.md && grep -c "^## " /Users/bobanpepic/Desktop/sellingdubai-app/ENGINEERING.md
```

Must return word count in range 1200–2500 and section count of 10.

**Done:** All 5 checks pass. `ENGINEERING.md` is factually accurate and
cross-references are valid.

---

## Task 4: Final DD checklist gate

**Files:** `ENGINEERING.md` (read-only final gate)

**Action:**

Read `ENGINEERING.md` and verify that each DD question below maps to a specific
section and a verifiable answer. For each question, write the section number and
a one-sentence answer pulled directly from the document.

| DD Question | Section | Answer |
|-------------|---------|--------|
| How do you deploy? | 3.3 | ... |
| How do you test? | 4 | ... |
| How do you monitor? | 8 | ... |
| What are your SLOs? | 10 | ... |
| Can you restore from scratch? | 5 | ... |
| How do you handle auth? | 7 (Auth Flow) | ... |
| What is your security posture? | 7 | ... |
| What is your performance baseline? | 9 | ... |
| What is your test count? | 4.1 | ... |
| How do you prevent bad deploys? | 3.2 | ... |
| How do you handle billing? | 6 | ... |
| What is your schema strategy? | 5 | ... |

If any question cannot be answered from the document, go back to `ENGINEERING.md`
and add the missing content. This task does not complete until all 12 questions
are answered with a direct reference to a specific section.

**Verify:** All 12 rows in the checklist above have a non-empty Answer column.

**Done:** ENGINEERING.md answers every DD question without a reviewer needing to
open any other document first.

</tasks>

<verification>
After all tasks complete:

```bash
# Word count in range
wc -w /Users/bobanpepic/Desktop/sellingdubai-app/ENGINEERING.md

# All 10 sections present
grep -c "^## " /Users/bobanpepic/Desktop/sellingdubai-app/ENGINEERING.md

# CI badge present
grep "badge.svg" /Users/bobanpepic/Desktop/sellingdubai-app/ENGINEERING.md

# Cross-reference files exist (or are correctly placeholdered)
ls /Users/bobanpepic/Desktop/sellingdubai-app/supabase/SCHEMA.md
ls /Users/bobanpepic/Desktop/sellingdubai-app/DECISIONS.md

# ASCII architecture diagram present
grep "Netlify CDN" /Users/bobanpepic/Desktop/sellingdubai-app/ENGINEERING.md

# No section heading missing
grep "BILLING_LIVE" /Users/bobanpepic/Desktop/sellingdubai-app/ENGINEERING.md
```
</verification>

<success_criteria>
- `ENGINEERING.md` exists at project root
- Word count: 1200–2500 (≤ 20 minutes to read)
- All 10 sections present with correct headings
- CI badge from README included at top
- Architecture ASCII diagram shows: Browser → Netlify CDN → og-injector → Supabase Edge Functions → Postgres
- Every cross-reference points to a file that exists, or uses a clearly marked placeholder
- Zero invented numbers — every statistic traces to SCHEMA.md, SLO.md, LOAD-TEST-RESULTS.md, DECISIONS.md, or ci.yml
- All 12 DD checklist questions answered with a section reference
- BILLING_LIVE gate explained (what it is, why it exists, how to enable)
- Local dev setup uses verbatim commands from README/CLAUDE.md
</success_criteria>

<output>
After completion, create `.planning/phases/07-engineering-md/07-SUMMARY.md` with:
- Word count achieved
- Which source files were available vs placeholdered
- List of any DD questions that required adding content not in the original draft
- Any decisions made about structure or content that differ from this plan
</output>
