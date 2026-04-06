# Seed-A Readiness Design
**Date:** 2026-04-06
**Author:** Founder + Claude Code
**Status:** Approved — ready for implementation planning

---

## 1. Overview

This spec covers the full technical roadmap to take SellingDubai from its current state to Seed-A readiness. Three waves of work executed in sequence:

- **Wave 1 (weeks 1–4):** Staging environment + Business Metrics Dashboard
- **Wave 2 (weeks 5–12):** Zero-downtime schema normalization + Admin Dashboard
- **Wave 3 (weeks 13–24):** Code hardening, Redis rate limiting, load testing, PWA push, JS unit tests

**Constraints:**
- Zero downtime tolerance during schema migrations
- No new third-party scripts (CLAUDE.md performance budget)
- `init.bundle.js` stays under 30KB — all new JS is lazy-loaded
- All images via Netlify Image CDN transform URLs
- No new Google Fonts
- Timeline: 3–6 months, no hard deadline — do things in the correct technical order

---

## 2. Architecture Overview

### New pages
- `ops.html` — founder-only business metrics dashboard
- `admin.html` — founder-only admin operations dashboard

### New JS modules (lazy-loaded, never in init.bundle.js)
- `js/ops.js` — metrics rendering, SVG line chart, 5-min auto-refresh
- `js/admin.js` — two-panel admin UI, optimistic updates, confirmation inputs

### New edge functions
- `edge-functions/get-metrics/index.ts` — SQL aggregations for ops dashboard
- `edge-functions/get-admin-data/index.ts` — read-only admin queries
- `edge-functions/admin-action/index.ts` — write operations with audit log
- `edge-functions/send-push-notification/index.ts` — Web Push delivery (Wave 3)
- `edge-functions/update-mortgage-app/index.ts` — replaces anon RLS UPDATE (Wave 3)

### New database tables
- `agent_billing` — tier, stripe fields
- `agent_social` — social handles and tokens
- `agent_verification` — DLD number, verified status
- `agent_preferences` — calendly, webhook, notification settings
- `admin_events` — immutable audit log for all admin-action mutations
- `push_subscriptions` — Web Push endpoint + keys per agent
- `oauth_state` — short-lived CSRF state rows for Instagram/TikTok OAuth

### Security model for ops and admin
- `OPS_SECRET` environment variable (Netlify env, staging + prod)
- Page load: checks `?key=<OPS_SECRET>` query param; redirects to `404.html` if missing/wrong
- Edge calls: `Authorization: Bearer <OPS_SECRET>` header checked on every request
- No new auth system — reuses existing env var pattern

---

## 3. Wave 1 — Staging Environment + Business Metrics Dashboard

### 3.1 Service Worker Fix (ships in first Wave 1 commit)
- Bump `CACHE_VERSION`: `sd-v22` → `sd-v23`
- Replace `app.js` with `dist/init.bundle.js` in `STATIC_ASSETS`
- This resolves the known active bug where returning users receive the old monolith

### 3.2 Staging Environment
- New Supabase project: `sellingdubai-staging`
- Schema kept in sync via `supabase db push` in CI against staging project
- New Netlify site: `staging-agents.sellingdubai.ae`
- Deploys from `staging` git branch
- GitHub Actions: new `SUPABASE_URL_STAGING` + `SUPABASE_ANON_KEY_STAGING` secrets
- Existing `e2e` CI stage runs against staging, not production
- `scripts/dev.sh` updated to allow staging URL alongside local URL

### 3.3 Business Metrics Dashboard (`ops.html` + `js/ops.js`)

**Page:**
- Static `ops.html` in repo root
- Not linked from any nav element
- Added to `robots.txt` as `Disallow: /ops.html`
- Loads `js/ops.js` as a dynamic `import()` after `OPS_SECRET` check passes

**`get-metrics` edge function:**

Queries the existing `agents` and `leads` tables directly (no schema changes required in Wave 1). After Wave 2 schema normalization, only the SQL inside this function changes — `ops.html` and `ops.js` are untouched.

Metrics computed:

| Metric | Source |
|--------|--------|
| MRR | `SUM(tier_price) WHERE tier != 'free' AND active = true` |
| ARR | MRR × 12 |
| MoM growth % | agent count this month vs last month |
| Activation rate | agents with ≥1 property / total verified agents |
| Lead volume (30d) | `COUNT(*) FROM leads` grouped by day |
| Agent funnel | joined → verified → first property → first lead → paid |
| Tier breakdown | count per tier (free / pro / premium) |
| Churn | tier downgrades in last 30 days |

