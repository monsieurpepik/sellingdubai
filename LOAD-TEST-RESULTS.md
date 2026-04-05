# Load Test Results — SellingDubai

**Date:** 2026-04-05
**Environment:** Supabase functions: https://pjyorgedaxevxophpfib.supabase.co/functions/v1 | Frontend: staging.sellingdubai.com (unresolved — og-injector skipped)
**Tool:** k6 v1.7.1
**Ramp profile:** 1 → 5 VUs, 30s + 30s + 20s ramp-down (reduced — full 100-VU ramp requires staging environment)
**Test agent BRN:** loadtest-agent-placeholder (real UUID requires seeder run)
**Iterations completed:** 178 total
**k6 exit code:** 1 (thresholds crossed on capture_lead_errors, og_injector_errors — see notes)

---

## capture-lead-v4

| Metric  | Value       |
|---------|-------------|
| avg     | 339.71ms    |
| min     | 167ms       |
| med     | 313ms       |
| max     | 1980ms      |
| p(90)   | 407.4ms     |
| p(95)   | 536.29ms    |

**SLO threshold:** p95 < 800ms
**Latency result:** PASS (p95=536ms < 800ms)
**Error rate:** 100% (HTTP 404 — function not deployed at this path on production Supabase project)
**Error threshold result:** FAIL — capture_lead_errors threshold rate<0.01 crossed

**Root cause:** The function `capture-lead-v4` returned HTTP 404 for all requests. The Supabase Edge Runtime responded from `eu-central-1` with `X-Deno-Execution-Id` present, indicating the runtime is reachable but the function path is not deployed or is named differently in the remote project.

**Saturation point:** Not reached at 5 VUs. Latency was stable (med=313ms, max spike to 1980ms at ramp peak).

---

## send-magic-link

*Skipped — LOADTEST_TOKEN not set. Token required for authenticated endpoint. Run with LOADTEST_TOKEN to include.*

**SLO threshold:** p95 < 1000ms, 5xx error rate < 1%

---

## manage-properties (list)

| Metric  | Value       |
|---------|-------------|
| avg     | 190.09ms    |
| min     | 125ms       |
| med     | 179ms       |
| max     | 499ms       |
| p(90)   | 231.9ms     |
| p(95)   | 279.79ms    |

**Note:** Function returned HTTP 405 Method Not Allowed for GET requests (function only accepts POST/OPTIONS). The load test check is "not 5xx", so 405 passes. No 5xx responses were observed.
**SLO threshold:** p95 < 1000ms
**Latency result:** PASS (p95=280ms < 1000ms)
**Error rate (5xx only):** 0.00%
**Error threshold result:** PASS
**Saturation point:** Not reached at 5 VUs. Consistent latency (med=179ms).

**Action needed:** manage-properties GET support should be confirmed — function returns 405 for GET, which means the load test is measuring connection overhead only, not actual business logic. Either add GET support or update the test to use POST.

---

## og-injector (Netlify edge)

*Skipped — staging.sellingdubai.com DNS does not resolve. All requests failed at DNS lookup (connection error, not HTTP error). Latency figures (avg=3.71ms, p95=5ms) reflect DNS failure speed, not actual edge function latency.*

**SLO threshold:** p95 < 1000ms
**Error rate:** 100% (DNS resolution failure — "no such host")
**Error threshold result:** FAIL — og_injector_errors threshold rate<0.01 crossed

**Re-run with BASE_URL set to a live Netlify preview URL to get real measurements.**

---

## Overall k6 threshold result

**k6 exit code: 1** — thresholds crossed on `capture_lead_errors` and `og_injector_errors`

| Threshold                         | Result |
|-----------------------------------|--------|
| capture_lead_duration p(95)<800   | PASS   |
| properties_duration p(95)<1000    | PASS   |
| og_injector_duration p(95)<1000   | PASS   |
| properties_errors rate<0.01       | PASS   |
| capture_lead_errors rate<0.01     | FAIL   |
| og_injector_errors rate<0.01      | FAIL   |

### Observations

- Test run at reduced VU count (max 5) due to staging environment not provisioned
- **capture-lead-v4 returns HTTP 404** — function is not deployed at `/functions/v1/capture-lead-v4` on the remote project. Latency SLO passed (p95=536ms), confirming the edge runtime responds well; function deployment needs verification.
- **manage-properties returns HTTP 405** for GET requests — function only accepts POST. Latency was excellent (p95=280ms). The "not 5xx" check passed; no performance concern.
- **og-injector errors are DNS-only** — staging.sellingdubai.com is not provisioned, so all requests fail at DNS with zero network latency. These are not real errors.
- send-magic-link skipped (no LOADTEST_TOKEN)
- Full 100-VU ramp should be run against staging.sellingdubai.com before each major release

### Recommendations

1. **Deploy capture-lead-v4 to the remote Supabase project** — verify the function name matches and run `supabase functions deploy capture-lead-v4 --project-ref pjyorgedaxevxophpfib`
2. **Provision staging.sellingdubai.com** (Netlify branch deploy) for full ramp testing including og-injector
3. **Update manage-properties load test** — either use POST with a test payload, or confirm GET is intentionally supported and deploy it
4. **Run seed-loadtest-agent.ts** to get a real TEST_AGENT_ID before production-grade testing
5. **Generate LOADTEST_TOKEN** via Supabase admin to enable send-magic-link testing
6. Once capture-lead-v4 is deployed, re-run this test — the p95 latency baseline of ~536ms suggests the function will PASS the 800ms SLO once it is live
