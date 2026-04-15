# NEXT-SESSION.md — SellingDubai

**Last updated:** 2026-04-15
**Session completed:** 15-day plan to first revenue — all 8 phases done

---

## What Was Done This Session

| Phase | Status | Commit |
|-------|--------|--------|
| 1 | Remove Siri UI + cobroke from nav | prior session |
| 2 | WhatsApp profile photo Netlify CDN URL fix + onboarding photo prompt | `cb16dae` |
| 3 | `get-agent-context` internal edge function | `de37703` |
| 4 | `rami-daily-digest` edge function + pg_cron at 05:00 UTC | `10f5ac7` |
| 5 | Verified C4/C2 resolved; C3 also already fixed; updated CONCERNS.md | `fadf7f8` |
| 6 | Verified structured logging on all 5 target functions (no-op — all already done) | — |
| 7 | Verified PRIVACY.md + privacy.html links exist (no-op — already done) | — |
| 8 | Simplified pre-deploy-check.sh to 3 named gates (added Gate 3: edge function coverage) | `fde26a5` |

**Deployed:** `whatsapp-ingest`, `get-agent-context`, `rami-daily-digest`, `lead-quality-followup`, `weekly-performance-report`
**Cron migration applied:** `rami-daily-digest` runs daily at 05:00 UTC (09:00 Dubai)

---

## Open Concerns (from CONCERNS.md)

| ID | Issue | Priority |
|----|-------|----------|
| C8 | `stripe-webhook`: 0-row update on unknown agent returns 200 (silently dropped) | Monitor/alert; low urgency |
| C9 | `js/properties.ts`: `retryProperties` button has no handler wired in `init.ts` | Fix before error state is customer-visible |

---

## What to Do Next Session

### Priority 1 — Revenue gate: Stripe billing go-live
- Set `BILLING_LIVE = true` in `pricing.html` once Stripe price IDs are confirmed in production env vars
- Verify `STRIPE_PRO_PRICE_ID` and `STRIPE_ELITE_PRICE_ID` are set as Supabase secrets
- Test one real Stripe checkout end-to-end in production (use test card first)
- Monitor `stripe-webhook` logs for any 0-row update alerts (C8)

### Priority 2 — C9: Wire `retryProperties` button
- `js/properties.ts` renders a `data-action="retryProperties"` button in the error state
- No handler exists in `init.ts` — button does nothing on click
- Fix: add event delegation in `init.ts` to call `loadProperties(agent.id)` on click

### Priority 3 — C8: Stripe 0-row update alert
- After each `supabase.from("agents").update(...)` in `stripe-webhook`, add `{ count: "exact" }` check
- If `count === 0`, log a Sentry critical alert (don't return 500 — Stripe retry won't help for deleted agents)

### Priority 4 — Load testing & SLOs (Phase 6 from original plan)
- Establish baseline: P95 response time for `capture-lead-v4` under 500ms
- Define SLO targets for `whatsapp-ingest` (webhook ack < 200ms)

---

## Env Vars to Confirm Before Billing Launch

These must be set in Supabase project secrets (`supabase secrets set`):

| Secret | Status |
|--------|--------|
| `STRIPE_PRO_PRICE_ID` | Confirm set |
| `STRIPE_ELITE_PRICE_ID` | Confirm set |
| `STRIPE_WEBHOOK_SECRET` | Confirm set |
| `WHATSAPP_ACCESS_TOKEN` | Should be set |
| `WHATSAPP_PHONE_NUMBER_ID` | Should be set |
| `RESEND_API_KEY` | Should be set |

---

## Session Start Protocol (reminder)

Before touching any file:
1. Read `CLAUDE.md`
2. Read `DECISIONS.md`
3. Read `CONCERNS.md`
4. State what you're about to change