Response: single JSON blob. Edge function sets `Cache-Control: max-age=300` (5-min stale acceptable for ops data).

**`ops.js` behavior:**
- Calls `get-metrics` on page load
- Renders metric cards + inline SVG line chart (no chart library — stays within 30KB bundle budget)
- Auto-refreshes every 5 minutes via `setInterval`
- Error state: shows last-known data with a "stale" badge if the edge call fails

---

## 4. Wave 2 — Zero-Downtime Schema Normalization + Admin Dashboard

### 4.1 Schema Normalization

The `agents` table currently has ~282 columns. Wave 2 extracts four purpose-scoped sub-tables. **Zero downtime constraint: no column is dropped until a 2-week observation period passes with zero errors.**

**Migration sequence (repeated per sub-table):**
1. Create new sub-table (no reads or writes yet)
2. Backfill via one-time migration script (existing columns untouched)
3. Add Postgres compatibility view reconstructing the old column shape
4. Update edge functions to write to the new sub-table (reads still hit view)
5. After 2-week observation period: drop old columns from `agents`

**Sub-tables:**

| Sub-table | Columns moved |
|-----------|--------------|
| `agent_billing` | tier, tier_price, stripe_customer_id, stripe_subscription_id, billing_cycle |
| `agent_social` | instagram_handle, tiktok_handle, facebook_pixel_id, facebook_capi_token, instagram_access_token, tiktok_access_token |
| `agent_verification` | dld_number, verified, verification_date, verification_notes |
| `agent_preferences` | calendly_url, webhook_url, whatsapp_notifications, email_notifications |

**RLS on all sub-tables:** anon read blocked; service_role write only — same pattern as existing schema.

After Wave 2, `get-metrics` switches its SQL to query `agent_billing` instead of the `agents` columns. The view ensures no other consumer breaks during the transition.

### 4.2 Admin Dashboard (`admin.html` + `js/admin.js`)

Same `OPS_SECRET` protection as ops. Separate page — founder can grant ops access without exposing admin write operations.

**`get-admin-data` edge function (read-only):**
- Pending verifications (verified = false, dld_number present)
- Tier override candidates (agents with > threshold leads but on free tier)
- Recent leads with no agent response > 4 hours
- Stripe subscription status mismatches (paid in Stripe, wrong tier in DB)

**`admin-action` edge function (write operations):**

Requires `OPS_SECRET` + `action` field in request body.

| Action | Effect |
|--------|--------|
| `verify_agent` | Sets `verified = true`, `verification_date = now()` for agent ID |
| `set_tier` | Updates `agent_billing.tier`, triggers Stripe metadata sync |
| `resend_lead_notification` | Re-fires Resend email for specific lead row |
| `flag_agent` | Sets internal `flagged = true` (blocks public profile without deletion) |

All mutations write an audit row to `admin_events`: `{ actor: 'ops', action, target_id, payload, timestamp }`. Table has no RLS DELETE policy — append-only.

**`admin.js` UI:**
- Two-panel layout: left sidebar (action categories) + right (data table + action form)
- Optimistic updates with rollback on error
- Destructive actions require confirmation input: type the agent slug before submitting

---

## 5. Wave 3 — Code Hardening for Hypergrowth

### 5.1 Security Fixes

All standalone patches — no cross-dependencies. Ship at the start of Wave 3.

| Issue | Fix |
|-------|-----|
| `lead-followup-nagger` cron bypass | Invert guard: `if (!cronSecret) return 401` — misconfigured = closed |
| `mortgage_applications` anon UPDATE RLS | Drop anon UPDATE policy; new `update-mortgage-app` edge function validates `application_secret` returned at INSERT time |
| Instagram OAuth CSRF | Store `state` in `oauth_state` table (TTL 10 min); validate server-side on callback |
| WhatsApp ingest partial phone match | Require exact full-number match; reject on no exact match |
| `send-magic-link` global rate limit | Per-email primary limit; global cap raised to 500/15min as DoS ceiling only |

### 5.2 Rate Limiting Upgrade (Upstash Redis)

Current in-DB rate limiting hits PostgreSQL on every request — degrades under load. Replace with Upstash Redis for all rate-limited edge functions.

**Affected functions:** `send-magic-link`, `verify-magic-link`, `capture-lead-v4`, `admin-action`, `get-metrics`

