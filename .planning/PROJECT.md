# PROJECT.md — SellingDubai Engineering Excellence

## What This Is

SellingDubai is a production real estate marketplace SPA for Dubai agents and buyers.
This project is an **engineering excellence initiative** — systematically closing every gap
a YC technical partner or Series A due diligence process would flag.

The product is live with real agents and buyer traffic. The codebase already scores well on
security and performance. This initiative finishes the job: test coverage, CI/CD, schema
integrity, type safety, and observability.

## Core Value

**Constraint:** No regressions. Every phase must leave the product in a deployable state.
**Target:** Pass a cold technical DD without a single "we'll get to that" answer.

## Requirements

### Validated (must deliver)
- Integration tests for every edge function that touches money or the acquisition funnel
- CI/CD pipeline that blocks merges when tests or build checks fail
- Complete, reproducible schema migration history
- Post-deploy smoke tests that verify critical paths after every deployment
- TypeScript for all client-side JavaScript modules
- Error handling helpers that reduce catch-block concentration
- Structured Sentry error context with release tracking
- Load test baselines for critical edge functions

### Active Constraints
- Performance budget: init.bundle.js ≤ 30KB (currently 26.1KB)
- No new third-party scripts without justification in DECISIONS.md
- Every new edge function test must mirror the send-magic-link pattern (Deno, real Supabase calls)
- No unsafe-inline in script-src (achieved — do not regress)
- Tests must run in < 60 seconds total (keep CI fast)

### Out of Scope
- New product features
- UI redesign
- New edge functions (unless needed for testing infrastructure)
- Database migrations that alter existing prod schema columns

## Key Decisions

| Date | Decision | Outcome |
|------|----------|---------|
| 2026-04-03 | CSP unsafe-inline removed from script-src | Completed — all inline handlers migrated to event-delegation.js |
| 2026-04-03 | Start YC excellence initiative | This project |
| 2026-03-27 | app.js → 32 ES modules | 82% JS reduction, Lighthouse 56→82 |
| 2026-03-29 | BILLING_LIVE=false by default | Billing gate prevents accidental Stripe activation |

## Team Context

Solo / small team moving fast. Every automation added here directly reduces the cognitive
load of shipping safely at speed.
