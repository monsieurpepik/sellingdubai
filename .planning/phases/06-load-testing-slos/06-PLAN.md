---
phase: 06-load-testing-slos
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/load-test.sh
  - scripts/load-test.js
  - scripts/seed-loadtest-agent.ts
  - LOAD-TEST-RESULTS.md
  - SLO.md
autonomous: true
requirements:
  - LOAD-01
  - LOAD-02
  - LOAD-03
  - LOAD-04

must_haves:
  truths:
    - "k6 runs the full ramp (1 → 10 → 50 → 100 VUs, 60s each) against staging without hitting production"
    - "All four endpoints are exercised: capture-lead-v4, send-magic-link, manage-properties list, og-injector"
    - "k6 exits with code 1 when p95 latency > 800ms or error rate > 1%"
    - "LOAD-TEST-RESULTS.md exists with p50/p95/p99 per endpoint and saturation point noted"
    - "SLO.md defines availability, latency, Lighthouse, and error-rate commitments backed by vendor SLAs"
    - "Sentry alert thresholds for capture-lead-v4 and send-magic-link reference the committed SLO values"
  artifacts:
    - path: "scripts/load-test.sh"
      provides: "Entrypoint that sets BASE_URL and invokes k6"
      contains: "BASE_URL"
    - path: "scripts/load-test.js"
      provides: "k6 test script with four scenario groups and thresholds"
      exports: ["options", "default"]
    - path: "LOAD-TEST-RESULTS.md"
      provides: "Committed baseline numbers from a real test run"
      contains: "p95"
    - path: "SLO.md"
      provides: "Signed SLO table with targets and measurement methods"
      contains: "99.9%"
  key_links:
    - from: "scripts/load-test.sh"
      to: "scripts/load-test.js"
      via: "k6 run invocation"
      pattern: "k6 run.*load-test\\.js"
    - from: "scripts/load-test.js"
      to: "capture-lead-v4 endpoint"
      via: "http.post with test body"
      pattern: "capture-lead-v4"
    - from: "SLO.md"
      to: "Supabase SLA (99.9%) and Netlify SLA (99.99%)"
      via: "vendor SLA references"
      pattern: "supabase\\.com/sla|netlify\\.com/sla"
---

<objective>
Establish measurable performance baselines for the four critical endpoints and codify them as
defended SLO commitments. A DD reviewer asking "what are your SLOs?" must be able to read one
document and get a complete, verifiable answer backed by vendor SLA links and real load test numbers.

Purpose: Convert "we think it's fast" into "p95 < 800ms, here is the evidence."
Output:
  - scripts/load-test.sh — runnable entrypoint (BASE_URL-driven, staging-safe)
  - scripts/load-test.js — k6 script, four endpoints, threshold-gated
  - LOAD-TEST-RESULTS.md — committed baseline numbers
  - SLO.md — availability, latency, Lighthouse, error-rate targets with vendor backing
</objective>

<execution_context>
Project root: /Users/bobanpepic/Desktop/sellingdubai-app
Supabase project ref: pjyorgedaxevxophpfib
Production URL: https://sellingdubai.com
Staging / load test target: https://staging.sellingdubai.com
  (If staging URL is not yet provisioned, substitute a Netlify deploy-preview URL.
   NEVER point load tests at sellingdubai.com.)
Supabase staging functions base: https://pjyorgedaxevxophpfib.supabase.co/functions/v1
  (Same project ref; staging isolation is achieved via test-agent data, not a separate project.)
