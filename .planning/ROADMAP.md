# ROADMAP.md — SellingDubai YC Engineering Excellence

## Goal

Pass a cold technical due diligence by a YC partner or Series A investor
without a single "we'll get to that" answer on engineering quality.

## Actual Baseline (post-audit correction)

The first audit overstated the gaps. Actual state:

**Already done:**
- CI/CD pipeline exists (`.github/workflows/ci.yml`) — build + tests + deploy
- stripe-webhook: `test.ts` exists (105 lines) ✓
- create-checkout: `test.ts` exists (94 lines) ✓
- capture-lead-v4: `test.ts` exists (118 lines) + `index.test.ts` (314 lines) ✓
- verify-magic-link: `test.ts` exists (70 lines) ✓
- update-agent: `test.ts` exists (86 lines) ✓
- whatsapp-ingest: `test.ts` exists (80 lines) ✓
- `_shared/test-helpers.ts` with seedAgent, cleanupAgent, seedMagicLink, signStripePayload

**Real gaps:**
- `send-magic-link/index.test.ts` (150 lines, 9 tests) exists but **NOT picked up by CI** (glob is `*/test.ts`, not `*/index.test.ts`)
- 33 edge functions have zero tests — including verify-broker, create-agent, send-otp, manage-properties, upload-image, submit-mortgage
- 1 migration file — schema not reproducible from scratch
- CI doesn't run E2E (Playwright exists but not wired)
- CI has no bundle size PR comment
- No post-deploy smoke tests
- Client JS is vanilla (31 files, not TypeScript)
- Error handling concentrated (dashboard.js: 17, edit.js: 18 catch blocks)
- Sentry not fully configured (no releases, no source maps upload)
- No load testing

## Success Criteria (top-level)

- [ ] All 40 edge functions have integration tests or are explicitly justified as not needing them
- [ ] send-magic-link tests run in CI
- [ ] CI runs build + integration tests + E2E on every PR, blocks merge on failure
- [ ] CI posts bundle size diff as PR comment
- [ ] Schema migrations are complete and reproducible from scratch
- [ ] Post-deploy smoke tests run after every production deploy
- [ ] All 31 client JS modules converted to TypeScript
- [ ] No file with >5 catch blocks (error helper extracted)
- [ ] Sentry configured with releases, source maps, and custom alerts
- [ ] Load test baselines documented for critical edge functions
- [ ] ENGINEERING.md complete — DD-ready document

---

## Phase 1 — Test Coverage: Fill the Gaps

**Goal:** Every function that touches money, auth, or the acquisition funnel has integration tests.
Fix the send-magic-link CI miss. Add tests for the 33 untested functions, prioritised by risk.

**Why first:** Some critical paths (verify-broker, create-agent, send-otp, manage-properties)
have zero tests. These are the paths that break silently.

### Priority Tiers

**Tier 1 — Critical (must test, blocks everything else):**
1. Fix `send-magic-link` — rename `index.test.ts` → `test.ts` so CI picks it up
2. `verify-broker` — DLD verification is the gate to agent onboarding; any regression kills signups
3. `create-agent` — agent creation on successful verification; duplicate handling, field validation
4. `send-otp` — WhatsApp OTP delivery (join.html step 2); OTP expiry, resend limits
5. `verify-magic-link` — already has test.ts (70 lines), but review for coverage gaps
6. `manage-properties` — CRUD for listings; auth gate, field validation, image URL enforcement

**Tier 2 — High value:**
7. `upload-image` — image storage; file type validation, size limits, CDN URL enforcement
8. `submit-mortgage` — mortgage lead submission to broker
9. `get-analytics` — agent analytics; auth gate, date range validation
10. `manage-agency` — agency CRUD; membership, permissions
11. `update-lead-status` — lead management; valid transitions, auth
12. `capture-project-lead` — off-plan project lead capture (separate from capture-lead-v4)

