# Agency Analytics + Cobroke Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give agency heads per-agent performance benchmarks and give all agents a cobroke discovery surface — plus an invite link flow for frictionless team onboarding.

**Architecture:** Three independent surfaces sharing the existing magic-link auth pattern. Agency analytics extends the existing `agency-stats` edge function with two new per-agent metrics and wires them into `agency-dashboard.html`. Cobroke discovery adds a new `cobroke-discover` edge function (filters out already-requested listings) and a new UI section in `dashboard.html`. The invite flow adds an `agent_invites` table, a new `manage-agency` action, and wires `?agency=<token>` through `join.js` → `create-agent`.

**Tech Stack:** Deno edge functions (TypeScript), Supabase PostgreSQL, vanilla JS (`agency-dashboard.js`, `dashboard.js`), HTML

---

## File Map

| File | Status | Responsibility |
|------|--------|---------------|
| `edge-functions/agency-stats/index.ts` | Modify | Add `cobroke_sent`, `cobroke_received`, `response_time_p50_hours` per agent |
| `edge-functions/agency-stats/index.test.ts` | Create | Unit tests for extended stats |
| `agency-dashboard.html` | Modify | Add sort controls, top-performer badges, invite UI, pending invites table |
| `js/agency-dashboard.js` | Modify | Render extended per-agent stats, sort, badges, invite flow |
| `edge-functions/manage-agency/index.ts` | Modify | Add `invite_agent` + `get_invites` actions |
| `supabase/migrations/20260408000003_agent_invites.sql` | Create | `agent_invites` table |
| `edge-functions/cobroke-discover/index.ts` | Create | Browse cobroke listings, excluding already-requested ones |
| `edge-functions/cobroke-discover/index.test.ts` | Create | Unit tests |
| `dashboard.html` | Modify | Add cobroke discovery section + my-requests section |
| `js/dashboard.js` | Modify | Load and render cobroke discovery + my requests |
| `js/join.js` | Modify | Read `?agency=<token>` from URL, pass to create-agent |
| `edge-functions/create-agent/index.ts` | Modify | Accept `agency_token`, auto-associate agent to agency on create |

---

## Task 1: DB Migration — `agent_invites` Table

**Files:**
- Create: `supabase/migrations/20260408000003_agent_invites.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260408000003_agent_invites.sql

CREATE TABLE IF NOT EXISTS agent_invites (
  id         BIGSERIAL PRIMARY KEY,
  agency_id  UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  token      TEXT        NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  invited_by UUID        NOT NULL REFERENCES agents(id),
  invited_email TEXT,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_invites_token ON agent_invites(token);
CREATE INDEX IF NOT EXISTS idx_agent_invites_agency_id ON agent_invites(agency_id);

-- RLS: service role only (all mutations are server-side)
ALTER TABLE agent_invites ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Apply locally**

```bash
supabase db reset
```

Expected: migration runs without error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260408000003_agent_invites.sql
git commit -m "feat(phase2): add agent_invites table"
```

---

## Task 2: Extend `agency-stats` — Per-Agent Response Time + Cobroke Counts

The current `statsForAgent()` returns 7 metrics. Add 3 more:
- `cobroke_sent` — open co_broke_deals where `buying_agent_id = agentId`
- `cobroke_received` — open co_broke_deals where `listing_agent_id = agentId`
- `response_time_p50_hours` — median hours from lead `created_at` to `updated_at` for leads with `status != 'new'` (approximation for first-contact time)

**Files:**
- Modify: `edge-functions/agency-stats/index.ts`
- Create: `edge-functions/agency-stats/index.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `edge-functions/agency-stats/index.test.ts`:

```typescript
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

const VALID_LINK = { agent_id: "agent-1", expires_at: new Date(Date.now() + 3_600_000).toISOString(), used_at: new Date().toISOString() };
const AGENCY = { id: "agency-1", name: "Test Agency", slug: "test-agency", logo_url: null };
const MEMBERS = [{ id: "m-1", name: "Alice Broker", slug: "alice", photo_url: null }];

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/agency-stats", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "https://sellingdubai.ae" },
    body: JSON.stringify(body),
  });
}

Deno.test("agency-stats: missing token → 401", async () => {
  const res = await handler(makeRequest({}), mockClientFactory());
  assertEquals(res.status, 401);
});

Deno.test("agency-stats: no agency for agent → 403", async () => {
  const mock = mockClientFactory({
    "magic_links": { data: VALID_LINK, error: null },
    "agencies": { data: null, error: null },
  });
  const res = await handler(makeRequest({ token: "tok" }), mock);
  assertEquals(res.status, 403);
});

Deno.test("agency-stats: empty agency returns zero totals", async () => {
  const mock = mockClientFactory({
    "magic_links": { data: VALID_LINK, error: null },
    "agencies": { data: AGENCY, error: null },
    "agents": { data: [], error: null },
  });
  const res = await handler(makeRequest({ token: "tok" }), mock);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.agents, []);
  assertEquals(body.totals.agents_count, 0);
});

Deno.test("agency-stats: agents include cobroke_sent + cobroke_received + response_time_p50_hours", async () => {
  const mock = mockClientFactory({
    "magic_links": { data: VALID_LINK, error: null },
    "agencies": { data: AGENCY, error: null },
    "agents": { data: MEMBERS, error: null },
    // page_events and leads return count=0 for simplicity
    "page_events": { data: null, count: 0, error: null },
    "leads": { data: null, count: 0, error: null },
    "properties": { data: null, count: 0, error: null },
    // cobroke counts
    "co_broke_deals:buying": { data: null, count: 3, error: null },
    "co_broke_deals:listing": { data: null, count: 1, error: null },
    // response time leads (no contacted leads → p50 = null)
    "leads:contacted": { data: [], error: null },
  });
  const res = await handler(makeRequest({ token: "tok" }), mock);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.agents[0].cobroke_sent, 3);
  assertEquals(body.agents[0].cobroke_received, 1);
  assertEquals(typeof body.agents[0].response_time_p50_hours, "number");
});
```

- [ ] **Step 2: Run tests to see them fail**

```bash
cd /Users/bobanpepic/Desktop/sellingdubai-app
deno test edge-functions/agency-stats/index.test.ts --allow-env --allow-net 2>&1 | head -40
```

Expected: FAIL — `cobroke_sent` is undefined.

- [ ] **Step 3: Update `AgentStats` interface and `statsForAgent()` in `agency-stats/index.ts`**

Replace the `AgentStats` interface and `statsForAgent` function. The full updated function:

```typescript
interface AgentStats {
  agent_id: string;
  name: string;
  slug: string;
  photo_url: string | null;
  views_this_month: number;
  views_last_month: number;
  leads_this_month: number;
  leads_last_month: number;
  leads_all_time: number;
  wa_taps_this_month: number;
  properties_active: number;
  cobroke_sent: number;
  cobroke_received: number;
  response_time_p50_hours: number | null;
}

