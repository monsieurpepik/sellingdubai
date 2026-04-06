# Wave 1: Staging Environment + Business Metrics Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a staging environment for safe development and deploy a founder-only business metrics dashboard at `/ops.html`.

**Architecture:** New Netlify site + Supabase project for staging; `get-metrics` Deno edge function aggregates SQL metrics from the existing `agents` and `leads` tables; `ops.html` + lazy-loaded `js/ops.js` renders metric cards and an inline SVG line chart. Zero new third-party scripts — chart rendered in vanilla JS. OPS_SECRET environment variable gates both the page and every edge call.

**Tech Stack:** Deno/TypeScript (edge functions), vanilla ES modules (frontend JS), Supabase PostgreSQL, Netlify, GitHub Actions.

---

> **Note on pre-completed items:** The service worker (`sw.js`) cache version and STATIC_ASSETS were already updated to `sd-v23` + `dist/init.bundle.js` in a prior commit. The `lead-followup-nagger` cron secret guard and `mortgage_applications` anon UPDATE RLS block are also already fixed. Tasks below cover only what remains.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `robots.txt` | Modify | Disallow `/ops.html` and `/admin.html` |
| `edge-functions/get-metrics/index.ts` | Create | SQL aggregations → JSON metrics blob |
| `ops.html` | Create | Page shell: OPS_SECRET check, loads `js/ops.js` |
| `js/ops.js` | Create | Fetch metrics, render cards + SVG chart, 5-min refresh |
| `.github/workflows/ci.yml` | Modify | Add `OPS_SECRET` to staging env vars in deploy step docs |
| `scripts/dev.sh` | No change | Already allows staging URL via allowlist logic |

---

## Task 1: Update robots.txt

**Files:**
- Modify: `robots.txt`

- [ ] **Step 1: Read the current robots.txt**

```bash
cat robots.txt
```

- [ ] **Step 2: Add disallow rules for ops and admin pages**

Append to `robots.txt` (or add within the existing `User-agent: *` block if one exists):

```
User-agent: *
Disallow: /ops.html
Disallow: /admin.html
```

If `robots.txt` doesn't exist yet, create it with:

```
User-agent: *
Disallow: /ops.html
Disallow: /admin.html

Sitemap: https://agents.sellingdubai.ae/sitemap.xml
```

- [ ] **Step 3: Verify the file looks correct**

```bash
cat robots.txt
```

Expected: both Disallow lines present, no duplicate User-agent blocks.

- [ ] **Step 4: Commit**

```bash
git add robots.txt
git commit -m "chore: disallow ops and admin pages from robots.txt"
```

---

## Task 2: Staging Environment Setup

This task involves manual steps in the Supabase and Netlify dashboards followed by CI secret additions. The load-test workflow already references a staging Supabase URL (`lhrtdlxqbdxrfvjeoxrt.supabase.co`) — verify whether this is already an active staging project before creating a new one.

**Files:**
- Modify: `.github/workflows/ci.yml` (add staging env docs comment)
- Modify: `supabase/.env.example` (add staging URL example)

- [ ] **Step 1: Verify if staging Supabase project exists**

Check whether `https://lhrtdlxqbdxrfvjeoxrt.supabase.co` is an active staging project by logging into the Supabase dashboard. If it exists and has the schema, skip to Step 4.

- [ ] **Step 2: Create staging Supabase project (if needed)**

In Supabase dashboard: New project → name `sellingdubai-staging`. Note the project URL and anon key.

Push the production schema to staging:

```bash
supabase link --project-ref <STAGING_PROJECT_REF>
supabase db push
```

- [ ] **Step 3: Create staging Netlify site (if needed)**

In Netlify dashboard: Add new site → connect to the same GitHub repo → set deploy branch to `staging`. Site URL: `staging-agents.sellingdubai.ae`. Set environment variables:
- `SUPABASE_URL` = staging project URL
- `SUPABASE_ANON_KEY` = staging anon key
- `OPS_SECRET` = a long random string (generate with `openssl rand -hex 32`)