**Tier 3 — Complete the picture:**
13. `revoke-session` — logout; token invalidation
14. `export-leads` — CSV export; auth, format validation
15. `refer-lead` / `track-referral` / `manage-referral` — referral tracking integrity
16. `cobroke-request` / `cobroke-listings` / `manage-cobroke` — co-brokerage flows
17. `post-buyer-request` — buyer inquiry
18. `log-event` — event tracking (lightweight, but should verify no data leak)
19. `agency-stats` / `weekly-stats` — stats endpoints; auth gate
20. `notify-mortgage-lead` — email notification on mortgage lead

**Explicitly out of scope (justified):**
- `og-injector` — Netlify edge function, tested via Playwright E2E
- `prerender` — OG tag injection, covered by E2E
- `sync-rem-offplan` — scheduled job, no HTTP interface to test
- `lead-followup-nagger` — scheduled cron, test with mock
- `debug-resend` — dev utility only
- `instagram-auth` / `tiktok-auth` — OAuth callbacks, tested via E2E flow
- `fetch-eibor` — external data fetch, test that it falls back gracefully

### Deliverables
- All Tier 1 + Tier 2 functions have `test.ts`
- All test files follow `_shared/test-helpers.ts` pattern (seedAgent, cleanup, real Supabase)
- `npm run test:functions` passes all 20+ test files
- DECISIONS.md updated with Tier 3 justifications

---

## Phase 2 — CI/CD Hardening

**Goal:** CI is the single source of truth. No broken code, no bundle regressions,
no skipped tests can reach production.

**Why second:** Phase 1 adds tests. Phase 2 makes them mandatory and visible.

### Deliverables
1. **Fix CI test glob** — update `npm run test:functions` to also pick up `*/index.test.ts`
   (or standardise all test files to `test.ts`)
2. **Bundle size PR comment** — CI job posts before/after bundle size diff on every PR
   - Shows init.bundle.js delta, flags any chunk that crosses 20KB
3. **E2E in CI** — Playwright runs headless against Netlify deploy preview URL
   - Runs after deploy-preview is created
   - Tests: buyer search, property detail, lead form, agent login
4. **Post-deploy smoke tests** — lightweight script that hits live endpoints after deploy
   - Checks: og-injector returns 200, capture-lead-v4 returns 405 on GET, static assets load
5. **Branch protection** — document the required status checks in README
   (`ci/Build & Test` must pass, `ci/E2E` must pass before merge)
6. **CI badge** in README

---

## Phase 3 — Schema & Data Integrity

**Goal:** The database is reproducible from scratch. Every table's access control is documented.

**Why third:** DD will ask "can we restore your database?" The answer must be "yes, one command."
Currently: 1 migration file. Schema was built directly in Supabase Studio.

### Deliverables
1. **Full migration history** reconstructed from prod schema
   - `supabase db pull` → split into logical migrations
   - One migration per feature boundary: agents, properties, leads, billing, analytics,
     magic_links, agency, off_plan, referrals, mortgages
   - Each migration tested: `supabase db reset` passes cleanly
2. **RLS audit** — document every table:
   - Tables with RLS enabled + policy summary
   - Tables without RLS: explicitly justified (service-role-only, no user-facing access)
3. **`supabase/SCHEMA.md`** — tables, columns, indexes, relationships, RLS summary
4. `supabase db reset && npm run test:functions` must pass end-to-end
5. DECISIONS.md entry on migration strategy

---

## Phase 4 — TypeScript Migration (Client) [COMPLETE — 2026-04-05]

**Goal:** All 31 client JS modules typed. Edge functions are already TypeScript;
client code must match.