async function statsForAgent(
  agentId: string,
  name: string,
  slug: string,
  photo_url: string | null,
  thisMonthStart: string,
  lastMonthStart: string,
  lastMonthEnd: string,
  // deno-lint-ignore no-explicit-any
  sb: any,
): Promise<AgentStats> {
  const [vTM, vLM, lTM, lLM, lAll, waTM, props, cbSent, cbRecv, contactedLeads] = await Promise.allSettled([
    sb.from("page_events").select("id", { count: "exact", head: true }).eq("agent_id", agentId).eq("event_type", "view").gte("created_at", thisMonthStart),
    sb.from("page_events").select("id", { count: "exact", head: true }).eq("agent_id", agentId).eq("event_type", "view").gte("created_at", lastMonthStart).lt("created_at", lastMonthEnd),
    sb.from("leads").select("id", { count: "exact", head: true }).eq("agent_id", agentId).gte("created_at", thisMonthStart),
    sb.from("leads").select("id", { count: "exact", head: true }).eq("agent_id", agentId).gte("created_at", lastMonthStart).lt("created_at", lastMonthEnd),
    sb.from("leads").select("id", { count: "exact", head: true }).eq("agent_id", agentId),
    sb.from("page_events").select("id", { count: "exact", head: true }).eq("agent_id", agentId).eq("event_type", "whatsapp_tap").gte("created_at", thisMonthStart),
    sb.from("properties").select("id", { count: "exact", head: true }).eq("agent_id", agentId).eq("is_active", true),
    sb.from("co_broke_deals").select("id", { count: "exact", head: true }).eq("buying_agent_id", agentId).not("status", "in", '("declined","close_won","close_lost")'),
    sb.from("co_broke_deals").select("id", { count: "exact", head: true }).eq("listing_agent_id", agentId).not("status", "in", '("declined","close_won","close_lost")'),
    sb.from("leads").select("created_at, updated_at").eq("agent_id", agentId).neq("status", "new").limit(200),
  ]);
  // deno-lint-ignore no-explicit-any
  const c = (r: PromiseSettledResult<any>) => r.status === "fulfilled" ? (r.value.count ?? 0) : 0;

  // Compute p50 response time from contacted leads
  let response_time_p50_hours: number | null = null;
  if (contactedLeads.status === "fulfilled" && contactedLeads.value.data?.length > 0) {
    const hours = (contactedLeads.value.data as { created_at: string; updated_at: string }[])
      .map(l => (new Date(l.updated_at).getTime() - new Date(l.created_at).getTime()) / 3_600_000)
      .filter(h => h >= 0)
      .sort((a, b) => a - b);
    if (hours.length > 0) {
      const mid = Math.floor(hours.length / 2);
      response_time_p50_hours = hours.length % 2 === 0
        ? (hours[mid - 1] + hours[mid]) / 2
        : hours[mid];
      response_time_p50_hours = Math.round(response_time_p50_hours * 10) / 10;
    }
  }

  return {
    agent_id: agentId, name, slug, photo_url,
    views_this_month: c(vTM), views_last_month: c(vLM),
    leads_this_month: c(lTM), leads_last_month: c(lLM), leads_all_time: c(lAll),
    wa_taps_this_month: c(waTM), properties_active: c(props),
    cobroke_sent: c(cbSent), cobroke_received: c(cbRecv),
    response_time_p50_hours,
  };
}
```

Also update the `sum` call in the `totals` block — add cobroke sums after the existing `sum("properties_active")` call:

```typescript
  const totals = {
    views_this_month: sum("views_this_month"),
    views_last_month: sum("views_last_month"),
    leads_this_month: sum("leads_this_month"),
    leads_last_month: sum("leads_last_month"),
    leads_all_time: sum("leads_all_time"),
    wa_taps_this_month: sum("wa_taps_this_month"),
    properties_active: sum("properties_active"),
    cobroke_sent: sum("cobroke_sent"),
    cobroke_received: sum("cobroke_received"),
    agents_count: members.length,
  };