- [ ] **Step 4: Add GitHub Actions secrets**

In GitHub repo Settings → Secrets → Actions, add:
- `SUPABASE_URL_STAGING` = staging project URL (e.g. `https://lhrtdlxqbdxrfvjeoxrt.supabase.co`)
- `SUPABASE_ANON_KEY_STAGING` = staging anon key
- `OPS_SECRET` = same value set in Netlify staging env

- [ ] **Step 5: Add OPS_SECRET to production Netlify env**

In the production Netlify site environment variables, add:
- `OPS_SECRET` = a **different** long random string from staging (generate with `openssl rand -hex 32`)

- [ ] **Step 6: Update supabase/.env.example**

Add a comment showing staging URL pattern:

```bash
# Staging Supabase project (for CI/staging environment)
# SUPABASE_URL_STAGING=https://<staging-ref>.supabase.co
# SUPABASE_ANON_KEY_STAGING=<staging-anon-key>
```

- [ ] **Step 7: Commit env example update**

```bash
git add supabase/.env.example
git commit -m "chore: document staging env vars in .env.example"
```

---

## Task 3: Create `get-metrics` Edge Function

**Files:**
- Create: `edge-functions/get-metrics/index.ts`

- [ ] **Step 1: Create the file**

```typescript
// edge-functions/get-metrics/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPS_SECRET = Deno.env.get("OPS_SECRET") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  // Auth: require OPS_SECRET in Authorization header
  if (!OPS_SECRET) {
    return new Response(JSON.stringify({ error: "OPS_SECRET not configured." }), {
      status: 503, headers: CORS_HEADERS,
    });
  }
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader !== `Bearer ${OPS_SECRET}`) {
    return new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 401, headers: CORS_HEADERS,
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Tier breakdown ──────────────────────────────────────────────────────────
  const { data: tierRows } = await supabase
    .from("agents")
    .select("tier")
    .eq("verified", true);

  const tierCounts: Record<string, number> = { free: 0, pro: 0, premium: 0 };
  for (const row of tierRows ?? []) {
    const t = row.tier ?? "free";
    tierCounts[t] = (tierCounts[t] ?? 0) + 1;
  }

  // ── MRR (AED) ───────────────────────────────────────────────────────────────
  // tier_price column stores monthly price in AED (0 for free, 299 for pro, 799 for premium)
  const { data: billingRows } = await supabase
    .from("agents")
    .select("tier_price")
    .eq("verified", true)
    .neq("tier", "free");

  const mrr = (billingRows ?? []).reduce((sum, r) => sum + (Number(r.tier_price) || 0), 0);
  const arr = mrr * 12;

  // ── Agent counts this month vs last month (for MoM growth %) ────────────────
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

  const { count: totalAgents } = await supabase
    .from("agents")
    .select("id", { count: "exact", head: true })
    .eq("verified", true);

  const { count: thisMonthAgents } = await supabase
    .from("agents")
    .select("id", { count: "exact", head: true })
    .eq("verified", true)
    .gte("created_at", thisMonthStart);

  const { count: lastMonthAgents } = await supabase
    .from("agents")
    .select("id", { count: "exact", head: true })
    .eq("verified", true)
    .gte("created_at", lastMonthStart)
    .lt("created_at", thisMonthStart);

  const momGrowthPct = lastMonthAgents && lastMonthAgents > 0
    ? Math.round(((thisMonthAgents ?? 0) - lastMonthAgents) / lastMonthAgents * 100)
    : null;

  // ── Activation rate: agents with ≥1 property / total verified ───────────────
  const { data: agentIds } = await supabase
    .from("agents")
    .select("id")
    .eq("verified", true);

  let activatedCount = 0;
  if (agentIds && agentIds.length > 0) {
    const ids = agentIds.map((a: { id: string }) => a.id);
    const { data: activeAgents } = await supabase
      .from("properties")
      .select("agent_id")
      .in("agent_id", ids)
      .eq("status", "active");

    const uniqueActive = new Set((activeAgents ?? []).map((p: { agent_id: string }) => p.agent_id));
    activatedCount = uniqueActive.size;
  }

  const activationRate = totalAgents
    ? Math.round((activatedCount / (totalAgents || 1)) * 100)
    : 0;

  // ── Agent funnel ─────────────────────────────────────────────────────────────
  // joined: total agents (including unverified)
  const { count: totalJoined } = await supabase
    .from("agents")
    .select("id", { count: "exact", head: true });

  // verified: email verified
  const totalVerified = totalAgents ?? 0;

  // first property: agents with ≥1 property
  const agentsWithProperty = activatedCount;

  // first lead: agents who have received ≥1 lead
  const { data: leadAgentRows } = await supabase
    .from("leads")
    .select("agent_id");
  const agentsWithLead = new Set((leadAgentRows ?? []).map((l: { agent_id: string }) => l.agent_id)).size;

  // paid: agents on pro or premium tier
  const paid = (tierCounts["pro"] ?? 0) + (tierCounts["premium"] ?? 0);

  // ── Lead volume — last 30 days, grouped by day ───────────────────────────────
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentLeads } = await supabase
    .from("leads")
    .select("created_at")
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: true });

  // Group by date (YYYY-MM-DD)
  const leadsByDay: Record<string, number> = {};
  for (const lead of recentLeads ?? []) {
    const day = (lead.created_at as string).slice(0, 10);
    leadsByDay[day] = (leadsByDay[day] ?? 0) + 1;
  }
  // Fill in zero days for last 30 days
  const leadSeries: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    leadSeries.push({ date: dateStr, count: leadsByDay[dateStr] ?? 0 });
  }

  // ── Churn: tier downgrades in last 30 days ───────────────────────────────────
  // Proxy: agents where tier changed to 'free' within last 30 days
  // Using stripe_subscription_status = 'canceled' as signal
  const { count: churned } = await supabase
    .from("agents")
    .select("id", { count: "exact", head: true })
    .eq("tier", "free")
    .eq("stripe_subscription_status", "canceled")
    .gte("updated_at", thirtyDaysAgo);

  const metrics = {
    mrr,
    arr,
    mom_growth_pct: momGrowthPct,
    tier_breakdown: tierCounts,
    funnel: {
      joined: totalJoined ?? 0,
      verified: totalVerified,
      with_property: agentsWithProperty,
      with_lead: agentsWithLead,
      paid,
    },
    activation_rate_pct: activationRate,
    lead_series: leadSeries,
    total_leads_30d: (recentLeads ?? []).length,
    churn_30d: churned ?? 0,
    generated_at: new Date().toISOString(),
  };

  return new Response(JSON.stringify(metrics), {
    headers: {
      ...CORS_HEADERS,
      "Cache-Control": "max-age=300, s-maxage=300",
    },
  });
});
```