k6 install: brew install k6  (or https://k6.io/docs/get-started/installation/)
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
</context>

<tasks>

## Task 1: Write the k6 load test script and shell entrypoint

**Files:**
- `scripts/load-test.js`
- `scripts/load-test.sh`

**Action:**

Create `scripts/load-test.js` with the following structure. Every detail below is required — do not omit sections.

```javascript
// scripts/load-test.js
// k6 load test — SellingDubai critical endpoints
// Run via: ./scripts/load-test.sh
// Or directly: BASE_URL=https://... SUPABASE_URL=https://... k6 run scripts/load-test.js
//
// Thresholds enforce SLOs. k6 exits 1 on breach.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// -- Custom metrics per endpoint --
const captureLeadErrors   = new Rate('capture_lead_errors');
const magicLinkErrors     = new Rate('magic_link_errors');
const propertiesErrors    = new Rate('properties_errors');
const ogInjectorErrors    = new Rate('og_injector_errors');

const captureLeadDuration   = new Trend('capture_lead_duration', true);
const magicLinkDuration     = new Trend('magic_link_duration', true);
const propertiesDuration    = new Trend('properties_duration', true);
const ogInjectorDuration    = new Trend('og_injector_duration', true);

// -- Ramp profile: 1 → 10 → 50 → 100 VUs, 60s each stage --
export const options = {
  stages: [
    { duration: '60s', target: 1   },
    { duration: '60s', target: 10  },
    { duration: '60s', target: 50  },
    { duration: '60s', target: 100 },
    { duration: '30s', target: 0   },  // cool-down
  ],
  thresholds: {
    // SLO: p95 latency < 800ms for lead capture
    'capture_lead_duration': ['p(95)<800'],
    // SLO: p95 latency < 1000ms for all other endpoints
    'magic_link_duration':   ['p(95)<1000'],
    'properties_duration':   ['p(95)<1000'],
    'og_injector_duration':  ['p(95)<1000'],
    // SLO: error rate < 1% per endpoint
    'capture_lead_errors':   ['rate<0.01'],
    'magic_link_errors':     ['rate<0.01'],
    'properties_errors':     ['rate<0.01'],
    'og_injector_errors':    ['rate<0.01'],
  },
};

// -- Config — injected via env vars from load-test.sh --
const BASE_URL      = __ENV.BASE_URL      || 'https://staging.sellingdubai.com';
const SUPABASE_URL  = __ENV.SUPABASE_URL  || 'https://pjyorgedaxevxophpfib.supabase.co/functions/v1';
const TEST_AGENT_ID = __ENV.TEST_AGENT_ID || 'loadtest-agent-uuid-placeholder';
// send-magic-link requires an authed session token for the test agent.
// Generate once via: supabase functions invoke send-magic-link --project-ref pjyorgedaxevxophpfib
// and paste the Bearer token here, or inject via LOADTEST_TOKEN env var.
const LOADTEST_TOKEN = __ENV.LOADTEST_TOKEN || '';

export default function () {
  // 1. capture-lead-v4 — POST with test lead body
  {
    const url = `${SUPABASE_URL}/capture-lead-v4`;
    const payload = JSON.stringify({
      name:     'Load Test User',
      email:    `loadtest+${Date.now()}@sellingdubai.com`,
      phone:    '+971501234567',
      agent_id: TEST_AGENT_ID,
      source:   'load-test',
    });
    const params = { headers: { 'Content-Type': 'application/json' } };
    const start = Date.now();
    const res = http.post(url, payload, params);
    captureLeadDuration.add(Date.now() - start);
    const ok = check(res, {
      'capture-lead-v4 2xx': (r) => r.status >= 200 && r.status < 300,
    });
    captureLeadErrors.add(!ok);
    sleep(0.1);
  }

  // 2. send-magic-link — POST with agent email (requires auth)
  if (LOADTEST_TOKEN) {
    const url = `${SUPABASE_URL}/send-magic-link`;
    const payload = JSON.stringify({ email: 'loadtest@sellingdubai.com' });
    const params = {
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${LOADTEST_TOKEN}`,
      },
    };
    const start = Date.now();
    const res = http.post(url, payload, params);
    magicLinkDuration.add(Date.now() - start);
    const ok = check(res, {
      'send-magic-link 2xx or 429': (r) => r.status < 500,
    });
    // 429 (rate limit) is expected under load — not an error
    magicLinkErrors.add(res.status >= 500);
    sleep(0.1);
  }

  // 3. manage-properties list — GET with agent_id query param
  {
    const url = `${SUPABASE_URL}/manage-properties?agent_id=${TEST_AGENT_ID}&action=list`;
    const start = Date.now();
    const res = http.get(url);
    propertiesDuration.add(Date.now() - start);
    // 401 is acceptable (no auth token in load test) — 5xx is not
    const ok = check(res, {
      'manage-properties not 5xx': (r) => r.status < 500,
    });
    propertiesErrors.add(!ok);
    sleep(0.1);
  }

  // 4. og-injector — GET any agent page via Netlify edge function
  {
    const url = `${BASE_URL}/agent/loadtest`;
    const start = Date.now();
    const res = http.get(url);
    ogInjectorDuration.add(Date.now() - start);
    const ok = check(res, {
      'og-injector 2xx': (r) => r.status >= 200 && r.status < 300,
    });
    ogInjectorErrors.add(!ok);
    sleep(0.2);
  }
}
```

Create `scripts/load-test.sh` with this exact content:

```bash
#!/usr/bin/env bash
# Load test runner — SellingDubai critical endpoints
#
# Usage:
#   ./scripts/load-test.sh
#   BASE_URL=https://preview.sellingdubai.com ./scripts/load-test.sh
#
# Required:
#   k6 installed: brew install k6
#
# Optional env vars:
#   BASE_URL         Netlify frontend base URL (default: staging)
#   SUPABASE_URL     Supabase functions base URL (default: prod project, staging data)
#   TEST_AGENT_ID    UUID of seeded test agent (default: placeholder)
#   LOADTEST_TOKEN   Bearer token for send-magic-link (default: empty, skips that test)
#   JSON_OUT         Path for JSON summary output (default: load-test-results.json)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BASE_URL="${BASE_URL:-https://staging.sellingdubai.com}"
SUPABASE_URL="${SUPABASE_URL:-https://pjyorgedaxevxophpfib.supabase.co/functions/v1}"
TEST_AGENT_ID="${TEST_AGENT_ID:-loadtest-agent-uuid-placeholder}"
LOADTEST_TOKEN="${LOADTEST_TOKEN:-}"
JSON_OUT="${JSON_OUT:-${SCRIPT_DIR}/load-test-results.json}"