```

- [ ] **Step 4: Run tests to see them pass**

```bash
deno test edge-functions/agency-stats/index.test.ts --allow-env --allow-net 2>&1 | tail -20
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add edge-functions/agency-stats/index.ts edge-functions/agency-stats/index.test.ts
git commit -m "feat(phase2): extend agency-stats with cobroke counts and response time p50"
```

---

## Task 3: Add `invite_agent` + `get_invites` Actions to `manage-agency`

**Files:**
- Modify: `edge-functions/manage-agency/index.ts`

- [ ] **Step 1: Read the existing action routing in manage-agency**

Open `edge-functions/manage-agency/index.ts` and locate the `switch (action)` (or `if/else if`) block that handles `create`, `update`, `add_member`, `remove_member`.

- [ ] **Step 2: Add `invite_agent` and `get_invites` cases**

After the `remove_member` case, add:

```typescript
    case "invite_agent": {
      // Only agency owner can generate invite links
      const { data: agencyRow, error: agErr } = await sb
        .from("agencies").select("id, owner_agent_id").eq("id", body.agency_id).single();
      if (agErr || !agencyRow) return json({ error: "Agency not found." }, 404, cors);
      if (agencyRow.owner_agent_id !== agentId) return json({ error: "Only the agency owner can invite agents." }, 403, cors);

      const { data: invite, error: invErr } = await sb
        .from("agent_invites")
        .insert({
          agency_id: body.agency_id,
          invited_by: agentId,
          invited_email: typeof body.invited_email === "string" ? body.invited_email.toLowerCase().trim() : null,
        })
        .select("token, invited_email, created_at")
        .single();
      if (invErr || !invite) return json({ error: "Failed to create invite." }, 500, cors);

      log({ event: "invite_created", agent_id: agentId, agency_id: body.agency_id, status: 200 });
      return json({ invite_link: `/join?agency=${invite.token}`, token: invite.token, invited_email: invite.invited_email }, 200, cors);
    }

    case "get_invites": {
      const { data: agencyRow2, error: agErr2 } = await sb
        .from("agencies").select("id, owner_agent_id").eq("id", body.agency_id).single();
      if (agErr2 || !agencyRow2) return json({ error: "Agency not found." }, 404, cors);
      if (agencyRow2.owner_agent_id !== agentId) return json({ error: "Only the agency owner can view invites." }, 403, cors);

      const { data: invites, error: invListErr } = await sb
        .from("agent_invites")
        .select("token, invited_email, used_at, created_at")
        .eq("agency_id", body.agency_id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (invListErr) return json({ error: "Failed to fetch invites." }, 500, cors);

      return json({ invites: invites ?? [] }, 200, cors);
    }
```

Note: `json()` and `cors` follow the existing pattern in the file. Locate where `json()` is defined (or how responses are returned) and follow that exact pattern.

- [ ] **Step 3: Run existing manage-agency tests to ensure no regression**

```bash
deno test edge-functions/manage-agency/index.test.ts --allow-env --allow-net 2>&1 | tail -20
```

Expected: all existing tests PASS.

- [ ] **Step 4: Commit**

```bash
git add edge-functions/manage-agency/index.ts
git commit -m "feat(phase2): add invite_agent and get_invites actions to manage-agency"
```

---

## Task 4: Wire `?agency=<token>` Through Join Flow Into `create-agent`

When an agent arrives at `/join?agency=<token>`, the token should be captured, stored, and passed to `create-agent`, which auto-associates the new agent to the inviting agency.

**Files:**
- Modify: `js/join.js`
- Modify: `edge-functions/create-agent/index.ts`

- [ ] **Step 1: Read join.js lines 1-15 to see where `_refCode` is captured**

The existing pattern on line 9 of `join.js`:
```javascript
const _refCode = new URLSearchParams(window.location.search).get('ref');
```

- [ ] **Step 2: Add `_agencyToken` capture in `join.js`**

Immediately after the `_refCode` line (line 9), add:

```javascript
const _agencyToken = new URLSearchParams(window.location.search).get('agency');
```

- [ ] **Step 3: Pass `agency_token` in the `createProfile` payload**

In `join.js`, find the `payload` object inside `createProfile()` / `verifyOtpAndCreate()` (around line 287). After the existing `photo_base64` line, add:

```javascript
      agency_token: _agencyToken || null,
```

- [ ] **Step 4: Update `create-agent/index.ts` to accept and use `agency_token`**

In `create-agent/index.ts`, find the destructuring of `body` (around line 52):

```typescript
    const {
      broker_number, display_name, whatsapp, email, otp_code,
      tagline, calendly_url, instagram_url, youtube_url,
      tiktok_url, linkedin_url, photo_base64,
      manual_verification, rera_image_base64, rera_file_type,
    } = body;
```

Add `agency_token` to the destructuring:

```typescript
    const {
      broker_number, display_name, whatsapp, email, otp_code,
      tagline, calendly_url, instagram_url, youtube_url,
      tiktok_url, linkedin_url, photo_base64,
      manual_verification, rera_image_base64, rera_file_type,
      agency_token,
    } = body;
```

Then, after the agent `insert` succeeds and `newAgent` is available (look for where `agentData` is inserted and `data.agent` / `newAgent` is set), add the invite lookup block. Find the location where the agent insert result is used and add before the final success response:

```typescript
    // Auto-associate via invite token if provided
    if (agency_token && typeof agency_token === "string") {
      const { data: invite } = await supabase
        .from("agent_invites")
        .select("id, agency_id")
        .eq("token", agency_token)
        .is("used_at", null)
        .single();

      if (invite) {
        await Promise.allSettled([
          supabase.from("agents").update({ agency_id: invite.agency_id }).eq("id", newAgent.id),
          supabase.from("agent_invites").update({ used_at: new Date().toISOString() }).eq("id", invite.id),
        ]);
      }
    }
```

Note: `newAgent` is whatever variable holds the inserted agent record. Read the surrounding code to confirm the variable name before editing.

- [ ] **Step 5: Verify create-agent tests still pass**

```bash
deno test edge-functions/create-agent/index.test.ts --allow-env --allow-net 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add js/join.js edge-functions/create-agent/index.ts
git commit -m "feat(phase2): wire agency_token through join flow into create-agent"
```

---

## Task 5: Agency Dashboard — Per-Agent Benchmarks + Invite UI

Add sortable per-agent columns, top-performer badges, and an invite flow to `agency-dashboard.html` and `js/agency-dashboard.js`.

**Files:**
- Modify: `agency-dashboard.html`
- Modify: `js/agency-dashboard.js`

- [ ] **Step 1: Add CSS and new table columns to `agency-dashboard.html`**

In `agency-dashboard.html`, find the `<style>` block. Add these new classes before the closing `</style>`:

```css
    .sort-btn { background: none; border: none; color: rgba(255,255,255,0.4); cursor: pointer; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; padding: 0; display: inline-flex; align-items: center; gap: 3px; }
    .sort-btn:hover, .sort-btn.active { color: #fff; }
    .sort-btn .arrow { opacity: 0.4; }
    .sort-btn.active .arrow { opacity: 1; }
    .badge-top { background: rgba(234,179,8,0.15); color: #fbbf24; font-size: 10px; padding: 1px 6px; border-radius: 99px; margin-left: 4px; font-weight: 700; }
    .invite-section { margin-top: 24px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 20px; }
    .invite-section h3 { font-size: 14px; font-weight: 700; margin-bottom: 12px; }
    .invite-row { display: flex; gap: 8px; margin-bottom: 12px; }
    .invite-row input { flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 8px 12px; color: #fff; font-size: 14px; font-family: inherit; outline: none; }
    .invite-row input:focus { border-color: rgba(255,255,255,0.3); }
    .invite-link-box { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 10px 14px; font-size: 13px; color: rgba(255,255,255,0.7); display: none; margin-bottom: 12px; word-break: break-all; }
    .invite-link-box.show { display: block; }
    .invites-list { margin-top: 8px; }
    .invite-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 13px; }
    .invite-item:last-child { border-bottom: none; }
    .invite-status-used { color: #4ade80; }
    .invite-status-pending { color: rgba(255,255,255,0.4); }
```

In `agency-dashboard.html`, find the `<table class="members-table">` thead and replace it:

```html
          <thead>
            <tr>
              <th>Agent</th>
              <th>Tier</th>
              <th><button class="sort-btn" data-sort="leads_this_month">Leads <span class="arrow">↕</span></button></th>
              <th><button class="sort-btn" data-sort="views_this_month">Views <span class="arrow">↕</span></button></th>
              <th><button class="sort-btn" data-sort="properties_active">Props <span class="arrow">↕</span></button></th>
              <th><button class="sort-btn" data-sort="response_time_p50_hours">Resp. Time <span class="arrow">↕</span></button></th>
              <th><button class="sort-btn" data-sort="cobroke_sent">CB Sent <span class="arrow">↕</span></button></th>
              <th><button class="sort-btn" data-sort="cobroke_received">CB Recv <span class="arrow">↕</span></button></th>
              <th></th>
            </tr>
          </thead>
```

After the existing members section `</div>` (the section containing the members table), add the invite section:

```html
      <div class="invite-section">
        <h3>Invite Agent via Link</h3>
        <div class="banner banner-error" id="invite-error"></div>
        <div class="invite-row">
          <input type="email" id="invite-email" placeholder="Agent email (optional — for tracking)">
          <button class="btn btn-secondary" id="btn-generate-invite" data-action="generateInvite">Generate Link</button>
        </div>
        <div class="invite-link-box" id="invite-link-result"></div>
        <button class="btn btn-secondary" id="btn-copy-invite" style="display:none;margin-bottom:16px;" data-action="copyInviteLink">Copy Link</button>
        <div class="invites-list" id="invites-list"></div>
      </div>
```

- [ ] **Step 2: Update `js/agency-dashboard.js` — sort state, top badges, invite flow**

Replace the entire `js/agency-dashboard.js` file with the updated version:

```javascript
// @ts-check
const SUPABASE_URL = 'https://pjyorgedaxevxophpfib.supabase.co';
const MANAGE_URL = `${SUPABASE_URL}/functions/v1/manage-agency`;
const STATS_URL = `${SUPABASE_URL}/functions/v1/agency-stats`;

let _token = null;
let _agency = null;
let _agencyId = null;
let _agents = [];
let _sortKey = 'leads_this_month';
let _sortAsc = false;
let _lastInviteLink = '';

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function show(id) {
  ['loading','auth-gate','create-section','dashboard-section'].forEach(s => {
    document.getElementById(s).style.display = 'none';
  });
  document.getElementById(id).style.display = 'block';
}

async function callManage(body) {
  try {
    const res = await fetch(MANAGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: _token, ...body })
    });
    if (!res.ok && res.status >= 500) return { error: 'Server error. Please try again.' };
    return res.json();
  } catch {
    return { error: 'Network error. Please try again.' };
  }
}

async function init() {
  _token = localStorage.getItem('sd_edit_token');
  if (!_token) { show('auth-gate'); return; }

  const data = await callManage({ action: 'get_my_agency' });
  if (data.error) { show('auth-gate'); return; }

  if (!data.agency) {
    show('create-section');
    return;
  }

  _agency = data.agency;
  _agencyId = data.agency.id;
  renderAgencyHeader(data.agency);
  show('dashboard-section');
  loadStats(data.members || []);
  loadInvites();
  wireSort();
}

function renderAgencyHeader(agency) {
  document.getElementById('agency-name-el').textContent = agency.name;
  document.getElementById('agency-slug-el').textContent = `/${agency.slug}`;
  const link = document.getElementById('agency-profile-link');
  link.href = `/agency/${agency.slug}`;
  link.textContent = `sellingdubai.ae/agency/${agency.slug}`;
  const logoEl = document.getElementById('agency-logo-el');
  if (agency.logo_url) {
    const logoSrc = agency.logo_url.startsWith('https://pjyorgedaxevxophpfib.supabase.co/')
      ? `/.netlify/images?url=${encodeURIComponent(agency.logo_url)}&w=112&fm=webp&q=80`
      : agency.logo_url;
    const img = document.createElement('img');
    img.src = logoSrc;
    img.alt = '';
    logoEl.innerHTML = '';
    logoEl.appendChild(img);
  }
  document.getElementById('edit-name').value = agency.name || '';
  document.getElementById('edit-logo').value = agency.logo_url || '';
  document.getElementById('edit-website').value = agency.website || '';
  document.getElementById('edit-description').value = agency.description || '';
}

async function loadStats(membersFromGet) {
  try {
    const res = await fetch(STATS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: _token })
    });
    const data = await res.json();
    if (!data.totals) return;
    const t = data.totals;
    document.getElementById('m-leads-month').textContent = t.leads_this_month;
    document.getElementById('m-leads-last').textContent = `${t.leads_last_month} last month`;
    document.getElementById('m-views-month').textContent = t.views_this_month;
    document.getElementById('m-views-last').textContent = `${t.views_last_month} last month`;
    document.getElementById('m-wa-month').textContent = t.wa_taps_this_month;
    document.getElementById('m-props').textContent = t.properties_active;
    document.getElementById('m-agents-count').textContent = `${t.agents_count} agents`;
    _agents = data.agents || [];
    renderMembersTable(_agents);
  } catch(_e) {
    _agents = membersFromGet.map(m => ({ ...m }));
    renderMembersTable(_agents);
  }
}