- [ ] **Step 2: Test the edge function locally**

Start the Supabase local stack first:
```bash
npm run dev
# In a second terminal:
supabase functions serve get-metrics --env-file ./supabase/.env --no-verify-jwt
```

Then test (replace `your-secret` with the value from `supabase/.env`):
```bash
curl -H "Authorization: Bearer your-secret" http://localhost:54321/functions/v1/get-metrics
```

Expected: JSON object with `mrr`, `arr`, `funnel`, `lead_series` keys. No 401 or 500 errors.

- [ ] **Step 3: Test auth rejection**

```bash
curl http://localhost:54321/functions/v1/get-metrics
```

Expected: `{"error":"Unauthorized."}` with HTTP 401.

- [ ] **Step 4: Commit**

```bash
git add edge-functions/get-metrics/index.ts
git commit -m "feat: add get-metrics edge function for ops dashboard"
```

---

## Task 4: Create `ops.html`

**Files:**
- Create: `ops.html`

- [ ] **Step 1: Create the page**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SellingDubai Ops</title>
  <meta name="robots" content="noindex, nofollow">
  <link rel="stylesheet" href="/dist/styles.min.css">
  <style>
    body { background: #0f172a; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 2rem; }
    #ops-root { max-width: 1200px; margin: 0 auto; }
    #ops-root h1 { font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 2rem; }
    .ops-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .metric-card { background: #1e293b; border-radius: 12px; padding: 1.5rem; }
    .metric-card .label { font-size: 0.75rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
    .metric-card .value { font-size: 2rem; font-weight: 700; color: #f8fafc; }
    .metric-card .sub { font-size: 0.875rem; color: #64748b; margin-top: 0.25rem; }
    .metric-card .badge-stale { font-size: 0.7rem; background: #7c3aed; color: #fff; padding: 2px 8px; border-radius: 99px; vertical-align: middle; margin-left: 0.5rem; }
    .chart-section { background: #1e293b; border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem; }
    .chart-section h2 { font-size: 0.875rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 1rem 0; }
    .funnel-section { background: #1e293b; border-radius: 12px; padding: 1.5rem; }
    .funnel-section h2 { font-size: 0.875rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 1rem 0; }
    .funnel-row { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #334155; }
    .funnel-row:last-child { border-bottom: none; }
    .funnel-row .step { font-size: 0.875rem; color: #cbd5e1; }
    .funnel-row .count { font-size: 1.125rem; font-weight: 600; color: #f8fafc; }
    .funnel-bar { height: 4px; background: #334155; border-radius: 2px; margin-top: 0.25rem; }
    .funnel-bar-fill { height: 100%; background: #6366f1; border-radius: 2px; transition: width 0.4s ease; }
    #ops-auth-error { text-align: center; padding: 4rem 2rem; }
    #ops-auth-error p { font-size: 1.25rem; color: #ef4444; }
  </style>
</head>
<body>
  <div id="ops-root">
    <div id="ops-auth-error" style="display:none">
      <p>Access denied. Provide the correct <code>?key=</code> parameter.</p>
    </div>
    <div id="ops-content" style="display:none">
      <h1>SellingDubai Ops Dashboard</h1>
      <div class="ops-grid" id="metrics-cards"></div>
      <div class="chart-section">
        <h2>Lead Volume — Last 30 Days</h2>
        <svg id="lead-chart" width="100%" height="120" viewBox="0 0 700 120" preserveAspectRatio="none"></svg>
      </div>
      <div class="funnel-section" id="funnel-section"></div>
    </div>
  </div>

  <script type="module">
    // OPS_SECRET check — redirect if key is wrong or missing
    const params = new URLSearchParams(location.search);
    const key = params.get('key') || '';

    // Fetch to validate key server-side (avoids leaking the secret in JS)
    const SUPABASE_FUNCTIONS_URL = 'https://pjyorgedaxevxophpfib.supabase.co/functions/v1';

    async function validateAndLoad() {
      if (!key) {
        document.getElementById('ops-auth-error').style.display = 'block';
        return;
      }

      try {
        const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/get-metrics`, {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (res.status === 401) {
          document.getElementById('ops-auth-error').style.display = 'block';
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        document.getElementById('ops-content').style.display = 'block';
        const data = await res.json();

        const { default: renderOps } = await import('/js/ops.js');
        renderOps(data, key, SUPABASE_FUNCTIONS_URL);
      } catch (err) {
        document.getElementById('ops-auth-error').style.display = 'block';
        console.error('Ops load failed:', err);
      }
    }

    validateAndLoad();
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify the file was created**

```bash
ls -la ops.html
```

Expected: file present at project root.

- [ ] **Step 3: Commit**

```bash
git add ops.html
git commit -m "feat: add ops.html dashboard shell with OPS_SECRET gate"
```

---

## Task 5: Create `js/ops.js`

**Files:**
- Create: `js/ops.js`

- [ ] **Step 1: Create the module**

```javascript
// js/ops.js
// Lazy-loaded by ops.html after OPS_SECRET validation.
// Renders metric cards, SVG line chart, and funnel table.

function fmtAED(n) {
  if (n >= 1_000_000) return `AED ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `AED ${Math.round(n / 1_000)}K`;
  return `AED ${Math.round(n).toLocaleString()}`;
}

function fmtNum(n) {
  return n?.toLocaleString() ?? '—';
}

function renderCards(data) {
  const momLabel = data.mom_growth_pct !== null
    ? `${data.mom_growth_pct >= 0 ? '+' : ''}${data.mom_growth_pct}% vs last month`
    : 'No prior month data';

  const cards = [
    { label: 'MRR', value: fmtAED(data.mrr), sub: `ARR ${fmtAED(data.arr)}` },
    { label: 'New Agents (MoM)', value: fmtNum(data.funnel.joined), sub: momLabel },
    { label: 'Paid Agents', value: fmtNum(data.funnel.paid), sub: `Pro + Premium` },
    { label: 'Activation Rate', value: `${data.activation_rate_pct}%`, sub: 'Agents with ≥1 listing' },
    { label: 'Leads (30d)', value: fmtNum(data.total_leads_30d), sub: 'All agents combined' },
    { label: 'Churn (30d)', value: fmtNum(data.churn_30d), sub: 'Cancellations this month' },
    { label: 'Free', value: fmtNum(data.tier_breakdown.free ?? 0), sub: 'Free tier agents' },
    { label: 'Pro', value: fmtNum(data.tier_breakdown.pro ?? 0), sub: 'AED 299/mo' },
    { label: 'Premium', value: fmtNum(data.tier_breakdown.premium ?? 0), sub: 'AED 799/mo' },
  ];

  const container = document.getElementById('metrics-cards');
  if (!container) return;
  container.innerHTML = cards.map(c => `
    <div class="metric-card">
      <div class="label">${c.label}</div>
      <div class="value">${c.value}</div>
      <div class="sub">${c.sub}</div>
    </div>
  `).join('');
}

function renderChart(series) {
  const svg = document.getElementById('lead-chart');
  if (!svg || !series?.length) return;

  const W = 700, H = 120, PAD = 10;
  const maxCount = Math.max(...series.map(d => d.count), 1);
  const xStep = (W - PAD * 2) / (series.length - 1);

  const points = series.map((d, i) => {
    const x = PAD + i * xStep;
    const y = PAD + (1 - d.count / maxCount) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // Fill polygon (line + bottom close)
  const first = points.split(' ')[0];
  const last = points.split(' ').at(-1);
  const fillPoints = `${points} ${last?.split(',')[0]},${H} ${first?.split(',')[0]},${H}`;

  svg.innerHTML = `
    <defs>
      <linearGradient id="lead-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#6366f1" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <polygon points="${fillPoints}" fill="url(#lead-grad)"/>
    <polyline points="${points}" fill="none" stroke="#6366f1" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  `;
}

function renderFunnel(funnel) {
  const section = document.getElementById('funnel-section');
  if (!section) return;

  const steps = [
    { label: 'Joined', count: funnel.joined },
    { label: 'Verified', count: funnel.verified },
    { label: 'Listed First Property', count: funnel.with_property },
    { label: 'Received First Lead', count: funnel.with_lead },
    { label: 'Converted to Paid', count: funnel.paid },
  ];

  const maxCount = funnel.joined || 1;

  section.innerHTML = `
    <h2>Agent Funnel</h2>
    ${steps.map(s => `
      <div class="funnel-row">
        <span class="step">${s.label}</span>
        <span class="count">${fmtNum(s.count)}</span>
      </div>
      <div class="funnel-bar">
        <div class="funnel-bar-fill" style="width:${Math.round((s.count / maxCount) * 100)}%"></div>
      </div>
    `).join('')}
  `;
}

let _lastData = null;
let _refreshTimer = null;

async function refresh(key, functionsUrl) {
  try {
    const res = await fetch(`${functionsUrl}/get-metrics`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    _lastData = data;
    renderCards(data);
    renderChart(data.lead_series);
    renderFunnel(data.funnel);
    // Remove stale badge if present
    document.querySelectorAll('.badge-stale').forEach(el => el.remove());
  } catch (err) {
    console.warn('Metrics refresh failed, showing stale data:', err);
    // Add stale badge to first card value
    const firstValue = document.querySelector('.metric-card .value');
    if (firstValue && !firstValue.querySelector('.badge-stale')) {
      firstValue.insertAdjacentHTML('beforeend', '<span class="badge-stale">stale</span>');
    }
  }
}

export default function renderOps(initialData, key, functionsUrl) {
  _lastData = initialData;
  renderCards(initialData);
  renderChart(initialData.lead_series);
  renderFunnel(initialData.funnel);

  // Auto-refresh every 5 minutes
  _refreshTimer = setInterval(() => refresh(key, functionsUrl), 5 * 60 * 1000);
}
```

- [ ] **Step 2: Verify the module exports correctly**

Open `ops.html` in a local server and check the browser console for errors:

```bash
# Serve the project root locally
npx serve . -p 3000
# Then open http://localhost:3000/ops.html?key=your-secret
```

Expected: dashboard renders with metric cards, chart, and funnel. No console errors.

- [ ] **Step 3: Test stale state by disconnecting network**

In browser DevTools → Network → Offline. Wait for the 5-minute refresh (or manually call `refresh()` in console). Expected: "stale" badge appears on first metric card value.

- [ ] **Step 4: Commit**

```bash
git add js/ops.js
git commit -m "feat: add ops.js metrics dashboard module"
```

---

## Task 6: Add OPS_SECRET to supabase/.env.example

**Files:**
- Modify: `supabase/.env.example`

- [ ] **Step 1: Read the current .env.example**

```bash
cat supabase/.env.example
```

- [ ] **Step 2: Add OPS_SECRET entry**

Add this line to `supabase/.env.example`:

```
# Ops/Admin dashboard secret — set in Netlify env, local dev uses any value
OPS_SECRET=replace-with-a-long-random-string
```

- [ ] **Step 3: Add OPS_SECRET to your local supabase/.env for testing**

```bash
echo "OPS_SECRET=local-ops-secret-dev" >> supabase/.env
```

- [ ] **Step 4: Commit the example update (not the .env)**

```bash
git add supabase/.env.example
git commit -m "chore: add OPS_SECRET to .env.example"
```

---

## Task 7: Smoke Test End-to-End

- [ ] **Step 1: Start the local stack**

```bash
npm run dev
# In second terminal:
supabase functions serve get-metrics --env-file ./supabase/.env --no-verify-jwt
```

- [ ] **Step 2: Serve the frontend**

```bash
npx serve . -p 3000
```

- [ ] **Step 3: Open ops dashboard**

Navigate to: `http://localhost:3000/ops.html?key=local-ops-secret-dev`

Expected:
- Dashboard renders (not the auth error)
- Metric cards show values (may be zeros in local dev with no data)
- SVG chart renders (flat line is fine with no leads)
- Funnel section renders

- [ ] **Step 4: Test wrong key**

Navigate to: `http://localhost:3000/ops.html?key=wrongkey`

Expected: "Access denied" message. No dashboard content.

- [ ] **Step 5: Final commit if any cleanup needed, then push to staging branch**

```bash
git push origin main
```

---

*Wave 1 complete when: `ops.html` is live on staging, metrics render correctly, and all tasks above show ✅.*
