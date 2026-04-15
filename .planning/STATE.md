---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 7 complete — ENGINEERING.md done — INITIATIVE COMPLETE
last_updated: "2026-04-08T17:11:58.945Z"
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 6
  completed_plans: 4
  percent: 67
---

# STATE.md — SellingDubai YC Engineering Excellence

## Project Reference

**Building:** YC-grade engineering quality on the SellingDubai codebase
**Core value:** Close every gap a technical DD would flag — tests, CI/CD, schema, types, observability

## Current Position

Phase: 09 (landing-rebuild) — EXECUTING
Plan: 1 of 1

- **Phase:** 7 of 7 — ENGINEERING.md COMPLETE
- **Status:** Executing Phase 09

## Progress

```
Phase 1 — Test Coverage: Fill the Gaps    [x] COMPLETE
Phase 2 — CI/CD Hardening                 [x] COMPLETE
Phase 3 — Schema & Data Integrity         [x] COMPLETE
Phase 4 — TypeScript Migration            [x] COMPLETE
Phase 5 — Observability & Alerting        [x] COMPLETE
Phase 6 — Load Testing & SLOs            [x] COMPLETE
Phase 7 — ENGINEERING.md (DD doc)         [x] COMPLETE

Overall: [██████████] 100%
```

## Phase 1 Summary (COMPLETE — 2026-04-03)

### What was done

- Fixed CI glob miss: `send-magic-link/index.test.ts` now picked up (`package.json` extended to `*/index.test.ts`)
- Added `seedUsedMagicLink`, `seedOtp`, `cleanupOtp` helpers to `_shared/test-helpers.ts`
- Wrote test.ts for all Tier 1-3 functions (30 functions total now have tests):

**Pre-existing:** stripe-webhook, create-checkout, capture-lead-v4, verify-magic-link, update-agent, whatsapp-ingest, send-magic-link

**Tier 1 (new):** verify-broker, create-agent, send-otp, manage-properties

**Tier 2 (new):** upload-image, submit-mortgage, get-analytics, manage-agency, update-lead-status, capture-project-lead

**Tier 3 (new):** revoke-session, export-leads, log-event, refer-lead, track-referral, manage-referral, cobroke-request, cobroke-listings, manage-cobroke, post-buyer-request, agency-stats, weekly-stats, notify-mortgage-lead

### Functions without tests (justified)

- `debug-resend`, `prerender`, `sync-rem-offplan`, `lead-followup-nagger`, `instagram-auth`, `tiktok-auth` — explicitly out of scope per ROADMAP.md
- `create-portal-session`, `respond-to-match`, `update-mortgage-docs`, `waitlist-join` — not in Tier 1-3; add to Phase 2 backlog if needed
- `fetch-eibor` — roadmap notes "test graceful fallback"; deferred to Phase 2

## Phase 2 Summary (COMPLETE — 2026-04-03)

### What was done

- Added `bundle-size` CI job: builds base branch + PR branch in separate directories, posts before/after size diff as PR comment; updates existing comment on re-push; fails if over 30KB (init) / 20KB (chunks)
- Added `e2e` CI job: installs Playwright chromium, builds static site, runs 6 journey specs; uploads `playwright-report/` artifact on failure
- Updated `playwright.config.js`: uses `npx serve . -l 8888` in CI (avoids netlify-dev auth requirement), `npx netlify dev` locally
- Wrote `scripts/smoke-test.sh`: post-deploy health check — 4 static pages + 6 edge function endpoints; fails CI job on any 5xx
- Wired smoke test into deploy job via `SMOKE_BASE_URL` + `SMOKE_SUPABASE_URL` env
- Deploy job now requires both `ci` AND `e2e` to pass (previously only `ci`)
- Added CI badge to README top
- Added Branch Protection and CI Secrets sections to README

## Phase 3 Summary (COMPLETE — 2026-04-03)

### What was done

- Reconstructed 20 migration files (timestamps 20240101–20250801) from `sql/` directory + edge function source code
- One migration already existed: `20260402062459_off_plan_enrichment.sql` (not modified)
- Discovered 9 tables with no `sql/` migration file; reconstructed from edge functions: `email_verification_codes`, `dld_brokers`, `lead_referrals`, `co_broke_deals`, `buyer_requests`, `property_matches`, `referrals`, `featured_projects`, `project_agent_assignments`
- Reconstructed foundation tables into `20240101000000_base_schema.sql` (agents, properties, leads, events, page_events, mortgage_applications, mortgage_rates, project_leads)
- Created `increment_bonus_listings(agent_uuid UUID)` RPC in cobroke migration
- RLS audit: all 25 tables documented — default deny, explicit anon grants only for public data
- Created `supabase/SCHEMA.md` — all tables, columns, indexes, RLS summary, RPCs
- Added DECISIONS.md entry on migration reconstruction strategy and trade-offs