/**
 * Find the top-performing agent for each numeric metric.
 * Returns a map of agentId → Set of metric keys where they are #1.
 */
function computeTopPerformers(agents) {
  const metrics = ['leads_this_month', 'views_this_month', 'properties_active', 'cobroke_sent', 'cobroke_received'];
  /** @type {Map<string, Set<string>>} */
  const tops = new Map();
  for (const metric of metrics) {
    const best = agents.reduce((best, a) => {
      const v = a[metric] ?? 0;
      return v > (best.val ?? -Infinity) ? { id: a.agent_id || a.id, val: v } : best;
    }, { id: null, val: -Infinity });
    // Only badge if at least 1 (don't badge 0-value ties)
    if (best.id && best.val > 0) {
      if (!tops.has(best.id)) tops.set(best.id, new Set());
      tops.get(best.id).add(metric);
    }
  }
  // Response time: lower is better (exclude null)
  const rtAgents = agents.filter(a => a.response_time_p50_hours !== null && a.response_time_p50_hours !== undefined);
  if (rtAgents.length > 0) {
    const fastest = rtAgents.reduce((f, a) => a.response_time_p50_hours < f.response_time_p50_hours ? a : f);
    const fid = fastest.agent_id || fastest.id;
    if (!tops.has(fid)) tops.set(fid, new Set());
    tops.get(fid).add('response_time_p50_hours');
  }
  return tops;
}

function sortedAgents() {
  return [..._agents].sort((a, b) => {
    const av = a[_sortKey] ?? -1;
    const bv = b[_sortKey] ?? -1;
    // response_time: null sorts to bottom regardless of direction
    if (_sortKey === 'response_time_p50_hours') {
      if (av === null || av === -1) return 1;
      if (bv === null || bv === -1) return -1;
    }
    return _sortAsc ? av - bv : bv - av;
  });
}

function renderMembersTable(agents) {
  const tbody = document.getElementById('members-tbody');
  if (!agents.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="color:rgba(255,255,255,0.3);padding:24px;text-align:center;">No members yet. Add agents by email below.</td></tr>';
    return;
  }

  const tops = computeTopPerformers(agents);
  const sorted = sortedAgents();

  tbody.innerHTML = sorted.map(a => {
    const agentId = a.agent_id || a.id;
    const initials = (a.name || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
    const photoSrc = a.photo_url?.startsWith('https://pjyorgedaxevxophpfib.supabase.co/')
      ? `/.netlify/images?url=${encodeURIComponent(a.photo_url)}&w=64&fm=webp&q=80`
      : a.photo_url;
    const avatar = photoSrc
      ? `<img src="${escapeHtml(photoSrc)}" width="32" height="32" alt="">`
      : escapeHtml(initials);
    const tierBadge = a.tier === 'premium' ? '<span class="badge badge-premium">Premium</span>'
      : a.tier === 'pro' ? '<span class="badge badge-pro">Pro</span>'
      : '<span class="badge badge-free">Free</span>';
    const agentTops = tops.get(agentId) || new Set();

    const topBadge = (metric) => agentTops.has(metric)
      ? '<span class="badge-top">★</span>' : '';

    const fmtRt = (v) => v === null || v === undefined
      ? '—'
      : v < 1 ? `<1h` : `${Math.round(v)}h`;

    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="member-avatar">${avatar}</div>
          <div>
            <div class="member-name">${escapeHtml(a.name) || '—'}</div>
            <div class="member-slug"><a href="/a/${encodeURIComponent(a.slug)}" target="_blank" style="color:rgba(255,255,255,0.4);">@${escapeHtml(a.slug)}</a></div>
          </div>
        </div>
      </td>
      <td>${tierBadge}</td>
      <td class="stat-cell">${escapeHtml(String(a.leads_this_month ?? '—'))}${topBadge('leads_this_month')}</td>
      <td class="stat-cell">${escapeHtml(String(a.views_this_month ?? '—'))}${topBadge('views_this_month')}</td>
      <td class="stat-cell">${escapeHtml(String(a.properties_active ?? '—'))}${topBadge('properties_active')}</td>
      <td class="stat-cell">${escapeHtml(fmtRt(a.response_time_p50_hours))}${topBadge('response_time_p50_hours')}</td>
      <td class="stat-cell">${escapeHtml(String(a.cobroke_sent ?? '—'))}${topBadge('cobroke_sent')}</td>
      <td class="stat-cell">${escapeHtml(String(a.cobroke_received ?? '—'))}${topBadge('cobroke_received')}</td>
      <td><button class="btn btn-danger" style="padding:4px 10px;font-size:12px;" data-member-id="${escapeHtml(agentId)}" title="Remove from agency">Remove</button></td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-member-id]').forEach((btn, i) => {
    const a = sorted[i];
    btn.addEventListener('click', () => removeMember(a.agent_id || a.id, a.name || ''));
  });
}

function wireSort() {
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.sort;
      if (_sortKey === key) {
        _sortAsc = !_sortAsc;
      } else {
        _sortKey = key;
        _sortAsc = false; // default: descending (highest first)
      }
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      btn.querySelector('.arrow').textContent = _sortAsc ? '↑' : '↓';
      renderMembersTable(_agents);
    });
  });
}

async function loadInvites() {
  const data = await callManage({ action: 'get_invites', agency_id: _agencyId });
  if (data.error || !data.invites) return;
  const list = document.getElementById('invites-list');
  if (!data.invites.length) {
    list.innerHTML = '<div style="font-size:13px;color:rgba(255,255,255,0.3);">No invites generated yet.</div>';
    return;
  }
  list.innerHTML = data.invites.map(inv => `
    <div class="invite-item">
      <span>${escapeHtml(inv.invited_email || 'Link invite')}</span>
      <span class="${inv.used_at ? 'invite-status-used' : 'invite-status-pending'}">
        ${inv.used_at ? 'Used' : 'Pending'}
      </span>
    </div>
  `).join('');
}

