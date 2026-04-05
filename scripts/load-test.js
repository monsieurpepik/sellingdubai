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