# Safety guard — never allow production URL as target
if [[ "$BASE_URL" == *"sellingdubai.com"* && "$BASE_URL" != *"staging"* && "$BASE_URL" != *"preview"* && "$BASE_URL" != *"deploy-preview"* ]]; then
  echo "ERROR: BASE_URL looks like production (sellingdubai.com without staging/preview)."
  echo "  Load tests must never target production."
  echo "  Set BASE_URL to a staging or preview URL."
  exit 1
fi

if ! command -v k6 &>/dev/null; then
  echo "ERROR: k6 not found. Install with: brew install k6"
  echo "  or visit: https://k6.io/docs/get-started/installation/"
  exit 1
fi

echo ""
echo "=== SellingDubai Load Test ==="
echo "  Frontend:  $BASE_URL"
echo "  Functions: $SUPABASE_URL"
echo "  Agent ID:  $TEST_AGENT_ID"
echo "  JSON out:  $JSON_OUT"
echo ""

BASE_URL="$BASE_URL" \
SUPABASE_URL="$SUPABASE_URL" \
TEST_AGENT_ID="$TEST_AGENT_ID" \
LOADTEST_TOKEN="$LOADTEST_TOKEN" \
  k6 run \
    --out "json=${JSON_OUT}" \
    "${SCRIPT_DIR}/load-test.js"

echo ""
echo "=== Load test complete. Results written to: $JSON_OUT ==="
echo "Commit LOAD-TEST-RESULTS.md with numbers extracted from that file."
```

Make it executable: `chmod +x scripts/load-test.sh`

**Verify:**
- `k6 inspect scripts/load-test.js` exits 0 (validates k6 syntax without running)
- `bash -n scripts/load-test.sh` exits 0 (bash syntax check)
- Running `BASE_URL=https://production.sellingdubai.com ./scripts/load-test.sh` must exit 1 with the production-guard error message

**Done:**
- `scripts/load-test.js` exists with four endpoint groups, five ramp stages, and SLO thresholds
- `scripts/load-test.sh` exists, is executable, accepts `BASE_URL` env var, and refuses to run against production URLs

---

## Task 2: Seed the load test agent

**Files:**
- `scripts/seed-loadtest-agent.ts`

**Action:**

Create `scripts/seed-loadtest-agent.ts`. This script inserts a deterministic test agent row that the k6 test depends on. It is idempotent (upsert by email) so it can be re-run safely.