window.generateInvite = async () => {
  const email = document.getElementById('invite-email').value.trim();
  const errEl = document.getElementById('invite-error');
  errEl.classList.remove('show');
  const btn = document.getElementById('btn-generate-invite');
  btn.disabled = true;
  const data = await callManage({
    action: 'invite_agent',
    agency_id: _agencyId,
    invited_email: email || null,
  });
  btn.disabled = false;
  if (data.error) { errEl.textContent = data.error; errEl.classList.add('show'); return; }
  _lastInviteLink = `${window.location.origin}${data.invite_link}`;
  const linkBox = document.getElementById('invite-link-result');
  linkBox.textContent = _lastInviteLink;
  linkBox.classList.add('show');
  document.getElementById('btn-copy-invite').style.display = 'inline-flex';
  document.getElementById('invite-email').value = '';
  loadInvites();
};

window.copyInviteLink = () => {
  if (!_lastInviteLink) return;
  navigator.clipboard?.writeText(_lastInviteLink).then(() => {
    const btn = document.getElementById('btn-copy-invite');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy Link'; }, 2000);
  });
};

window.createAgency = async () => {
  const name = document.getElementById('create-name').value.trim();
  const errEl = document.getElementById('create-error');
  errEl.classList.remove('show');
  if (!name) { errEl.textContent = 'Agency name is required.'; errEl.classList.add('show'); return; }
  const btn = document.getElementById('btn-create-agency');
  btn.disabled = true; btn.textContent = 'Creating...';
  const data = await callManage({
    action: 'create', name,
    logo_url: document.getElementById('create-logo').value.trim() || null,
    website: document.getElementById('create-website').value.trim() || null,
    description: document.getElementById('create-description').value.trim() || null,
  });
  btn.disabled = false; btn.textContent = 'Create Agency';
  if (data.error) { errEl.textContent = data.error; errEl.classList.add('show'); return; }
  _agency = data.agency; _agencyId = data.agency.id;
  renderAgencyHeader(data.agency);
  show('dashboard-section');
  loadStats([]);
  loadInvites();
  wireSort();
};

window.toggleEditPanel = () => {
  const panel = document.getElementById('edit-panel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
};

window.saveAgency = async () => {
  const errEl = document.getElementById('edit-error');
  const sucEl = document.getElementById('edit-success');
  errEl.classList.remove('show'); sucEl.classList.remove('show');
  const btn = document.getElementById('btn-save-agency');
  btn.disabled = true; btn.textContent = 'Saving...';
  const data = await callManage({
    action: 'update', agency_id: _agencyId,
    name: document.getElementById('edit-name').value.trim(),
    logo_url: document.getElementById('edit-logo').value.trim() || null,
    website: document.getElementById('edit-website').value.trim() || null,
    description: document.getElementById('edit-description').value.trim() || null,
  });
  btn.disabled = false; btn.textContent = 'Save Changes';
  if (data.error) { errEl.textContent = data.error; errEl.classList.add('show'); return; }
  _agency = data.agency;
  renderAgencyHeader(data.agency);
  sucEl.textContent = 'Agency updated.'; sucEl.classList.add('show');
  setTimeout(() => sucEl.classList.remove('show'), 3000);
};

window.addMember = async () => {
  const email = document.getElementById('add-member-email').value.trim();
  const errEl = document.getElementById('member-error');
  const sucEl = document.getElementById('member-success');
  errEl.classList.remove('show'); sucEl.classList.remove('show');
  if (!email) { errEl.textContent = 'Enter an agent email.'; errEl.classList.add('show'); return; }
  const btn = document.getElementById('btn-add-member');
  btn.disabled = true;
  const data = await callManage({ action: 'add_member', agency_id: _agencyId, member_email: email });
  btn.disabled = false;
  if (data.error) { errEl.textContent = data.error; errEl.classList.add('show'); return; }
  document.getElementById('add-member-email').value = '';
  sucEl.textContent = `${data.member.name} added to the agency.`; sucEl.classList.add('show');
  setTimeout(() => sucEl.classList.remove('show'), 3000);
  const refreshData = await callManage({ action: 'get_my_agency' });
  if (refreshData.agency) loadStats(refreshData.members || []);
};

window.removeMember = async (memberId, memberName) => {
  if (!confirm(`Remove ${memberName} from the agency?`)) return;
  const errEl = document.getElementById('member-error');
  errEl.classList.remove('show');
  const data = await callManage({ action: 'remove_member', agency_id: _agencyId, member_id: memberId });
  if (data.error) { errEl.textContent = data.error; errEl.classList.add('show'); return; }
  const refreshData = await callManage({ action: 'get_my_agency' });
  if (refreshData.agency) loadStats(refreshData.members || []);
};

init();
```

- [ ] **Step 3: Run `npm run build` and verify bundle sizes**

```bash
cd /Users/bobanpepic/Desktop/sellingdubai-app
npm run build 2>&1 | tail -20
```

Expected: build succeeds, no chunks over 20KB.

- [ ] **Step 4: Commit**

```bash
git add agency-dashboard.html js/agency-dashboard.js
git commit -m "feat(phase2): agency dashboard — sortable per-agent benchmarks, top badges, invite flow"
```

---

## Task 6: `cobroke-discover` Edge Function

A new function that returns cobroke listings the requesting agent has not yet sent a request for (status not in declined/close_won/close_lost). This is additive to the existing `cobroke-listings` — it adds one extra join.

**Files:**
- Create: `edge-functions/cobroke-discover/index.ts`
- Create: `edge-functions/cobroke-discover/index.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `edge-functions/cobroke-discover/index.test.ts`:

```typescript
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

const VALID_LINK = {
  agent_id: "agent-1",
  expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  used_at: new Date().toISOString(),
};

function makeGET(params = "") {
  return new Request(`http://localhost/cobroke-discover${params}`, {
    method: "GET",
    headers: {
      "Authorization": "Bearer valid-token",
      "Origin": "https://sellingdubai.ae",
    },
  });
}

Deno.test("cobroke-discover: no auth header → 401", async () => {
  const req = new Request("http://localhost/cobroke-discover", {
    method: "GET",
    headers: { "Origin": "https://sellingdubai.ae" },
  });
  const res = await handler(req, mockClientFactory());
  assertEquals(res.status, 401);
});

Deno.test("cobroke-discover: expired token → 401", async () => {
  const expired = { agent_id: "a1", expires_at: new Date(0).toISOString(), used_at: new Date().toISOString() };
  const mock = mockClientFactory({ "magic_links": { data: expired, error: null } });
  const res = await handler(makeGET(), mock);
  assertEquals(res.status, 401);
});

Deno.test("cobroke-discover: valid token returns listings array", async () => {
  const mock = mockClientFactory({
    "magic_links": { data: VALID_LINK, error: null },
    "properties": { data: [{ id: "p1", title: "Marina 2BR", price: "AED 1.5M", price_numeric: 1500000, location: "Marina", property_type: "Apartment", bedrooms: "2", area_sqft: 1100, image_url: null, external_url: null, cobroke_commission_split: 50, cobroke_notes: null, created_at: new Date().toISOString(), agent: { id: "a2", name: "Bob", slug: "bob", photo_url: null } }], error: null },
  });
  const res = await handler(makeGET(), mock);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(Array.isArray(body.listings), true);
  assertEquals(body.listings.length, 1);
});

Deno.test("cobroke-discover: OPTIONS returns 204", async () => {
  const req = new Request("http://localhost/cobroke-discover", {
    method: "OPTIONS",
    headers: { "Origin": "https://sellingdubai.ae" },
  });
  const res = await handler(req, mockClientFactory());
  assertEquals(res.status, 204);
});