### Deliverables
1. [x] `tsconfig.json` configured for ES modules, strict mode (+ noUncheckedIndexedAccess, exactOptionalPropertyTypes)
2. [x] All Category A `js/*.js` → `js/*.ts` (18 esbuild-bundled modules)
3. [x] Supabase-generated types committed to `types/supabase.ts`
4. [x] esbuild pipeline updated to compile TypeScript (3 entry points: init.ts, agency-page.ts, event-delegation.ts)
5. [x] Zero `@ts-ignore` suppressions (`tsc --noEmit` clean)
6. [x] `npm run typecheck` script added to package.json
7. [x] Type coverage >= 95%; documented in ENGINEERING.md
8. [x] Category B IIFE scripts: `// @ts-check` + JSDoc on 12 files

---

## Phase 5 — Observability & Alerting

**Goal:** When something breaks, we know in < 5 minutes with full context.

### Deliverables
1. **Sentry releases** — every deploy tags a release with git SHA
   - Source maps uploaded to Sentry (not served publicly)
   - `SENTRY_AUTH_TOKEN` in CI secrets
2. **Custom Sentry alerts:**
   - `capture-lead-v4` error rate > 1% → Slack `#engineering`
   - `stripe-webhook` signature failure → immediate Slack + email
   - `send-magic-link` rate limit > 10/hour → Slack (potential abuse)
   - JS error rate spike > 3x 7-day baseline → Slack
3. **Error handling helper** (`js/errors.ts`):
   - `reportError(context, error, extras?)` — logs + sends to Sentry with structured context
   - Replace raw catch blocks in dashboard.js (17), edit.js (18), join.js (11)
   - Goal: no file with > 5 catch blocks
4. **Edge function structured logging** — every function emits:
   `{ event, agent_id?, duration_ms, status, request_id }`
5. Sentry dashboard screenshot + alert config documented in ENGINEERING.md

---

## Phase 6 — Load Testing & SLOs

**Goal:** We know our limits. We have SLO commitments we can defend.

### Deliverables
1. **Load test script** (`scripts/load-test.sh`) using `k6`
   - Endpoints: capture-lead-v4, send-magic-link, manage-properties (list), og-injector
   - Ramp: 1 → 10 → 50 → 100 concurrent, 60s each stage
2. **Baseline results** (`LOAD-TEST-RESULTS.md`):
   - p50, p95, p99 latency per endpoint
   - Error rate at each concurrency level
   - Saturation point identified
3. **SLO document** (`SLO.md`):
   - Availability: 99.9% (Netlify + Supabase SLA backed)
   - Lead capture p95: < 800ms
   - Page load (Lighthouse): ≥ 80
   - Error rate: < 0.1%
4. Sentry alerts wired to SLOs (from Phase 5)

---

## Phase 7 — ENGINEERING.md (DD Document)

**Goal:** A single document a due diligence reviewer can read in 20 minutes
and have every engineering question answered.

This is produced incrementally throughout all phases. Final polish in Phase 7.

### Sections
- Architecture overview (SPA + edge functions + Supabase)
- Local dev setup (one command)
- CI/CD pipeline (diagram + status check requirements)
- Test strategy (integration tests per function, E2E flows, what's not tested and why)
- Schema and migration strategy
- Billing and Stripe setup (with BILLING_LIVE gate explained)
- Security posture (CSP, RLS, rate limiting, HMAC)
- Observability (Sentry, structured logging, alerts)
- Performance (bundle budget, Lighthouse, lazy loading)
- Load test baselines and SLOs

---

## Phase Summary

| # | Phase | Real Gap | DD Question Answered |
|---|-------|---------|---------------------|
| 1 | Test Coverage: Fill the Gaps | 33 functions untested | "How do you know X works?" |
| 2 | CI/CD Hardening | No E2E in CI, no bundle diff | "How do you ship safely?" |
| 3 | Schema & Data Integrity | 1 migration, no RLS docs | "Can we restore your DB?" |
| 4 | TypeScript Migration | Client JS untyped | "What's your type safety?" |
| 5 | Observability & Alerting | Sentry unconfigured | "How fast do you detect issues?" |
| 6 | Load Testing & SLOs | No scale baselines | "What are your SLOs?" |
| 7 | ENGINEERING.md | No DD-ready document | The whole thing |