```typescript
// scripts/seed-loadtest-agent.ts
// Idempotent seeder for the load test agent record.
// Run once before executing the load test:
//   deno run --allow-env --allow-net scripts/seed-loadtest-agent.ts
//
// Required env:
//   SUPABASE_URL          e.g. https://pjyorgedaxevxophpfib.supabase.co
//   SUPABASE_SERVICE_KEY  service_role key (never the anon key)
//
// Output: prints the agent UUID to use as TEST_AGENT_ID in load-test.sh

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_KEY');

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.');
  Deno.exit(1);
}

const AGENT = {
  email:       'loadtest@sellingdubai.com',
  name:        'Load Test Agent',
  slug:        'loadtest',
  brn:         'TEST-123',
  phone:       '+971501234567',
  agency_name: 'Load Test Agency',
  is_verified: true,
  tier:        'pro',
};

const res = await fetch(`${SUPABASE_URL}/rest/v1/agents?on_conflict=email`, {
  method:  'POST',
  headers: {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'apikey':        SERVICE_KEY,
    'Prefer':        'resolution=merge-duplicates,return=representation',
  },
  body: JSON.stringify(AGENT),
});

if (!res.ok) {
  const body = await res.text();
  console.error(`ERROR: upsert failed (${res.status}): ${body}`);
  Deno.exit(1);
}

const rows = await res.json() as Array<{ id: string }>;
const agent = rows[0];

if (!agent?.id) {
  console.error('ERROR: upsert returned no rows.');
  Deno.exit(1);
}

console.log(`\nLoad test agent ready:`);
console.log(`  ID:    ${agent.id}`);
console.log(`  Email: ${AGENT.email}`);
console.log(`  BRN:   ${AGENT.brn}`);
console.log(`\nSet this in load-test.sh:`);
console.log(`  TEST_AGENT_ID=${agent.id}`);
```

After writing the file, document the pre-run steps in a comment block at the top of `scripts/load-test.sh` (append to the existing header comment block):

```
# Pre-run setup (one-time):
#   1. deno run --allow-env --allow-net scripts/seed-loadtest-agent.ts
#      → note the printed TEST_AGENT_ID
#   2. export TEST_AGENT_ID=<uuid from step 1>
#   3. Optionally set LOADTEST_TOKEN for send-magic-link testing
```

**Verify:**
- `deno check scripts/seed-loadtest-agent.ts` exits 0 (type-check without running)
- File contains `on_conflict=email` (idempotency guard)
- File contains `service_role` comment warning (never anon key)

**Done:**
- `scripts/seed-loadtest-agent.ts` exists, type-checks cleanly, and documents the required env vars in its header comment

---

## Task 3: Run the load test and commit baseline results

**Files:**
- `LOAD-TEST-RESULTS.md`

**Action:**

Run the actual load test against staging (or a Netlify deploy-preview URL). If a real staging URL is not available, use the Supabase project's production functions URL with a low VU cap (max 10) and note that in the results. Never run the full 100-VU ramp against production.

Pre-flight:
1. Install k6 if not present: `brew install k6`
2. Seed the test agent: `SUPABASE_URL=https://pjyorgedaxevxophpfib.supabase.co SUPABASE_SERVICE_KEY=<key> deno run --allow-env --allow-net scripts/seed-loadtest-agent.ts`
3. Note the TEST_AGENT_ID output

Run the test:
```bash
TEST_AGENT_ID=<uuid> \
BASE_URL=<staging-url> \
JSON_OUT=./load-test-results.json \
./scripts/load-test.sh
```

After the run, extract p50/p95/p99 values from the k6 stdout summary (printed after run) or from `load-test-results.json` using:
```bash
# Extract per-metric percentiles from JSON output (k6 JSON format)
cat load-test-results.json | grep -E '"metric":"(capture_lead_duration|magic_link_duration|properties_duration|og_injector_duration)"' | head -40
```

Create `LOAD-TEST-RESULTS.md` at the project root with this structure — fill in real numbers from the run:

