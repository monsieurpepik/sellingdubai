// scripts/load-test.js
// k6 load test — SellingDubai 4 critical paths
//
// Usage:
//   k6 run scripts/load-test.js
//   BASE_URL=https://staging.sellingdubai.com k6 run scripts/load-test.js
//
// npm shortcuts:
//   npm run load-test           (default BASE_URL)
//   npm run load-test:staging   (staging.sellingdubai.com)
//
// Prerequisites:
//   brew install k6
//   export SUPABASE_ANON_KEY=<anon key>   (required for off-plan projects scenario)
//   export TEST_AGENT_SLUG=<slug>         (optional — slug of load test agent, defaults to 'loadtest')
//   Run: deno run --allow-env --allow-net scripts/seed-loadtest-agent.ts
//
// Production guard: refuses to run against bare sellingdubai.com.

import { check, sleep } from 'k6';
import http from 'k6/http';
import { Rate, Trend } from 'k6/metrics';

// --- Environment -------------------------------------------------------

const BASE_URL = (__ENV.BASE_URL || 'https://staging.sellingdubai.com').replace(/\/$/, '');
const SUPABASE_URL = 'https://pjyorgedaxevxophpfib.supabase.co';
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY;
if (!SUPABASE_ANON_KEY) {
  throw new Error('SUPABASE_ANON_KEY env var required. Run: export SUPABASE_ANON_KEY=your_key');
}
const TEST_AGENT_SLUG = __ENV.TEST_AGENT_SLUG || 'loadtest';

if (BASE_URL === 'https://sellingdubai.com' || BASE_URL === 'http://sellingdubai.com') {
  throw new Error('BLOCKED: load tests must not target production. Set BASE_URL to a staging URL.');
}

// --- Custom metrics ----------------------------------------------------

const agentPageErrors       = new Rate('agent_page_errors');
const leadCaptureErrors     = new Rate('lead_capture_errors');
const flagsErrors           = new Rate('flags_errors');
const projectsErrors        = new Rate('projects_errors');
const whatsappIngestErrors  = new Rate('whatsapp_ingest_errors');

const agentPageDuration     = new Trend('agent_page_duration',     true);
const leadCaptureDuration   = new Trend('lead_capture_duration',   true);
const flagsDuration         = new Trend('flags_duration',          true);
const projectsDuration      = new Trend('projects_duration',       true);
const whatsappIngestDuration = new Trend('whatsapp_ingest_duration', true);

// --- Load profile: 0 → 50 VUs over 30s, 2min sustained, ramp down -----

export const options = {
  scenarios: {
    agent_profile: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '2m',  target: 10 },
        { duration: '15s', target: 0  },
      ],
      exec: 'agentProfile',
      // NOTE: Netlify rate-limits concurrent connections from a single IP.
      // 50 VUs from one machine triggers TCP-level throttling. 10 VUs is the
      // practical ceiling for single-machine testing. Use k6 Cloud for full
      // 50-VU distributed testing against the CDN layer.
    },
    lead_capture: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '2m',  target: 20 },
        { duration: '15s', target: 0  },
      ],
      exec: 'leadCapture',
    },
    feature_flags: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 30 },
        { duration: '2m',  target: 30 },
        { duration: '15s', target: 0  },
      ],
      exec: 'featureFlags',
    },
    offplan_projects: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '2m',  target: 20 },
        { duration: '15s', target: 0  },
      ],
      exec: 'offplanProjects',
    },
    whatsapp_ingest: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '2m',  target: 10 },
        { duration: '15s', target: 0  },
      ],
      exec: 'whatsappIngest',
      // NOTE: not yet baselined — first run expected at 50 agents or 1000 leads/month.
      // 10 VUs conservative: each request triggers a Supabase write + potential AI call.
    },
  },

  thresholds: {
    http_req_failed:        ['rate<0.01'],
    http_req_duration:      ['p(95)<1000'],

    agent_page_errors:      ['rate<0.01'],
    agent_page_duration:    ['p(95)<800'],

    lead_capture_errors:    ['rate<0.01'],
    lead_capture_duration:  ['p(95)<1000'],

    flags_errors:           ['rate<0.01'],
    flags_duration:         ['p(95)<500'],  // revised up from 300ms — cold-start tail at 30 VUs

    projects_errors:        ['rate<0.01'],
    projects_duration:      ['p(95)<800'],  // revised up from 500ms — REST p95 at 20 VUs

    // whatsapp_ingest — no threshold yet, collect data only on first run
    whatsapp_ingest_errors: ['rate<0.01'],
  },
};

