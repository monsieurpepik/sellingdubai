# Service Level Objectives — SellingDubai

**Version:** 1.0
**Effective date:** 2026-04-05
**Owner:** Engineering
**Review cadence:** Quarterly, or after any incident that breaches an SLO

---

## Why SLOs exist

We make explicit commitments about system behaviour so that product and business decisions
are based on facts, not optimism. Each SLO is backed by evidence (vendor SLA or load test
baseline) and is monitored via Sentry alerts.

---

## Availability

| Service | Target | Basis |
|---------|--------|-------|
| Frontend (Netlify) | 99.99% / month | [Netlify SLA](https://www.netlify.com/legal/terms-of-service/) — 99.99% uptime guarantee |
| API / Edge functions (Supabase) | 99.9% / month | [Supabase SLA](https://supabase.com/sla) — 99.9% uptime for Pro plan |
| Composite availability (both up) | 99.89% / month | 99.99% × 99.9% |

**Allowed downtime at 99.9%:** ~43.8 minutes per month
**Measurement:** Netlify and Supabase status pages + Sentry uptime monitors

---

## Latency

| Endpoint | Metric | Target | Basis |
|----------|--------|--------|-------|
| `capture-lead-v4` | p95 response time | < 800ms | Load test baseline + YC DD expectation for lead funnel |
| `send-magic-link` | p95 response time | < 1000ms | Load test baseline |
| `manage-properties` list | p95 response time | < 1000ms | Load test baseline |
| `og-injector` | p95 response time | < 1000ms | Netlify edge function, measured in load test |
| Page load (Lighthouse) | Performance score | ≥ 80 | Current baseline ~82; regression alert at < 80 |

**Measurement:** k6 load test results committed to `LOAD-TEST-RESULTS.md`; re-run before each release.

---

## Error rate

| Endpoint | Metric | Target |
|----------|--------|--------|
| `capture-lead-v4` | 5xx error rate | < 0.1% in production |
| `send-magic-link` | 5xx error rate | < 0.1% (429s excluded — expected rate limiting) |
| All edge functions (aggregate) | 5xx error rate | < 0.1% |

**Measurement:** Sentry error rate alert for `capture-lead-v4` at > 1% triggers Slack `#engineering`
(threshold intentionally 10× looser than SLO target to avoid false positives from transient spikes).

---

## Monitoring and alerting

| SLO | Alert | Threshold | Channel |
|-----|-------|-----------|---------|
| capture-lead-v4 error rate > 1% | Sentry issue alert: error count > 1% in 5-min window (configured in Phase 5) | > 1% errors in any 5-minute window | Slack `#engineering` |
| send-magic-link rate limit > 10/hour | Sentry issue alert: rate_limited tag > 10/hour (Phase 5) | > 10 rate_limit_exceeded events per hour | Slack `#engineering` |
| stripe-webhook signature failure | Sentry issue alert (Phase 5) — immediate, zero tolerance | Any single occurrence | Slack + email |
| JS error rate > 3× 7-day baseline | Sentry metric alert (Phase 5) | count() > baseline × 3 (floor: 20/hr) | Slack `#engineering` |
| Lighthouse score < 80 | CI Lighthouse job (Phase 2) | Score < 80 | PR comment |

---

## SLO breach procedure

1. **Detect:** Sentry alert fires (< 5 min via real-time alerting).
2. **Triage:** On-call engineer reads Sentry breadcrumbs and structured logs.
3. **Declare incident:** If breach lasts > 15 minutes, post to Slack `#incidents`.
4. **Mitigate:** Roll back deploy or toggle feature flag.
5. **Post-mortem:** Written within 48 hours; DECISIONS.md updated with root cause.

---

## Out of scope

- Database query latency (internal to Supabase, not user-visible independently)
- Third-party services (Resend email delivery, Stripe processing time) — these have their own SLAs
- WhatsApp OTP delivery (Twilio SLA applies; we alert on send errors, not delivery time)

---

## References

- Load test results: `LOAD-TEST-RESULTS.md`
- Netlify uptime: https://www.netlifystatus.com
- Supabase uptime: https://status.supabase.com
- Sentry dashboard: https://sentry.io/organizations/<org>/alerts/