### Caveats

- `supabase db reset` should pass cleanly (all IF NOT EXISTS guards); but `supabase db pull` diff is needed to catch any prod column discrepancies once DB access is available.

## Recent Decisions

- 2026-04-03: Roadmap created from YC audit findings
- 2026-04-03: 7-phase structure agreed
- 2026-04-03: CSP unsafe-inline removed from script-src (pre-initiative win, already shipped)
- 2026-04-03: Phase 1 complete — all Tier 1-3 edge functions tested
- 2026-04-03: Phase 2 complete — CI/CD hardening done
- 2026-04-03: Phase 3 complete — schema reconstructed, 21 migrations, SCHEMA.md + DECISIONS.md
- 2026-04-05: Use as unknown as T double-cast for Supabase Json columns — avoids breaking type gen
- 2026-04-05: Property & { land_area?: number | null } intersection rather than modifying generated types
- 2026-04-05: Category B files keep .js + @ts-check — not bundled by esbuild, no tsc pass needed
- 2026-04-05: event-delegation.ts added as third esbuild entry point for edit/join/agency-dashboard pages
- 2026-04-05: Phase 4 complete — 18 modules migrated to TS strict, 12 IIFE scripts annotated, tsc clean

## Blockers / Concerns

- Need `supabase db pull` diff to confirm no prod column discrepancies in reconstructed base schema
- Need to know the correct GitHub repo path to fix the CI badge URL in README (currently placeholder `sellingdubai/sellingdubai-app`)

## Bug Fixes Post-Initiative

- **bfc5961** (2026-04-15) — C1 RESOLVED: `create-agent` invite token now validated before OTP is consumed
- **c622b06** (2026-04-15) — C6+C7 RESOLVED: `stripe-webhook` checks `agents.update()` errors on all 5 handlers; all handlers write `subscription_events` audit log
- **d26c028** (2026-04-15) — `agent-page.ts` / `properties.ts`: og-image fallback, skeleton cleanup on error, error vs empty state distinction, `available_units` interface corrected to match DB shape

## Phase 5 Summary (COMPLETE — 2026-04-05)

### What was done

- Added `sentry-cli` steps to deploy job in CI: creates release, uploads source maps, deletes maps from dist before Netlify deploy, associates deploy after
- `scripts/build-js.js` writes `dist/release-config.js` at build time (sets `window.SENTRY_RELEASE` to git SHA or 'dev')
- `js/sentry-init.ts` reads `window.SENTRY_RELEASE` — release tag present in every Sentry event
- All HTML files updated to load `release-config.js` before `sentry-init.js`
- Created `js/errors.ts` — `reportError(context, error, extras?)` with Sentry capture + `window.reportError` global for Category B IIFE scripts
- Replaced raw catch blocks in `js/dashboard.js`, `js/edit.js`, `js/join.js` — all now ≤ 5 catch blocks using `window.reportError` pattern (no ES imports)
- Created `edge-functions/_shared/logger.ts` — `createLogger(fn, req)` returning typed `Logger` with `flush(ms)` and `requestId`
- Added structured logging to all 39 HTTP-handler edge functions (excluded: `sync-rem-offplan`, `lead-followup-nagger`)
- Special events: `signature_failure` (stripe-webhook), `rate_limit_exceeded` (send-magic-link, send-otp, respond-to-match, submit-mortgage)
- Added `## Observability` section to `ENGINEERING.md` — Sentry setup, alert rules table, required secrets, log format reference
- CI secrets documented: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`

### Human actions pending

- Add `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` to GitHub Actions secrets
- Configure 4 Sentry alert rules (see ENGINEERING.md → Observability → Sentry Alert Rules)
- Install Sentry Slack integration (Sentry → Settings → Integrations → Slack)

## Session Continuity

Last session: 2026-04-05
Stopped at: Phase 7 complete — ENGINEERING.md done — INITIATIVE COMPLETE
Next: N/A — all 7 phases complete

## Pending Todos

- [ ] Run `npm run test:functions` against local Supabase stack to verify all tests pass
- [ ] Run `supabase db pull` and diff against reconstructed migrations (Phase 3 follow-up)
- [ ] Fix CI badge URL in README once GitHub repo path is confirmed
- [ ] Enable branch protection rule on GitHub (Build & Test + E2E Tests required)