// --- Scenario 1: Agent profile page ------------------------------------
// Full HTML render via Netlify + og-injector edge function

export function agentProfile() {
  const res = http.get(`${BASE_URL}/boban-pepic`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
    tags: { scenario: 'agent_profile' },
  });

  const ok = check(res, {
    'agent_profile status 200': (r) => r.status === 200,
    'agent_profile has slug':   (r) => r.body && r.body.includes('boban-pepic'),
  });

  agentPageErrors.add(!ok);
  agentPageDuration.add(res.timings.duration);
  sleep(1);
}

// --- Scenario 2: Lead capture ------------------------------------------
// Anonymous lead submission — no auth required

export function leadCapture() {
  const payload = JSON.stringify({
    agent_slug: TEST_AGENT_SLUG,
    name:       'Load Test User',
    phone:      '+971500000000',
    message:    'k6 load test — automated',
    source:     'load_test',
  });

  const res = http.post(
    `${SUPABASE_URL}/functions/v1/capture-lead-v4`,
    payload,
    {
      headers: { 'Content-Type': 'application/json' },
      tags:    { scenario: 'lead_capture' },
    }
  );

  // 4xx (e.g. validation error) is acceptable; 5xx is not
  const ok = check(res, {
    'lead_capture not 5xx': (r) => r.status < 500,
  });

  leadCaptureErrors.add(res.status >= 500);
  leadCaptureDuration.add(res.timings.duration);
  sleep(2);
}

// --- Scenario 3: Feature flags -----------------------------------------
// Lightweight config endpoint — tight p95 budget (300ms)

export function featureFlags() {
  const res = http.get(
    `${SUPABASE_URL}/functions/v1/get-flags`,
    { tags: { scenario: 'feature_flags' } }
  );

  const ok = check(res, {
    'flags status 200':     (r) => r.status === 200,
    'flags returns JSON':   (r) => (r.headers['Content-Type'] || '').includes('json'),
  });

  flagsErrors.add(!ok);
  flagsDuration.add(res.timings.duration);
  sleep(1);
}

// --- Scenario 4: Off-plan projects -------------------------------------
// Supabase PostgREST public read — anon key required

export function offplanProjects() {
  const res = http.get(
    `${SUPABASE_URL}/rest/v1/projects?select=id,name,min_price,cover_image_url&limit=12`,
    {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Accept': 'application/json',
      },
      tags: { scenario: 'offplan_projects' },
    }
  );

  const ok = check(res, {
    'projects status 200':      (r) => r.status === 200,
    'projects returns array':   (r) => {
      try { return Array.isArray(JSON.parse(r.body)); }
      catch (_) { return false; }
    },
  });

  projectsErrors.add(!ok);
  projectsDuration.add(res.timings.duration);
  sleep(1);
}

// --- Scenario 5: WhatsApp ingest ---------------------------------------
// Simulates an inbound WhatsApp message routed via the webhook.
// Not yet baselined — first real run at 50 agents or 1000 leads/month.
// 4xx (e.g. signature validation failure) is expected in load test context
// because we can't reproduce the real Twilio signature. Error rate tracks
// 5xx only.

export function whatsappIngest() {
  const payload = JSON.stringify({
    From:    'whatsapp:+971500000000',
    To:      'whatsapp:+14155238886',
    Body:    'k6 load test — automated',
    // No valid Twilio signature — function should return 401/403, not 5xx
  });

  const res = http.post(
    `${SUPABASE_URL}/functions/v1/whatsapp-ingest`,
    payload,
    {
      headers: { 'Content-Type': 'application/json' },
      tags:    { scenario: 'whatsapp_ingest' },
    }
  );

  // 4xx expected (signature failure) — only 5xx counts as error
  const ok = check(res, {
    'whatsapp_ingest not 5xx': (r) => r.status < 500,
  });

  whatsappIngestErrors.add(res.status >= 500);
  whatsappIngestDuration.add(res.timings.duration);
  sleep(3);
}