```markdown
# Load Test Results — SellingDubai

**Date:** YYYY-MM-DD
**Environment:** <staging URL or note if production functions used at low VU>
**Tool:** k6
**Ramp profile:** 1 → 10 → 50 → 100 VUs, 60s per stage (+ 30s cool-down)
**Test agent BRN:** TEST-123 (loadtest@sellingdubai.com)

---

## capture-lead-v4

| VUs | p50 | p95 | p99 | Error rate |
|-----|-----|-----|-----|------------|
| 1   | Xms | Xms | Xms | 0.0%       |
| 10  | Xms | Xms | Xms | 0.0%       |
| 50  | Xms | Xms | Xms | X.X%       |
| 100 | Xms | Xms | Xms | X.X%       |

**SLO threshold:** p95 < 800ms
**Result:** PASS / FAIL
**Saturation point:** X VUs (p95 first exceeds 800ms or error rate > 1%)

---

## send-magic-link

| VUs | p50 | p95 | p99 | Error rate (5xx only) |
|-----|-----|-----|-----|-----------------------|
| 1   | Xms | Xms | Xms | 0.0%                  |
| 10  | Xms | Xms | Xms | 0.0%                  |
| 50  | Xms | Xms | Xms | X.X%                  |
| 100 | Xms | Xms | Xms | X.X%                  |

**Note:** 429 (rate limit) responses are excluded from error rate — they are expected under load.
**SLO threshold:** p95 < 1000ms, 5xx error rate < 1%
**Result:** PASS / FAIL
**Saturation point:** X VUs

---

## manage-properties (list)

| VUs | p50 | p95 | p99 | Error rate (5xx only) |
|-----|-----|-----|-----|-----------------------|
| 1   | Xms | Xms | Xms | 0.0%                  |
| 10  | Xms | Xms | Xms | 0.0%                  |
| 50  | Xms | Xms | Xms | X.X%                  |
| 100 | Xms | Xms | Xms | X.X%                  |

**Note:** 401 responses (no auth token in load test) are excluded from error rate.
**SLO threshold:** p95 < 1000ms
**Result:** PASS / FAIL
**Saturation point:** X VUs

---

## og-injector (Netlify edge)

| VUs | p50 | p95 | p99 | Error rate |
|-----|-----|-----|-----|------------|
| 1   | Xms | Xms | Xms | 0.0%       |
| 10  | Xms | Xms | Xms | 0.0%       |
| 50  | Xms | Xms | Xms | X.X%       |
| 100 | Xms | Xms | Xms | X.X%       |

**SLO threshold:** p95 < 1000ms
**Result:** PASS / FAIL
**Saturation point:** X VUs (or "Not reached at 100 VUs")

---

## Overall k6 threshold result

k6 exit code: 0 (all thresholds passed) / 1 (one or more thresholds breached)

### Observations

- [Describe any surprising results, bottlenecks, or patterns]
- [Note whether Supabase connection pooling appeared to be a factor]
- [Note Netlify edge function cold-start behaviour if visible]

### Recommendations

- [Any tuning suggestions derived from the results]
```

**Verify:**
- `LOAD-TEST-RESULTS.md` exists at the project root
- File contains the string `p95` (confirms table headers)
- File contains a real date (not `YYYY-MM-DD`)
- File contains at least one `PASS` or `FAIL` result entry

**Done:**
- `LOAD-TEST-RESULTS.md` committed with real numbers from at least one actual k6 run (even if at reduced VU count due to environment limitations)

---

## Task 4: Write SLO.md

**Files:**
- `SLO.md`

**Action:**

Create `SLO.md` at the project root with this exact structure. Every value, link, and formula below is required:

```markdown
# Service Level Objectives — SellingDubai

**Version:** 1.0
**Effective date:** YYYY-MM-DD
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

| SLO | Alert | Channel |
|-----|-------|---------|
| capture-lead-v4 error rate > 1% | Sentry issue alert (configured in Phase 5) | Slack `#engineering` |
| send-magic-link rate limit > 10/hour | Sentry issue alert (Phase 5) | Slack `#engineering` |
| stripe-webhook signature failure | Sentry issue alert (Phase 5) — immediate | Slack + email |
| JS error rate > 3× 7-day baseline | Sentry metric alert (Phase 5) | Slack `#engineering` |
| Lighthouse score < 80 | CI Lighthouse job (Phase 2) | PR comment |

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
```

Replace `YYYY-MM-DD` with today's date (2026-04-03). Replace `<org>` with the actual Sentry org slug if known; otherwise leave as the placeholder.

**Verify:**
- `SLO.md` exists at the project root
- File contains `99.9%` and `99.99%` (availability targets)
- File contains `800ms` (lead capture latency SLO)
- File contains `LOAD-TEST-RESULTS.md` reference (links evidence to commitments)

**Done:**
- `SLO.md` is committed with all four SLO dimensions: availability, latency, error rate, monitoring. Every latency target references the load test. Every availability target links to a vendor SLA.

---

## Task 5: Wire Sentry alert thresholds to SLO values

**Files:**
- `SLO.md` (update the Monitoring table — no new file)
- `.planning/phases/06-load-testing-slos/SENTRY-ALERT-SPEC.md`

**Action:**

Phase 5 defined four Sentry alerts. Phase 6 must ensure the alert thresholds are numerically consistent with the SLOs in `SLO.md`. This task produces a spec document that Phase 5 implementers (or Phase 7 ENGINEERING.md authors) can use to verify alignment.

Create `.planning/phases/06-load-testing-slos/SENTRY-ALERT-SPEC.md`:

```markdown
# Sentry Alert Spec — SLO-Aligned Thresholds