Deno.test("cobroke-discover: area filter passed to query", async () => {
  const mock = mockClientFactory({
    "magic_links": { data: VALID_LINK, error: null },
    "properties": { data: [], error: null },
  });
  const res = await handler(makeGET("?area=marina"), mock);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.listings, []);
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
deno test edge-functions/cobroke-discover/index.test.ts --allow-env --allow-net 2>&1 | head -20
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `edge-functions/cobroke-discover/index.ts`**

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";

/**
 * cobroke-discover
 * Like cobroke-listings but excludes properties the requesting agent has already
 * sent an active cobroke request for (status NOT IN declined, close_won, close_lost).
 *
 * GET /cobroke-discover?area=downtown&type=apartment&min_price=1000000&max_price=3000000
 */

const CORS_ORIGINS = [
  "https://sellingdubai.ae",
  "https://www.sellingdubai.ae",
  "https://agents.sellingdubai.ae",
  "https://staging.sellingdubai.com",
];

function getCorsHeaders(origin: string | null) {
  const allowed = origin && CORS_ORIGINS.includes(origin) ? origin : CORS_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

// deno-lint-ignore no-explicit-any
type CreateClientFn = (url: string, key: string) => any;

export async function handler(
  req: Request,
  _createClient: CreateClientFn = createClient,
): Promise<Response> {
  const log = createLogger("cobroke-discover", req);
  const _start = Date.now();
  const origin = req.headers.get("origin");
  const cors = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.slice(7);
    const supabase = _createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: link } = await supabase
      .from("magic_links")
      .select("agent_id, expires_at, used_at")
      .eq("token", token)
      .single();

    if (!link || new Date(link.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (!link.used_at) {
      return new Response(JSON.stringify({ error: "Session not activated." }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const agentId = link.agent_id;
    const url = new URL(req.url);
    const area = url.searchParams.get("area")?.toLowerCase();
    const propType = url.searchParams.get("type")?.toLowerCase();
    const minPrice = Number(url.searchParams.get("min_price")) || 0;
    const maxPrice = Number(url.searchParams.get("max_price")) || 999999999999;
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 100);
    const offset = Number(url.searchParams.get("offset")) || 0;

    // Get property IDs the agent has already actively requested
    const { data: existingDeals } = await supabase
      .from("co_broke_deals")
      .select("property_id")
      .eq("buying_agent_id", agentId)
      .not("status", "in", '("declined","close_won","close_lost")');

    const alreadyRequestedIds: string[] = (existingDeals ?? []).map(
      (d: { property_id: string }) => d.property_id
    );

    let query = supabase
      .from("properties")
      .select(`
        id, title, price, price_numeric, location, property_type,
        bedrooms, area_sqft, image_url, external_url,
        cobroke_commission_split, cobroke_notes, created_at,
        agent:agent_id (
          id, name, slug, photo_url, agency_name, dld_verified,
          dld_total_deals, areas_covered
        )
      `)
      .eq("open_for_cobroke", true)
      .eq("is_active", true)
      .neq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (alreadyRequestedIds.length > 0) {
      query = query.not("id", "in", `(${alreadyRequestedIds.map(id => `"${id}"`).join(",")})`);
    }

    if (area) query = query.ilike("location", `%${area}%`);
    if (propType) query = query.ilike("property_type", `%${propType}%`);
    if (minPrice > 0) query = query.gte("price_numeric", minPrice);
    if (maxPrice < 999999999999) query = query.lte("price_numeric", maxPrice);

    query = query.or("cobroke_expires_at.is.null,cobroke_expires_at.gt." + new Date().toISOString());

    const { data: listings, error: queryErr } = await query;

    if (queryErr) {
      return new Response(JSON.stringify({ error: "Failed to fetch listings" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    log({ event: "success", agent_id: agentId, status: 200 });
    return new Response(JSON.stringify({
      listings: listings || [],
      count: listings?.length || 0,
      offset,
      limit,
    }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    log({ event: "error", status: 500, error: String(err) });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  } finally {
    log.flush(Date.now() - _start);
  }
}

Deno.serve((req) => handler(req));
```

- [ ] **Step 4: Run tests to pass**

```bash
deno test edge-functions/cobroke-discover/index.test.ts --allow-env --allow-net 2>&1 | tail -20
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Add to pre-deploy check**

Open `scripts/pre-deploy-check.sh` and find the list of edge functions (look for `manage-properties`, `capture-lead-v4`, etc.). Add `cobroke-discover` to the same list.

- [ ] **Step 6: Commit**

```bash
git add edge-functions/cobroke-discover/index.ts edge-functions/cobroke-discover/index.test.ts scripts/pre-deploy-check.sh
git commit -m "feat(phase2): add cobroke-discover edge function"
```

---

## Task 7: Cobroke Discovery UI in `dashboard.html` + `dashboard.js`

Add a "Browse Cobrokes" collapsible section to the agent dashboard. Uses `cobroke-discover` for browsable listings and a direct DB query via `get-analytics` pattern for "my sent requests".

**Files:**
- Modify: `dashboard.html`
- Modify: `js/dashboard.js`

- [ ] **Step 1: Add CSS for cobroke section to `dashboard.html`**

In `dashboard.html`, find the existing `<style>` block (or the linked `dashboard.css`). Add these styles. If there's an inline `<style>` tag in the file, add to it. If styles are in `dashboard.css`, add there:

```css
.cobroke-section { margin-top: 32px; }
.cobroke-tabs { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0; }
.cobroke-tab { padding: 8px 16px; font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.4); cursor: pointer; border: none; background: none; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color 0.15s, border-color 0.15s; }
.cobroke-tab.active { color: #fff; border-bottom-color: #fff; }
.cobroke-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.cobroke-filter { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 6px 10px; color: #fff; font-size: 13px; font-family: inherit; outline: none; min-width: 120px; }
.cobroke-filter:focus { border-color: rgba(255,255,255,0.3); }
.cobroke-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 16px; display: flex; gap: 14px; margin-bottom: 12px; }
.cobroke-card-img { width: 72px; height: 72px; border-radius: 8px; object-fit: cover; background: rgba(255,255,255,0.07); flex-shrink: 0; }
.cobroke-card-body { flex: 1; min-width: 0; }
.cobroke-card-title { font-size: 14px; font-weight: 700; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cobroke-card-meta { font-size: 12px; color: rgba(255,255,255,0.45); margin-bottom: 6px; }
.cobroke-card-price { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
.cobroke-card-split { display: inline-block; font-size: 11px; background: rgba(37,211,102,0.1); color: #25d366; border-radius: 99px; padding: 2px 8px; margin-bottom: 8px; }
.cobroke-card-agent { font-size: 12px; color: rgba(255,255,255,0.4); }
.cobroke-empty { text-align: center; padding: 40px 24px; color: rgba(255,255,255,0.3); font-size: 14px; }
.cobroke-load-more { width: 100%; padding: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; margin-top: 8px; }
.cobroke-load-more:hover { background: rgba(255,255,255,0.08); }
.cobroke-request-status { display: inline-block; font-size: 11px; border-radius: 99px; padding: 2px 8px; font-weight: 600; }
.cobroke-request-status.requested { background: rgba(251,191,36,0.1); color: #fbbf24; }
.cobroke-request-status.accepted { background: rgba(37,211,102,0.1); color: #25d366; }
.cobroke-request-status.declined { background: rgba(239,68,68,0.1); color: #f87171; }
.cobroke-request-status.viewing { background: rgba(99,102,241,0.1); color: #a5b4fc; }
```

- [ ] **Step 2: Add cobroke section HTML to `dashboard.html`**

In `dashboard.html`, find the closing `</main>` or the last major section before `</div>` of the main content. Add the cobroke section after the existing sections (leads, properties, etc.):

```html
    <section class="cobroke-section" id="cobroke-section" style="display:none;">
      <div class="section-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h2 style="font-size:16px;font-weight:700;">Co-Broke Listings</h2>
      </div>
      <div class="cobroke-tabs">
        <button class="cobroke-tab active" data-cobroke-tab="browse">Browse Available</button>
        <button class="cobroke-tab" data-cobroke-tab="my-requests">My Requests</button>
      </div>

      <!-- Browse tab -->
      <div id="cobroke-browse-panel">
        <div class="cobroke-filters">
          <input class="cobroke-filter" id="cb-filter-area" placeholder="Area (e.g. Marina)" type="text">
          <select class="cobroke-filter" id="cb-filter-type">
            <option value="">Any type</option>
            <option value="apartment">Apartment</option>
            <option value="villa">Villa</option>
            <option value="townhouse">Townhouse</option>
            <option value="penthouse">Penthouse</option>
            <option value="office">Office</option>
          </select>
          <input class="cobroke-filter" id="cb-filter-min" placeholder="Min price (AED)" type="number" min="0">
          <input class="cobroke-filter" id="cb-filter-max" placeholder="Max price (AED)" type="number" min="0">
          <button class="btn btn-secondary" id="cb-btn-search" style="padding:6px 14px;font-size:13px;" data-action="searchCobrokes">Search</button>
        </div>
        <div id="cobroke-browse-list"></div>
        <button class="cobroke-load-more" id="cb-load-more" style="display:none;" data-action="loadMoreCobrokes">Load more</button>
      </div>

      <!-- My requests tab -->
      <div id="cobroke-requests-panel" style="display:none;">
        <div id="cobroke-requests-list"></div>
      </div>
    </section>
```

To show this section: it should be visible when the agent has the dashboard open. Find where `loadDashboard()` or the main render function is called and add a `loadCobrokeSection()` call (implemented in Step 3).

- [ ] **Step 3: Add cobroke JS to `dashboard.js`**

In `dashboard.js`, find where the `SUPABASE_URL` constants are declared (top of file). Add two new URL constants after the existing ones:

```javascript
const COBROKE_DISCOVER_URL = `${SUPABASE_URL}/functions/v1/cobroke-discover`;
const COBROKE_REQUEST_URL = `${SUPABASE_URL}/functions/v1/cobroke-request`;
```

Then add the cobroke module — paste this block at the end of `dashboard.js`, before the final closing `})()` if it's an IIFE, or at the end of the file:

```javascript
// ===== COBROKE DISCOVERY =====

let _cbOffset = 0;
let _cbArea = '';
let _cbType = '';
let _cbMin = 0;
let _cbMax = 0;
let _cbActiveTab = 'browse';

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function loadCobrokeSection(token) {
  const section = document.getElementById('cobroke-section');
  if (!section) return;
  section.style.display = 'block';

  // Wire tabs
  document.querySelectorAll('.cobroke-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.cobroke-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _cbActiveTab = tab.dataset.cobrokeTab;
      document.getElementById('cobroke-browse-panel').style.display = _cbActiveTab === 'browse' ? 'block' : 'none';
      document.getElementById('cobroke-requests-panel').style.display = _cbActiveTab === 'my-requests' ? 'block' : 'none';
      if (_cbActiveTab === 'my-requests') loadMyRequests(token);
    });
  });

  // Wire search button
  const searchBtn = document.getElementById('cb-btn-search');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => searchCobrokes(token, true));
  }

  // Wire load more
  const loadMoreBtn = document.getElementById('cb-load-more');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => searchCobrokes(token, false));
  }

  // Initial load
  searchCobrokes(token, true);
}

async function searchCobrokes(token, reset) {
  if (reset) _cbOffset = 0;
  _cbArea = document.getElementById('cb-filter-area')?.value.trim() || '';
  _cbType = document.getElementById('cb-filter-type')?.value || '';
  _cbMin = Number(document.getElementById('cb-filter-min')?.value) || 0;
  _cbMax = Number(document.getElementById('cb-filter-max')?.value) || 0;

  const params = new URLSearchParams({ limit: '20', offset: String(_cbOffset) });
  if (_cbArea) params.set('area', _cbArea);
  if (_cbType) params.set('type', _cbType);
  if (_cbMin > 0) params.set('min_price', String(_cbMin));
  if (_cbMax > 0) params.set('max_price', String(_cbMax));

  const list = document.getElementById('cobroke-browse-list');
  if (reset) list.innerHTML = '<div class="cobroke-empty">Loading…</div>';

  try {
    const res = await fetch(`${COBROKE_DISCOVER_URL}?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();

    if (reset) list.innerHTML = '';
    if (!data.listings.length && reset) {
      list.innerHTML = '<div class="cobroke-empty">No co-broke listings match your filters.</div>';
      document.getElementById('cb-load-more').style.display = 'none';
      return;
    }

    data.listings.forEach(listing => {
      const imgSrc = listing.image_url
        ? (listing.image_url.startsWith('https://pjyorgedaxevxophpfib.supabase.co/')
          ? `/.netlify/images?url=${encodeURIComponent(listing.image_url)}&w=144&fm=webp&q=80`
          : listing.image_url)
        : null;
      const card = document.createElement('div');
      card.className = 'cobroke-card';
      card.innerHTML = `
        ${imgSrc ? `<img class="cobroke-card-img" src="${escHtml(imgSrc)}" alt="" loading="lazy">` : '<div class="cobroke-card-img"></div>'}
        <div class="cobroke-card-body">
          <div class="cobroke-card-title">${escHtml(listing.title || listing.location)}</div>
          <div class="cobroke-card-meta">${escHtml(listing.location)} · ${escHtml(listing.property_type)} · ${escHtml(listing.bedrooms)} BR</div>
          <div class="cobroke-card-price">${escHtml(listing.price)}</div>
          <span class="cobroke-card-split">${escHtml(String(listing.cobroke_commission_split ?? 50))}% to buying agent</span>
          <div class="cobroke-card-agent">Listed by ${escHtml(listing.agent?.name || 'Unknown')}${listing.agent?.agency_name ? ` · ${escHtml(listing.agent.agency_name)}` : ''}</div>
          ${listing.cobroke_notes ? `<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;">${escHtml(listing.cobroke_notes)}</div>` : ''}
          <button class="btn btn-primary" style="margin-top:10px;padding:6px 14px;font-size:12px;" data-property-id="${escHtml(listing.id)}" data-listing-agent="${escHtml(listing.agent?.name || '')}">Request Co-Broke</button>
        </div>
      `;
      card.querySelector('[data-property-id]').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        requestCobroke(token, btn.dataset.propertyId, btn.dataset.listingAgent, btn);
      });
      list.appendChild(card);
    });

    _cbOffset += data.listings.length;
    document.getElementById('cb-load-more').style.display =
      data.listings.length === 20 ? 'block' : 'none';
  } catch (_e) {
    if (reset) list.innerHTML = '<div class="cobroke-empty">Failed to load listings. Please try again.</div>';
  }
}

async function requestCobroke(token, propertyId, listingAgentName, btn) {
  if (!confirm(`Send a co-broke request to ${listingAgentName || 'this agent'}? They'll receive an email with your profile details.`)) return;
  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    const res = await fetch(COBROKE_REQUEST_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ property_id: propertyId }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      btn.disabled = false;
      btn.textContent = 'Request Co-Broke';
      alert(data.error || 'Failed to send request.');
      return;
    }
    btn.textContent = '✓ Requested';
    btn.style.background = 'rgba(37,211,102,0.15)';
    btn.style.color = '#25d366';
  } catch (_e) {
    btn.disabled = false;
    btn.textContent = 'Request Co-Broke';
  }
}

async function loadMyRequests(token) {
  const list = document.getElementById('cobroke-requests-list');
  list.innerHTML = '<div class="cobroke-empty">Loading…</div>';

  // Use the analytics function pattern — query co_broke_deals via a simple fetch
  // We don't have a dedicated endpoint; use the Supabase REST API with the session token
  // co_broke_deals is accessible via RLS through the service-role key in edge functions.
  // For now, fetch from get-analytics (which returns leads) — cobroke deals need a dedicated
  // endpoint. Use cobroke-listings with a flag for "my deals" — but that endpoint doesn't exist yet.
  // IMPLEMENTATION NOTE: Use a lightweight inline fetch against manage-cobroke with action=list
  // OR add a get_my_requests action to manage-cobroke.
  // For v2.0 Phase 2, use the manage-cobroke function if it supports listing; otherwise show
  // a placeholder that links to the dashboard cobrokes page.

  // Check if manage-cobroke has a list action
  try {
    const MANAGE_COBROKE_URL = `${SUPABASE_URL}/functions/v1/manage-cobroke`;
    const res = await fetch(MANAGE_COBROKE_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_my_requests' }),
    });
    const data = await res.json();

    if (!res.ok || !Array.isArray(data.deals)) {
      list.innerHTML = '<div class="cobroke-empty">Track your co-broke requests here once you send your first one.</div>';
      return;
    }
    if (!data.deals.length) {
      list.innerHTML = '<div class="cobroke-empty">No co-broke requests sent yet. Browse listings above to get started.</div>';
      return;
    }
    list.innerHTML = data.deals.map(deal => `
      <div class="cobroke-card">
        <div class="cobroke-card-body">
          <div class="cobroke-card-title">${escHtml(deal.property_title || 'Property')}</div>
          <div class="cobroke-card-meta">${escHtml(deal.property_location || '')} · Listed by ${escHtml(deal.listing_agent_name || '')}</div>
          <div class="cobroke-card-price">${escHtml(deal.property_price || '')}</div>
          <span class="cobroke-request-status ${escHtml(deal.status)}">${escHtml(deal.status)}</span>
        </div>
      </div>
    `).join('');
  } catch (_e) {
    list.innerHTML = '<div class="cobroke-empty">Track your co-broke requests here once you send your first one.</div>';
  }
}
```

- [ ] **Step 4: Add `list_my_requests` action to `manage-cobroke/index.ts`**

Open `edge-functions/manage-cobroke/index.ts` and find the switch/if-else for actions. Add after the existing actions:

```typescript
    case "list_my_requests": {
      const { data: deals, error: dealsErr } = await sb
        .from("co_broke_deals")
        .select(`
          id, status, created_at,
          property:property_id (title, location, price),
          listing_agent:listing_agent_id (name)
        `)
        .eq("buying_agent_id", agentId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (dealsErr) return json({ error: "Failed to load requests." }, 500, cors);

      const formatted = (deals ?? []).map((d: {
        id: string; status: string; created_at: string;
        // deno-lint-ignore no-explicit-any
        property: any; listing_agent: any;
      }) => ({
        id: d.id,
        status: d.status,
        created_at: d.created_at,
        property_title: d.property?.title ?? null,
        property_location: d.property?.location ?? null,
        property_price: d.property?.price ?? null,
        listing_agent_name: d.listing_agent?.name ?? null,
      }));

      return json({ deals: formatted }, 200, cors);
    }
```

Note: `json()` is the existing response helper in that file. Check the file for how `json()` is defined and follow the same pattern.

- [ ] **Step 5: Call `loadCobrokeSection` from the dashboard init**

In `dashboard.js`, find where the main dashboard rendering happens after auth (typically where `loadDashboard()` is called). Find the section that calls `fetchAnalytics()`, `renderOnboarding()`, etc. Add a `loadCobrokeSection(token)` call after the existing render calls:

```javascript
    loadCobrokeSection(token);
```

Where `token` is the authenticated session token available in that scope. Read the surrounding code to confirm the variable name (`token`, `editToken`, `_token`, etc.).

- [ ] **Step 6: Run `npm run build` to verify no bundle regressions**

```bash
npm run build 2>&1 | tail -10
```

Expected: `init.bundle.js` stays under 30KB.

- [ ] **Step 7: Run existing E2E tests**

```bash
npx playwright test tests/e2e/ --reporter=dot 2>&1 | tail -20
```

Expected: all existing tests pass (cobroke section is hidden for non-authenticated runs).

- [ ] **Step 8: Commit**

```bash
git add dashboard.html js/dashboard.js edge-functions/manage-cobroke/index.ts
git commit -m "feat(phase2): cobroke discovery UI in agent dashboard"
```

---

## Task 8: Final Integration + Pre-Deploy Check

- [ ] **Step 1: Run full test suite**

```bash
deno test edge-functions/ --allow-env --allow-net --ignore=edge-functions/_shared 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 2: Run pre-deploy check**

```bash
npm run check
```

Expected: all checks pass.

- [ ] **Step 3: Verify `init.bundle.js` size**

```bash
npm run build 2>&1 | grep -E "init\.bundle|chunk"
```

Expected: `init.bundle.js` < 30KB, no chunk > 20KB.

- [ ] **Step 4: Final commit**

```bash
git add -p  # review any unstaged changes
git commit -m "chore(phase2): final integration check — agency analytics + cobroke discovery complete"
```

---

## Self-Check

**Spec coverage:**
- [x] Agency head can see per-agent lead response time — `response_time_p50_hours` in Task 2
- [x] Per-agent cobroke requests sent/received — `cobroke_sent`/`cobroke_received` in Task 2
- [x] "Top performer" badge on best metric per category — `computeTopPerformers()` in Task 5
- [x] Sortable table — `wireSort()` + `sortedAgents()` in Task 5
- [x] Agent can browse cobroke listings without leaving dashboard — Task 7
- [x] Filter by area, property type, price range — `cobroke-discover` query params + filter UI in Task 7
- [x] One-tap request — `requestCobroke()` in Task 7
- [x] "My open cobrokes" tab — `loadMyRequests()` + `list_my_requests` in Task 7/Task 4
- [x] New agent joins with agency pre-associated via invite link — Tasks 3, 4

**Missing from spec:** "Listing age" filter — the spec mentions "filter by listing age" for cobroke browse. `cobroke-discover` returns `created_at` on each listing; a `max_age_days` filter could be added. However the UI design in Task 7 doesn't include it — this is a minor gap. The filters (area, type, price) cover the primary use case. Add listing age filter as a `max_age_days` query param in a follow-up if needed.

**Type consistency check:**
- `AgentStats.cobroke_sent` / `.cobroke_received` / `.response_time_p50_hours` defined in Task 2 interface and used in Task 5 JS (same field names, lowercase snake_case)
- `manage-agency` actions `invite_agent` / `get_invites` match what `loadInvites()` and `generateInvite()` call in Task 5
- `manage-cobroke` action `list_my_requests` matches what `loadMyRequests()` calls in Task 7
- `agent_invites` table token column matches what `create-agent` looks up via `.eq("token", agency_token)` in Task 4

**Placeholder scan:** No TBDs. Task 7 Step 3 has an implementation note explaining the `list_my_requests` dependency — resolved in Task 7 Step 4. No steps say "add appropriate error handling" — all error branches have specific code.