**Pattern:**
```typescript
const key = `rl:${functionName}:${identifier}`
await redis.incr(key)        // atomic increment
await redis.expire(key, 900) // 15-min TTL
```

**New env vars:** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (staging + prod)

Existing in-DB rate limit tables retained as audit log only — no longer in the hot path.

### 5.3 Load Testing (k6)

100 VU sustained runs against staging before any Wave 3 item touches production.

**Test scenarios:**
```
k6 run --vus 100 --duration 5m tests/load/agent-profile.js
k6 run --vus 100 --duration 5m tests/load/capture-lead.js
k6 run --vus 50  --duration 5m tests/load/get-metrics.js
```

**SLO pass criteria:**
- p95 response time < 400ms for agent profile load
- p95 < 800ms for `capture-lead-v4`
- Error rate < 0.1% across all scenarios

Results written to `tests/load/results/` and committed to git. CI blocks deploy if k6 exits non-zero.

### 5.4 PWA Lead Notifications (Web Push)

Adds Web Push as a second lead notification channel alongside existing Resend email.

- `manifest.json` already partially in place — complete it
- `sw.js` push event handler added
- New `send-push-notification` edge function called fire-and-forget from `capture-lead-v4` after the Resend email
- Agent push subscription stored in `push_subscriptions` table: `{ agent_id, endpoint, keys }`
- Opt-in toggle in `edit.html` — one new boolean field in `agent_preferences`
- **New env vars:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (staging + prod)

### 5.5 JS Unit Tests

Four modules with zero test coverage get Vitest unit tests. Target: 80% branch coverage on each.

| Module | What's tested |
|--------|---------------|
| `js/mortgage.js` | Interest math accuracy, edge cases (0% rate, max term) |
| `js/filters.js` | Price range, bed count, property type combinations, empty results |
| `js/properties.js` | Card rendering, price formatting with `Number()` coercion |
| `js/state.js` | Setter/getter consistency, stale read prevention |

Tests live in `tests/unit/`. Added to GitHub Actions as a pre-deploy gate (runs before the bundle-size check).

---

## 6. Key Dependencies and Sequencing

```
Wave 1: staging env → service worker fix → get-metrics edge fn → ops.html
         (no code changes to production until staging is validated)

Wave 2: sub-table creation → backfill → compatibility views → write migration
         → 2-week observation → column deprecation → admin dashboard
         (admin dashboard can be built in parallel with observation period)

Wave 3: security fixes → Redis rate limiting → k6 load tests → PWA push → JS unit tests
         (security fixes have no dependencies; ship them immediately)
```

Wave 2 cannot start until Wave 1 staging env is operational — all Wave 2 migration scripts run against staging first.

Wave 3 security fixes are independent — they can be cherry-picked to production at any time without waiting for the full Wave 3 to complete.

---

## 7. Files Added or Modified

**New files:**
- `ops.html`
- `admin.html`
- `js/ops.js`
- `js/admin.js`
- `edge-functions/get-metrics/index.ts`
- `edge-functions/get-admin-data/index.ts`
- `edge-functions/admin-action/index.ts`
- `edge-functions/send-push-notification/index.ts`
- `edge-functions/update-mortgage-app/index.ts`
- `sql/agent_billing.sql`
- `sql/agent_social.sql`
- `sql/agent_verification.sql`
- `sql/agent_preferences.sql`
- `sql/admin_events.sql`
- `sql/push_subscriptions.sql`
- `sql/oauth_state.sql`
- `tests/load/agent-profile.js`
- `tests/load/capture-lead.js`
- `tests/load/get-metrics.js`
- `tests/unit/mortgage.test.js`
- `tests/unit/filters.test.js`
- `tests/unit/properties.test.js`
- `tests/unit/state.test.js`

**Modified files:**
- `sw.js` — CACHE_VERSION bump, STATIC_ASSETS fix, push handler
- `edge-functions/lead-followup-nagger/index.ts` — cron secret guard inversion
- `edge-functions/whatsapp-ingest/index.ts` — exact phone match, wildcard CORS fix
- `edge-functions/instagram-auth/index.ts` — server-side state validation
- `edge-functions/send-magic-link/index.ts` — rate limit restructure
- `edge-functions/capture-lead-v4/index.ts` — Redis rate limit, push notification trigger
- `edit.html` — push opt-in toggle
- `robots.txt` — disallow /ops.html, /admin.html
- `scripts/dev.sh` — staging URL allowlist
- `.github/workflows/` — staging env secrets, k6 gate, Vitest gate

---

*Spec approved: 2026-04-06*