Generated by Phase 6 (Load Testing & SLOs).
Used by Phase 5 (Observability) and Phase 7 (ENGINEERING.md) to verify alert config.

---

## Alert: capture-lead-v4 error rate

**SLO target:** < 0.1% error rate in production
**Alert threshold:** > 1% error rate over a 5-minute window
  (10× buffer avoids false positives from transient spikes; SLO breach declared after 15 min)
**Sentry alert type:** Issue alert on `capture-lead-v4` transaction
**Condition:** `event.transaction:/functions/v1/capture-lead-v4 AND level:error`
**Frequency:** Notify if count > (0.01 × total requests) in any 5-minute window
**Channel:** Slack `#engineering`
**Sentry alert name:** `[SLO] capture-lead-v4 error rate > 1%`

---

## Alert: send-magic-link rate limit abuse

**SLO relevance:** Magic link sends > 10/hour from a single IP indicate abuse, not organic load
**Alert threshold:** > 10 send-magic-link events per hour per IP
**Sentry alert type:** Issue alert on rate-limit log event
**Condition:** Tag `rate_limited: true` appears > 10 times in 1 hour
**Channel:** Slack `#engineering`
**Sentry alert name:** `[SLO] send-magic-link rate abuse`

---

## Alert: stripe-webhook signature failure

**SLO relevance:** Any HMAC failure indicates either a bad deploy or active attack — zero tolerance
**Alert threshold:** Any single occurrence
**Sentry alert type:** Issue alert, immediate
**Condition:** `event.transaction:/functions/v1/stripe-webhook AND tags.error_type:signature_failure`
**Channel:** Slack `#engineering` + email to on-call
**Sentry alert name:** `[SLO] stripe-webhook signature failure`

---

## Alert: JS error rate spike

**SLO relevance:** JS errors degrade the buyer funnel and agent dashboard
**Alert threshold:** Error count > 3× 7-day baseline in any 1-hour window
**Sentry alert type:** Metric alert on `count()` for JS errors
**Condition:** `count() > baseline * 3` (use Sentry's anomaly detection or set absolute floor of 20/hr)
**Channel:** Slack `#engineering`
**Sentry alert name:** `[SLO] JS error rate spike`

---

## How to verify alignment during Phase 5 implementation

For each alert:
1. Open Sentry → Alerts → [alert name]
2. Confirm the threshold value matches the "Alert threshold" row above
3. Confirm the channel matches
4. Confirm the alert fires on a test event (use Sentry's "Send test event" button)
5. Screenshot and add to ENGINEERING.md (Phase 7)
```

Also update the Monitoring table in `SLO.md` — add a "Threshold" column showing the numeric Sentry threshold value for each alert row. Example for the first row:

```
| capture-lead-v4 error rate > 1% | Sentry issue alert: error count > 1% in 5-min window | Slack `#engineering` |
```

**Verify:**
- `SENTRY-ALERT-SPEC.md` exists in `.planning/phases/06-load-testing-slos/`
- File contains all four alert names prefixed with `[SLO]`
- `SLO.md` Monitoring table rows include numeric threshold values (not just "Sentry alert")

**Done:**
- Every Sentry alert defined in Phase 5 has a corresponding row in SENTRY-ALERT-SPEC.md with exact threshold values derived from the SLO targets in SLO.md. The spec is the single source of truth for what the alert must be set to.

---

## Task 6: Final verification — k6 run passes against staging

**Files:** None (verification only)

**Action:**

Run the full verification sequence. All four checks must pass before this task is done.

**Check 1 — k6 syntax:**
```bash
k6 inspect scripts/load-test.js
```
Expected: exits 0, prints the options summary (stages + thresholds).

**Check 2 — Production guard:**
```bash
BASE_URL=https://sellingdubai.com ./scripts/load-test.sh 2>&1 | grep -q "ERROR: BASE_URL looks like production" && echo "PASS: production guard works" || echo "FAIL"
```
Expected: prints `PASS: production guard works`.

**Check 3 — k6 threshold mode:**
Run k6 against staging at reduced VUs (5 max) to verify the threshold mechanism works. This is a smoke run to confirm the script is wired correctly, not a full ramp:

```bash
TEST_AGENT_ID=<uuid> \
BASE_URL=<staging-url> \
  k6 run \
    --stage "10s:1,20s:5,10s:0" \
    --out json=load-test-smoke.json \
    scripts/load-test.js
echo "k6 exit code: $?"
```
Expected: exits 0 if all endpoints are healthy. If exit 1, inspect `load-test-smoke.json` for which threshold breached.

**Check 4 — Artifact existence:**
```bash
test -f LOAD-TEST-RESULTS.md && echo "PASS: results exist" || echo "FAIL: LOAD-TEST-RESULTS.md missing"
test -f SLO.md && echo "PASS: SLO exists" || echo "FAIL: SLO.md missing"
grep -q "800ms" SLO.md && echo "PASS: SLO has latency target" || echo "FAIL: missing 800ms target"
grep -q "p95" LOAD-TEST-RESULTS.md && echo "PASS: results have percentiles" || echo "FAIL"
```

**Verify:**
All four checks output `PASS`.

**Done:**
- k6 script is syntactically valid
- Production guard rejects `sellingdubai.com` as BASE_URL
- At least one real k6 run (even at low VUs) completes without crashing
- `LOAD-TEST-RESULTS.md` and `SLO.md` exist with required content

</tasks>

<verification>

## Phase 6 Completion Checklist

Run these in order from the project root (`/Users/bobanpepic/Desktop/sellingdubai-app`):

```bash
# 1. Scripts exist and are executable
test -x scripts/load-test.sh && echo "PASS: load-test.sh executable" || echo "FAIL"
test -f scripts/load-test.js  && echo "PASS: load-test.js exists"    || echo "FAIL"
test -f scripts/seed-loadtest-agent.ts && echo "PASS: seeder exists" || echo "FAIL"

# 2. k6 syntax check
k6 inspect scripts/load-test.js && echo "PASS: k6 syntax valid" || echo "FAIL"

# 3. Deno type check
deno check scripts/seed-loadtest-agent.ts && echo "PASS: seeder types valid" || echo "FAIL"

# 4. Production guard
BASE_URL=https://sellingdubai.com ./scripts/load-test.sh 2>&1 | grep -q "production" \
  && echo "PASS: prod guard fires" || echo "FAIL: prod guard broken"

# 5. Result artifacts exist
test -f LOAD-TEST-RESULTS.md && grep -q "p95" LOAD-TEST-RESULTS.md \
  && echo "PASS: results committed" || echo "FAIL"
test -f SLO.md && grep -q "800ms" SLO.md \
  && echo "PASS: SLO committed" || echo "FAIL"

# 6. Sentry alert spec exists
test -f .planning/phases/06-load-testing-slos/SENTRY-ALERT-SPEC.md \
  && echo "PASS: alert spec exists" || echo "FAIL"
```

All six checks must output `PASS`.
</verification>

<success_criteria>

Phase 6 is complete when:

1. `scripts/load-test.sh` is executable, accepts `BASE_URL`, and refuses to run against `sellingdubai.com` (without staging/preview in the URL).
2. `scripts/load-test.js` exercises all four endpoints with per-endpoint custom metrics and SLO thresholds. `k6 inspect` exits 0.
3. `scripts/seed-loadtest-agent.ts` is idempotent and type-checks with `deno check`.
4. `LOAD-TEST-RESULTS.md` contains real p50/p95/p99 numbers from at least one k6 run and identifies the saturation point for each endpoint.
5. `SLO.md` defines all four SLO dimensions (availability backed by Netlify+Supabase SLAs, latency from load test, error rate, Lighthouse) and cross-references `LOAD-TEST-RESULTS.md`.
6. `SENTRY-ALERT-SPEC.md` lists all four Phase 5 alerts with exact numeric thresholds derived from SLO targets.
7. A DD reviewer can read `SLO.md` in 5 minutes, understand what we commit to, how it is measured, and where the evidence lives — without asking a single follow-up question.

</success_criteria>

<output>
After completing all tasks, create `.planning/phases/06-load-testing-slos/06-SUMMARY.md` with:
- What was built (files created, real numbers from the load test)
- k6 exit code from the final run
- Any saturation points identified
- Any SLO thresholds that were close or breached
- Recommendations for Phase 7 (ENGINEERING.md load testing section)
</output>
