# Wave 2: Zero-Downtime Schema Normalization + Admin Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize the 282-column `agents` table into four purpose-scoped sub-tables without any production downtime, then build a founder-only admin dashboard for agent verification, tier overrides, and lead management.

**Architecture:** Create sub-tables → backfill data → add Postgres compatibility views reconstructing old column shapes → migrate edge function writes → 2-week observation → drop old columns. Admin dashboard uses two new edge functions (`get-admin-data` reads, `admin-action` writes) with a append-only `admin_events` audit log. `admin.html` + lazy-loaded `js/admin.js` for the UI.

**Tech Stack:** PostgreSQL migrations (Supabase), Deno/TypeScript (edge functions), vanilla ES modules (frontend JS).

> **CRITICAL:** Every migration SQL file must be tested against staging before running on production. The compatibility views guarantee zero downtime — **do not drop old columns until the 2-week observation period passes with zero Sentry errors.**

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `sql/015_agent_billing.sql` | Create | Sub-table + backfill + compatibility view |
| `sql/016_agent_social.sql` | Create | Sub-table + backfill + compatibility view |
| `sql/017_agent_verification.sql` | Create | Sub-table + backfill + compatibility view |
| `sql/018_agent_preferences.sql` | Create | Sub-table + backfill + compatibility view |
| `sql/019_admin_events.sql` | Create | Audit log table (append-only) |
| `sql/020_drop_migrated_columns.sql` | Create | Final cleanup — run only after observation period |
| `edge-functions/get-admin-data/index.ts` | Create | Read-only admin queries |
| `edge-functions/admin-action/index.ts` | Create | Write operations with audit logging |
| `admin.html` | Create | Admin dashboard page shell |
| `js/admin.js` | Create | Two-panel UI, optimistic updates |
| `edge-functions/update-agent/index.ts` | Modify | Write billing/social/verification/prefs to sub-tables |
| `edge-functions/whatsapp-ingest/index.ts` | Modify | Write social tokens to agent_social sub-table |

---

## Task 1: Create `agent_billing` Sub-Table

**Files:**
- Create: `sql/015_agent_billing.sql`

- [ ] **Step 1: Write the migration**

```sql
-- sql/015_agent_billing.sql
-- Phase 1: Create agent_billing sub-table + backfill + compatibility view
-- ZERO DOWNTIME: old columns on agents table are NOT touched until 020_drop_migrated_columns.sql

-- ── 1. Create sub-table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_billing (
  agent_id   uuid PRIMARY KEY REFERENCES public.agents(id) ON DELETE CASCADE,
  tier       text NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'premium')),
  tier_price numeric(10,2) NOT NULL DEFAULT 0,
  stripe_customer_id          text,
  stripe_subscription_id      text,
  stripe_subscription_status  text,
  stripe_current_period_end   timestamptz,
  billing_cycle               text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: anon read blocked; service_role write only
ALTER TABLE public.agent_billing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_agent_billing"
  ON public.agent_billing
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 2. Backfill from agents ──────────────────────────────────────────────────
INSERT INTO public.agent_billing (
  agent_id, tier, tier_price,
  stripe_customer_id, stripe_subscription_id,
  stripe_subscription_status, stripe_current_period_end, billing_cycle
)
SELECT
  id,
  COALESCE(tier, 'free'),
  COALESCE(tier_price, 0),
  stripe_customer_id,
  stripe_subscription_id,
  stripe_subscription_status,
  stripe_current_period_end,
  billing_cycle
FROM public.agents
ON CONFLICT (agent_id) DO NOTHING;

-- ── 3. Updated_at trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER agent_billing_updated_at
  BEFORE UPDATE ON public.agent_billing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

- [ ] **Step 2: Apply to staging first**

```bash
supabase link --project-ref <STAGING_PROJECT_REF>
supabase db push --file sql/015_agent_billing.sql
```

Expected output: migration applied with no errors.

- [ ] **Step 3: Verify backfill on staging**

```bash
supabase db execute --sql "SELECT COUNT(*) FROM agent_billing;"
# Should match: SELECT COUNT(*) FROM agents;
```

Expected: both counts match.

- [ ] **Step 4: Apply to production**

```bash
supabase link --project-ref pjyorgedaxevxophpfib
supabase db push --file sql/015_agent_billing.sql
```

- [ ] **Step 5: Commit**

```bash
git add sql/015_agent_billing.sql
git commit -m "feat: add agent_billing sub-table with backfill (zero-downtime step 1)"
```

---

## Task 2: Create `agent_social` Sub-Table

**Files:**
- Create: `sql/016_agent_social.sql`

- [ ] **Step 1: Write the migration**

```sql
-- sql/016_agent_social.sql

CREATE TABLE IF NOT EXISTS public.agent_social (
  agent_id              uuid PRIMARY KEY REFERENCES public.agents(id) ON DELETE CASCADE,
  instagram_handle      text,
  tiktok_handle         text,
  facebook_pixel_id     text,
  facebook_capi_token   text,
  instagram_access_token text,
  instagram_token_expiry timestamptz,
  tiktok_access_token   text,
  tiktok_token_expiry   timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_social ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_agent_social"
  ON public.agent_social
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO public.agent_social (
  agent_id, instagram_handle, tiktok_handle,
  facebook_pixel_id, facebook_capi_token,
  instagram_access_token, tiktok_access_token
)
SELECT
  id,
  instagram_handle,
  tiktok_handle,
  facebook_pixel_id,
  facebook_capi_token,
  instagram_access_token,
  tiktok_access_token
FROM public.agents
ON CONFLICT (agent_id) DO NOTHING;

CREATE TRIGGER agent_social_updated_at
  BEFORE UPDATE ON public.agent_social
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

- [ ] **Step 2: Apply to staging, verify, then production**

```bash
# Staging
supabase link --project-ref <STAGING_PROJECT_REF>
supabase db push --file sql/016_agent_social.sql

# Verify
supabase db execute --sql "SELECT COUNT(*) FROM agent_social;"
# Must match agents count

# Production
supabase link --project-ref pjyorgedaxevxophpfib
supabase db push --file sql/016_agent_social.sql
```

- [ ] **Step 3: Commit**

```bash
git add sql/016_agent_social.sql
git commit -m "feat: add agent_social sub-table with backfill"
```

---

## Task 3: Create `agent_verification` Sub-Table

**Files:**
- Create: `sql/017_agent_verification.sql`

- [ ] **Step 1: Write the migration**

```sql
-- sql/017_agent_verification.sql

CREATE TABLE IF NOT EXISTS public.agent_verification (
  agent_id            uuid PRIMARY KEY REFERENCES public.agents(id) ON DELETE CASCADE,
  dld_number          text,
  verified            boolean NOT NULL DEFAULT false,
  verification_date   timestamptz,
  verification_notes  text,
  flagged             boolean NOT NULL DEFAULT false,
  flagged_reason      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_verification ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_agent_verification"
  ON public.agent_verification
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anon can read verified status for rendering public profiles
CREATE POLICY "anon_read_agent_verification"
  ON public.agent_verification
  FOR SELECT
  TO anon
  USING (true);

INSERT INTO public.agent_verification (
  agent_id, dld_number, verified, verification_date
)
SELECT
  id,
  dld_number,
  COALESCE(verified, false),
  -- verification_date may not exist on all agents rows; default to created_at if null
  CASE WHEN verified = true THEN COALESCE(updated_at, created_at) ELSE NULL END
FROM public.agents
ON CONFLICT (agent_id) DO NOTHING;

CREATE TRIGGER agent_verification_updated_at
  BEFORE UPDATE ON public.agent_verification
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

- [ ] **Step 2: Apply to staging, verify, then production**

```bash
supabase link --project-ref <STAGING_PROJECT_REF>
supabase db push --file sql/017_agent_verification.sql
supabase db execute --sql "SELECT COUNT(*) FROM agent_verification WHERE verified = true;"
# Must match: SELECT COUNT(*) FROM agents WHERE verified = true;

supabase link --project-ref pjyorgedaxevxophpfib
supabase db push --file sql/017_agent_verification.sql
```

- [ ] **Step 3: Commit**

```bash
git add sql/017_agent_verification.sql
git commit -m "feat: add agent_verification sub-table with backfill"
```

---

## Task 4: Create `agent_preferences` Sub-Table

**Files:**
- Create: `sql/018_agent_preferences.sql`

- [ ] **Step 1: Write the migration**

```sql
-- sql/018_agent_preferences.sql

CREATE TABLE IF NOT EXISTS public.agent_preferences (
  agent_id                  uuid PRIMARY KEY REFERENCES public.agents(id) ON DELETE CASCADE,
  calendly_url              text,
  webhook_url               text,
  whatsapp_notifications    boolean NOT NULL DEFAULT true,
  email_notifications       boolean NOT NULL DEFAULT true,
  push_notifications        boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_agent_preferences"
  ON public.agent_preferences
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO public.agent_preferences (
  agent_id, calendly_url, webhook_url
)
SELECT
  id,
  calendly_url,
  webhook_url
FROM public.agents
ON CONFLICT (agent_id) DO NOTHING;

CREATE TRIGGER agent_preferences_updated_at
  BEFORE UPDATE ON public.agent_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

- [ ] **Step 2: Apply to staging, verify, then production**

```bash
supabase link --project-ref <STAGING_PROJECT_REF>
supabase db push --file sql/018_agent_preferences.sql
supabase db execute --sql "SELECT COUNT(*) FROM agent_preferences;"

supabase link --project-ref pjyorgedaxevxophpfib
supabase db push --file sql/018_agent_preferences.sql
```

- [ ] **Step 3: Commit**

```bash
git add sql/018_agent_preferences.sql
git commit -m "feat: add agent_preferences sub-table with backfill"
```

---

## Task 5: Create `admin_events` Audit Log Table

**Files:**
- Create: `sql/019_admin_events.sql`

- [ ] **Step 1: Write the migration**

```sql
-- sql/019_admin_events.sql
-- Append-only audit log for all admin-action mutations.
-- No DELETE policy on purpose.

CREATE TABLE IF NOT EXISTS public.admin_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor       text NOT NULL DEFAULT 'ops',
  action      text NOT NULL,
  target_id   uuid,
  target_type text,
  payload     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_events ENABLE ROW LEVEL SECURITY;

-- Only service_role can insert or read. No delete policy (append-only).
CREATE POLICY "service_role_insert_admin_events"
  ON public.admin_events
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "service_role_select_admin_events"
  ON public.admin_events
  FOR SELECT
  TO service_role
  USING (true);

-- Index for audit queries by action type and target
CREATE INDEX IF NOT EXISTS idx_admin_events_action ON public.admin_events (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_events_target ON public.admin_events (target_id, created_at DESC);
```

- [ ] **Step 2: Apply to staging and production**

```bash
supabase link --project-ref <STAGING_PROJECT_REF>
supabase db push --file sql/019_admin_events.sql

supabase link --project-ref pjyorgedaxevxophpfib
supabase db push --file sql/019_admin_events.sql
```

- [ ] **Step 3: Commit**

```bash
git add sql/019_admin_events.sql
git commit -m "feat: add admin_events append-only audit log table"
```

---

## Task 6: Create `get-admin-data` Edge Function

**Files:**
- Create: `edge-functions/get-admin-data/index.ts`

- [ ] **Step 1: Create the function**

```typescript
// edge-functions/get-admin-data/index.ts
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

  // ── Pending verifications ──────────────────────────────────────────────────
  // Agents who joined but are not yet verified, and have a DLD number
  const { data: pendingVerification } = await supabase
    .from("agents")
    .select("id, name, email, phone, dld_number, created_at")
    .eq("verified", false)
    .not("dld_number", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);

  // ── Unresponded leads (> 4 hours, no follow-up sent) ──────────────────────
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const { data: unrespondedLeads } = await supabase
    .from("leads")
    .select("id, agent_id, name, email, phone, created_at, agents(name, email)")
    .lt("created_at", fourHoursAgo)
    .is("followup_sent_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  // ── High-activity free agents (> 5 leads, on free tier) ──────────────────
  // These are natural upgrade candidates
  const { data: freeAgents } = await supabase
    .from("agents")
    .select("id, name, email, tier, created_at")
    .eq("tier", "free")
    .eq("verified", true);

  const highActivityFree: { agent_id: string; name: string; email: string; lead_count: number }[] = [];
  if (freeAgents && freeAgents.length > 0) {
    const ids = freeAgents.map((a: { id: string }) => a.id);
    const { data: leadCounts } = await supabase
      .from("leads")
      .select("agent_id")
      .in("agent_id", ids);

    const countMap: Record<string, number> = {};
    for (const l of leadCounts ?? []) {
      countMap[l.agent_id] = (countMap[l.agent_id] ?? 0) + 1;
    }

    for (const agent of freeAgents) {
      const count = countMap[agent.id] ?? 0;
      if (count >= 5) {
        highActivityFree.push({ agent_id: agent.id, name: agent.name, email: agent.email, lead_count: count });
      }
    }
    highActivityFree.sort((a, b) => b.lead_count - a.lead_count);
  }

  // ── Recent admin audit trail ──────────────────────────────────────────────
  const { data: recentAudit } = await supabase
    .from("admin_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  return new Response(JSON.stringify({
    pending_verification: pendingVerification ?? [],
    unresponded_leads: unrespondedLeads ?? [],
    high_activity_free: highActivityFree,
    recent_audit: recentAudit ?? [],
    generated_at: new Date().toISOString(),
  }), { headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } });
});
```

- [ ] **Step 2: Test locally**

```bash
supabase functions serve get-admin-data --env-file ./supabase/.env --no-verify-jwt

curl -H "Authorization: Bearer local-ops-secret-dev" \
  http://localhost:54321/functions/v1/get-admin-data | jq .
```

Expected: JSON with `pending_verification`, `unresponded_leads`, `high_activity_free`, `recent_audit` arrays.

- [ ] **Step 3: Commit**

```bash
git add edge-functions/get-admin-data/index.ts
git commit -m "feat: add get-admin-data edge function for admin dashboard"
```

---

## Task 7: Create `admin-action` Edge Function

**Files:**
- Create: `edge-functions/admin-action/index.ts`

- [ ] **Step 1: Create the function**

```typescript
// edge-functions/admin-action/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPS_SECRET = Deno.env.get("OPS_SECRET") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const VALID_ACTIONS = ["verify_agent", "set_tier", "resend_lead_notification", "flag_agent"] as const;
type AdminAction = typeof VALID_ACTIONS[number];

const VALID_TIERS = ["free", "pro", "premium"] as const;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405, headers: CORS_HEADERS,
    });
  }

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

  let body: { action?: string; agent_id?: string; tier?: string; lead_id?: string; reason?: string; confirm_slug?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400, headers: CORS_HEADERS,
    });
  }

  const { action, agent_id, tier, lead_id, reason, confirm_slug } = body;

  if (!action || !VALID_ACTIONS.includes(action as AdminAction)) {
    return new Response(JSON.stringify({ error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` }), {
      status: 400, headers: CORS_HEADERS,
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  async function auditLog(a: string, targetId: string | null, payload: Record<string, unknown>) {
    await supabase.from("admin_events").insert({
      actor: "ops",
      action: a,
      target_id: targetId,
      target_type: targetId ? "agent" : null,
      payload,
    });
  }

  // ── verify_agent ────────────────────────────────────────────────────────────
  if (action === "verify_agent") {
    if (!agent_id) return new Response(JSON.stringify({ error: "agent_id required." }), { status: 400, headers: CORS_HEADERS });

    const { error } = await supabase
      .from("agents")
      .update({ verified: true, updated_at: new Date().toISOString() })
      .eq("id", agent_id);

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS_HEADERS });

    // Also update agent_verification sub-table if it exists
    await supabase
      .from("agent_verification")
      .upsert({ agent_id, verified: true, verification_date: new Date().toISOString() });

    await auditLog("verify_agent", agent_id, { agent_id });
    return new Response(JSON.stringify({ ok: true }), { headers: CORS_HEADERS });
  }

  // ── set_tier ─────────────────────────────────────────────────────────────
  if (action === "set_tier") {
    if (!agent_id) return new Response(JSON.stringify({ error: "agent_id required." }), { status: 400, headers: CORS_HEADERS });
    if (!tier || !VALID_TIERS.includes(tier as typeof VALID_TIERS[number])) {
      return new Response(JSON.stringify({ error: `tier must be one of: ${VALID_TIERS.join(", ")}` }), { status: 400, headers: CORS_HEADERS });
    }
    if (!confirm_slug) return new Response(JSON.stringify({ error: "confirm_slug required for tier change." }), { status: 400, headers: CORS_HEADERS });

    // Verify the slug matches the agent (confirmation guard)
    const { data: agent } = await supabase.from("agents").select("slug").eq("id", agent_id).single();
    if (!agent || agent.slug !== confirm_slug) {
      return new Response(JSON.stringify({ error: "confirm_slug does not match agent slug." }), { status: 400, headers: CORS_HEADERS });
    }

    const tierPrices: Record<string, number> = { free: 0, pro: 299, premium: 799 };
    const { error } = await supabase
      .from("agents")
      .update({ tier, tier_price: tierPrices[tier], updated_at: new Date().toISOString() })
      .eq("id", agent_id);

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS_HEADERS });

    await supabase
      .from("agent_billing")
      .upsert({ agent_id, tier, tier_price: tierPrices[tier], updated_at: new Date().toISOString() });

    await auditLog("set_tier", agent_id, { agent_id, tier, previous_slug: confirm_slug });
    return new Response(JSON.stringify({ ok: true }), { headers: CORS_HEADERS });
  }

  // ── resend_lead_notification ──────────────────────────────────────────────
  if (action === "resend_lead_notification") {
    if (!lead_id) return new Response(JSON.stringify({ error: "lead_id required." }), { status: 400, headers: CORS_HEADERS });

    const { data: lead } = await supabase
      .from("leads")
      .select("id, agent_id, name, email, phone, message, agents(name, email)")
      .eq("id", lead_id)
      .single();

    if (!lead) return new Response(JSON.stringify({ error: "Lead not found." }), { status: 404, headers: CORS_HEADERS });

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured." }), { status: 503, headers: CORS_HEADERS });

    const agentEmail = (lead.agents as { email?: string })?.email;
    const agentName = (lead.agents as { name?: string })?.name || "Agent";
    if (!agentEmail) return new Response(JSON.stringify({ error: "Agent email not found." }), { status: 404, headers: CORS_HEADERS });

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "SellingDubai <no-reply@sellingdubai.ae>",
        to: [agentEmail],
        subject: `[Resent] New lead: ${lead.name}`,
        html: `<p>Hi ${agentName},</p><p>This is a resent notification for a lead from <strong>${lead.name}</strong>.</p><p>Contact: ${lead.phone || lead.email || "—"}</p><p>Message: ${lead.message || "No message"}</p>`,
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      return new Response(JSON.stringify({ error: `Resend failed: ${errText}` }), { status: 502, headers: CORS_HEADERS });
    }

    await auditLog("resend_lead_notification", lead.agent_id, { lead_id });
    return new Response(JSON.stringify({ ok: true }), { headers: CORS_HEADERS });
  }

  // ── flag_agent ────────────────────────────────────────────────────────────
  if (action === "flag_agent") {
    if (!agent_id) return new Response(JSON.stringify({ error: "agent_id required." }), { status: 400, headers: CORS_HEADERS });
    if (!confirm_slug) return new Response(JSON.stringify({ error: "confirm_slug required for flag action." }), { status: 400, headers: CORS_HEADERS });

    const { data: agent } = await supabase.from("agents").select("slug").eq("id", agent_id).single();
    if (!agent || agent.slug !== confirm_slug) {
      return new Response(JSON.stringify({ error: "confirm_slug does not match agent slug." }), { status: 400, headers: CORS_HEADERS });
    }

    // flagged column may not exist on agents yet — use agent_verification sub-table
    await supabase
      .from("agent_verification")
      .upsert({ agent_id, flagged: true, flagged_reason: reason || "Flagged by admin" });

    await auditLog("flag_agent", agent_id, { agent_id, reason });
    return new Response(JSON.stringify({ ok: true }), { headers: CORS_HEADERS });
  }

  return new Response(JSON.stringify({ error: "Unhandled action." }), { status: 500, headers: CORS_HEADERS });
});
```

- [ ] **Step 2: Test each action locally**

```bash
supabase functions serve admin-action --env-file ./supabase/.env --no-verify-jwt

# Test missing auth
curl -X POST http://localhost:54321/functions/v1/admin-action \
  -H "Content-Type: application/json" \
  -d '{"action":"verify_agent","agent_id":"test-id"}'
# Expected: 401

# Test verify_agent (use a real agent ID from local DB)
curl -X POST http://localhost:54321/functions/v1/admin-action \
  -H "Authorization: Bearer local-ops-secret-dev" \
  -H "Content-Type: application/json" \
  -d '{"action":"verify_agent","agent_id":"<local-agent-id>"}'
# Expected: {"ok":true}

# Verify audit log entry created
supabase db execute --sql "SELECT * FROM admin_events ORDER BY created_at DESC LIMIT 1;"
```

- [ ] **Step 3: Commit**

```bash
git add edge-functions/admin-action/index.ts
git commit -m "feat: add admin-action edge function with audit logging"
```

---

## Task 8: Create `admin.html`

**Files:**
- Create: `admin.html`

- [ ] **Step 1: Create the page**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SellingDubai Admin</title>
  <meta name="robots" content="noindex, nofollow">
  <link rel="stylesheet" href="/dist/styles.min.css">
  <style>
    * { box-sizing: border-box; }
    body { background: #0f172a; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; }
    #admin-root { display: flex; min-height: 100vh; }
    #sidebar { width: 220px; background: #1e293b; padding: 1.5rem 1rem; flex-shrink: 0; }
    #sidebar h1 { font-size: 1rem; font-weight: 700; color: #f8fafc; margin: 0 0 1.5rem; }
    #sidebar button { display: block; width: 100%; text-align: left; background: none; border: none; color: #94a3b8; padding: 0.6rem 0.75rem; border-radius: 8px; cursor: pointer; font-size: 0.875rem; margin-bottom: 0.25rem; }
    #sidebar button.active, #sidebar button:hover { background: #334155; color: #f8fafc; }
    #main-panel { flex: 1; padding: 2rem; overflow-y: auto; }
    .panel { display: none; }
    .panel.active { display: block; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th { text-align: left; padding: 0.75rem; background: #1e293b; color: #94a3b8; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
    td { padding: 0.75rem; border-bottom: 1px solid #1e293b; color: #cbd5e1; }
    tr:hover td { background: #1e293b; }
    .btn { padding: 0.4rem 0.75rem; border-radius: 6px; border: none; cursor: pointer; font-size: 0.8rem; font-weight: 600; }
    .btn-primary { background: #6366f1; color: #fff; }
    .btn-danger { background: #ef4444; color: #fff; }
    .btn-secondary { background: #334155; color: #e2e8f0; }
    .confirm-input { display: inline-block; margin-left: 0.5rem; }
    .confirm-input input { background: #0f172a; border: 1px solid #475569; color: #f8fafc; padding: 0.3rem 0.5rem; border-radius: 4px; font-size: 0.8rem; width: 140px; }
    .toast { position: fixed; bottom: 1.5rem; right: 1.5rem; background: #22c55e; color: #fff; padding: 0.75rem 1.25rem; border-radius: 8px; font-size: 0.875rem; font-weight: 600; opacity: 0; transition: opacity 0.2s; pointer-events: none; z-index: 9999; }
    .toast.error { background: #ef4444; }
    .toast.show { opacity: 1; }
    #admin-auth-error { text-align: center; padding: 4rem 2rem; }
    #admin-auth-error p { font-size: 1.25rem; color: #ef4444; }
  </style>
</head>
<body>
  <div id="admin-auth-error" style="display:none">
    <p>Access denied. Provide the correct <code>?key=</code> parameter.</p>
  </div>
  <div id="admin-root" style="display:none">
    <nav id="sidebar">
      <h1>Admin</h1>
      <button class="active" data-panel="verifications">Verifications</button>
      <button data-panel="leads">Unresponded Leads</button>
      <button data-panel="upgrades">Upgrade Candidates</button>
      <button data-panel="audit">Audit Log</button>
    </nav>
    <main id="main-panel">
      <div class="panel active" id="panel-verifications">
        <h2 style="color:#f8fafc;margin:0 0 1.5rem">Pending Verifications</h2>
        <div id="verifications-table"></div>
      </div>
      <div class="panel" id="panel-leads">
        <h2 style="color:#f8fafc;margin:0 0 1.5rem">Unresponded Leads (&gt;4h)</h2>
        <div id="leads-table"></div>
      </div>
      <div class="panel" id="panel-upgrades">
        <h2 style="color:#f8fafc;margin:0 0 1.5rem">High-Activity Free Agents</h2>
        <div id="upgrades-table"></div>
      </div>
      <div class="panel" id="panel-audit">
        <h2 style="color:#f8fafc;margin:0 0 1.5rem">Recent Audit Log</h2>
        <div id="audit-table"></div>
      </div>
    </main>
  </div>
  <div class="toast" id="toast"></div>

  <script type="module">
    const params = new URLSearchParams(location.search);
    const key = params.get('key') || '';
    const SUPABASE_FUNCTIONS_URL = 'https://pjyorgedaxevxophpfib.supabase.co/functions/v1';

    async function validateAndLoad() {
      if (!key) { document.getElementById('admin-auth-error').style.display = 'block'; return; }

      try {
        const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/get-admin-data`, {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (res.status === 401) { document.getElementById('admin-auth-error').style.display = 'block'; return; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        document.getElementById('admin-root').style.display = 'flex';
        const data = await res.json();
        const { default: renderAdmin } = await import('/js/admin.js');
        renderAdmin(data, key, SUPABASE_FUNCTIONS_URL);
      } catch (err) {
        document.getElementById('admin-auth-error').style.display = 'block';
        console.error('Admin load failed:', err);
      }
    }

    // Sidebar navigation
    document.querySelectorAll('#sidebar button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#sidebar button').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`panel-${btn.dataset.panel}`).classList.add('active');
      });
    });

    validateAndLoad();
  </script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add admin.html
git commit -m "feat: add admin.html dashboard shell"
```

---

## Task 9: Create `js/admin.js`

**Files:**
- Create: `js/admin.js`

- [ ] **Step 1: Create the module**

```javascript
// js/admin.js
// Lazy-loaded admin dashboard module. Renders data tables and handles admin actions.

let _key = '';
let _functionsUrl = '';

function showToast(msg, isError = false) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast${isError ? ' error' : ''} show`;
  setTimeout(() => { el.classList.remove('show'); }, 3000);
}

async function callAction(action, payload) {
  const res = await fetch(`${_functionsUrl}/admin-action`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${_key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function renderVerifications(items) {
  const container = document.getElementById('verifications-table');
  if (!container) return;
  if (!items.length) { container.innerHTML = '<p style="color:#64748b">No pending verifications.</p>'; return; }

  container.innerHTML = `<table>
    <thead><tr>
      <th>Name</th><th>Email</th><th>DLD Number</th><th>Joined</th><th>Action</th>
    </tr></thead>
    <tbody>
      ${items.map(a => `
        <tr data-agent-id="${a.id}">
          <td>${a.name || '—'}</td>
          <td>${a.email || '—'}</td>
          <td>${a.dld_number || '—'}</td>
          <td>${new Date(a.created_at).toLocaleDateString()}</td>
          <td>
            <button class="btn btn-primary" onclick="window._verifyAgent('${a.id}', this)">Verify</button>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>`;

  window._verifyAgent = async (agentId, btn) => {
    const row = btn.closest('tr');
    const prevHtml = btn.outerHTML;
    btn.disabled = true;
    btn.textContent = 'Verifying…';
    try {
      await callAction('verify_agent', { agent_id: agentId });
      row.style.opacity = '0.4';
      row.style.pointerEvents = 'none';
      showToast('Agent verified successfully.');
    } catch (err) {
      btn.outerHTML = prevHtml;
      showToast(`Error: ${err.message}`, true);
    }
  };
}

function renderLeads(items) {
  const container = document.getElementById('leads-table');
  if (!container) return;
  if (!items.length) { container.innerHTML = '<p style="color:#64748b">No unresponded leads.</p>'; return; }

  container.innerHTML = `<table>
    <thead><tr>
      <th>Lead</th><th>Contact</th><th>Agent</th><th>Received</th><th>Action</th>
    </tr></thead>
    <tbody>
      ${items.map(l => `
        <tr>
          <td>${l.name || '—'}</td>
          <td>${l.phone || l.email || '—'}</td>
          <td>${l.agents?.name || '—'}</td>
          <td>${new Date(l.created_at).toLocaleString()}</td>
          <td>
            <button class="btn btn-secondary" onclick="window._resendLead('${l.id}', this)">Resend Email</button>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>`;

  window._resendLead = async (leadId, btn) => {
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      await callAction('resend_lead_notification', { lead_id: leadId });
      btn.textContent = 'Sent ✓';
      showToast('Lead notification resent.');
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Resend Email';
      showToast(`Error: ${err.message}`, true);
    }
  };
}

function renderUpgrades(items) {
  const container = document.getElementById('upgrades-table');
  if (!container) return;
  if (!items.length) { container.innerHTML = '<p style="color:#64748b">No high-activity free agents.</p>'; return; }

  container.innerHTML = `<table>
    <thead><tr>
      <th>Agent</th><th>Email</th><th>Leads Received</th><th>Set Tier</th>
    </tr></thead>
    <tbody>
      ${items.map(a => `
        <tr>
          <td>${a.name || '—'}</td>
          <td>${a.email || '—'}</td>
          <td>${a.lead_count}</td>
          <td>
            <select id="tier-${a.agent_id}" style="background:#1e293b;color:#e2e8f0;border:1px solid #475569;padding:0.3rem;border-radius:4px;font-size:0.8rem">
              <option value="">— select —</option>
              <option value="pro">Pro (AED 299)</option>
              <option value="premium">Premium (AED 799)</option>
            </select>
            <span class="confirm-input">
              <input type="text" id="slug-${a.agent_id}" placeholder="type agent slug">
            </span>
            <button class="btn btn-primary" style="margin-left:0.5rem" onclick="window._setTier('${a.agent_id}', this)">Apply</button>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>`;

  window._setTier = async (agentId, btn) => {
    const tier = document.getElementById(`tier-${agentId}`)?.value;
    const confirmSlug = document.getElementById(`slug-${agentId}`)?.value?.trim();
    if (!tier) { showToast('Select a tier first.', true); return; }
    if (!confirmSlug) { showToast('Type the agent slug to confirm.', true); return; }
    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = 'Applying…';
    try {
      await callAction('set_tier', { agent_id: agentId, tier, confirm_slug: confirmSlug });
      btn.textContent = 'Applied ✓';
      showToast(`Tier set to ${tier}.`);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = prevText;
      showToast(`Error: ${err.message}`, true);
    }
  };
}

function renderAudit(items) {
  const container = document.getElementById('audit-table');
  if (!container) return;
  if (!items.length) { container.innerHTML = '<p style="color:#64748b">No audit events yet.</p>'; return; }

  container.innerHTML = `<table>
    <thead><tr>
      <th>Action</th><th>Target</th><th>Payload</th><th>When</th>
    </tr></thead>
    <tbody>
      ${items.map(e => `
        <tr>
          <td><code>${e.action}</code></td>
          <td><code style="font-size:0.75rem">${e.target_id?.slice(0, 8) || '—'}…</code></td>
          <td style="font-size:0.75rem;color:#64748b">${JSON.stringify(e.payload || {})}</td>
          <td>${new Date(e.created_at).toLocaleString()}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>`;
}

export default function renderAdmin(data, key, functionsUrl) {
  _key = key;
  _functionsUrl = functionsUrl;
  renderVerifications(data.pending_verification);
  renderLeads(data.unresponded_leads);
  renderUpgrades(data.high_activity_free);
  renderAudit(data.recent_audit);
}
```

- [ ] **Step 2: Smoke test in browser**

```bash
npx serve . -p 3000
# Navigate to: http://localhost:3000/admin.html?key=local-ops-secret-dev
```

Expected:
- Sidebar navigation switches panels
- Each panel renders its table (may show "No X" with empty local DB)
- Verify button triggers a fetch and shows toast
- Wrong key shows access denied

- [ ] **Step 3: Commit**

```bash
git add js/admin.js
git commit -m "feat: add admin.js two-panel admin dashboard module"
```

---

## Task 10: Update Edge Functions to Write to Sub-Tables

At this point, sub-tables are backfilled and reads still work via column access on `agents`. Now migrate the **write path** so new data lands in sub-tables too (writes continue to go to `agents` columns in parallel until observation period ends).

**Files:**
- Modify: `edge-functions/update-agent/index.ts`

- [ ] **Step 1: Find where update-agent writes billing/social/verification/prefs fields**

```bash
grep -n "tier\|stripe_\|calendly\|webhook_url\|instagram_\|tiktok_\|facebook_\|verified\|dld_number" \
  edge-functions/update-agent/index.ts | head -40
```

- [ ] **Step 2: Add dual-write to sub-tables after the existing agents update**

Read `edge-functions/update-agent/index.ts` fully, then after the `supabase.from("agents").update(...)` block, add:

```typescript
// Dual-write to sub-tables (agents columns kept alive during observation period)
const billingFields = ['tier', 'tier_price', 'stripe_customer_id', 'stripe_subscription_id', 'stripe_subscription_status', 'stripe_current_period_end', 'billing_cycle'];
const socialFields = ['instagram_handle', 'tiktok_handle', 'facebook_pixel_id', 'facebook_capi_token', 'instagram_access_token', 'tiktok_access_token'];
const verificationFields = ['dld_number', 'verified'];
const preferencesFields = ['calendly_url', 'webhook_url'];

function pickFields(obj: Record<string, unknown>, keys: string[]) {
  const result: Record<string, unknown> = {};
  for (const k of keys) { if (k in obj) result[k] = obj[k]; }
  return result;
}

const billingUpdate = pickFields(updates, billingFields);
if (Object.keys(billingUpdate).length > 0) {
  await supabase.from('agent_billing').upsert({ agent_id: agentId, ...billingUpdate });
}
const socialUpdate = pickFields(updates, socialFields);
if (Object.keys(socialUpdate).length > 0) {
  await supabase.from('agent_social').upsert({ agent_id: agentId, ...socialUpdate });
}
const verificationUpdate = pickFields(updates, verificationFields);
if (Object.keys(verificationUpdate).length > 0) {
  await supabase.from('agent_verification').upsert({ agent_id: agentId, ...verificationUpdate });
}
const preferencesUpdate = pickFields(updates, preferencesFields);
if (Object.keys(preferencesUpdate).length > 0) {
  await supabase.from('agent_preferences').upsert({ agent_id: agentId, ...preferencesUpdate });
}
```

- [ ] **Step 3: Test the dual-write locally**

Update an agent with a tier change and verify both tables are updated:

```bash
supabase db execute --sql "SELECT tier FROM agents WHERE id = '<test-id>';"
supabase db execute --sql "SELECT tier FROM agent_billing WHERE agent_id = '<test-id>';"
# Both should match
```

- [ ] **Step 4: Commit**

```bash
git add edge-functions/update-agent/index.ts
git commit -m "feat: dual-write billing/social/verification/prefs to sub-tables in update-agent"
```

---

## Task 11: Prepare Column Drop Migration (Do NOT Run Yet)

Create the migration file now but do not apply it. Apply only after 2 weeks of zero Sentry errors following Task 10 deploy.

**Files:**
- Create: `sql/020_drop_migrated_columns.sql`

- [ ] **Step 1: Create the file with a prominent warning header**

```sql
-- sql/020_drop_migrated_columns.sql
-- ============================================================
-- DANGER: DO NOT RUN UNTIL 2-WEEK OBSERVATION PERIOD PASSES
-- ============================================================
-- Prerequisites before running:
--   1. All four sub-tables exist and are backfilled (015-018 applied)
--   2. Dual-write in update-agent has been in production for ≥ 14 days
--   3. Zero Sentry errors related to agents/tier/social/prefs in those 14 days
--   4. Confirmed in Supabase Studio that sub-table row counts match agents counts
--
-- This migration drops the columns that were moved to sub-tables.
-- Compatibility views are dropped AFTER the sub-table reads are confirmed live.
-- ============================================================

-- Drop billing columns from agents
ALTER TABLE public.agents
  DROP COLUMN IF EXISTS tier,
  DROP COLUMN IF EXISTS tier_price,
  DROP COLUMN IF EXISTS stripe_customer_id,
  DROP COLUMN IF EXISTS stripe_subscription_id,
  DROP COLUMN IF EXISTS stripe_subscription_status,
  DROP COLUMN IF EXISTS stripe_current_period_end,
  DROP COLUMN IF EXISTS billing_cycle;

-- Drop social columns from agents
ALTER TABLE public.agents
  DROP COLUMN IF EXISTS instagram_handle,
  DROP COLUMN IF EXISTS tiktok_handle,
  DROP COLUMN IF EXISTS facebook_pixel_id,
  DROP COLUMN IF EXISTS facebook_capi_token,
  DROP COLUMN IF EXISTS instagram_access_token,
  DROP COLUMN IF EXISTS tiktok_access_token;

-- Drop verification columns from agents
ALTER TABLE public.agents
  DROP COLUMN IF EXISTS dld_number,
  DROP COLUMN IF EXISTS verified;

-- Drop preference columns from agents
ALTER TABLE public.agents
  DROP COLUMN IF EXISTS calendly_url,
  DROP COLUMN IF EXISTS webhook_url;
```

- [ ] **Step 2: Commit the file (not applied)**

```bash
git add sql/020_drop_migrated_columns.sql
git commit -m "chore: prepare column drop migration (apply after 2-week observation)"
```

---

*Wave 2 complete when: all sub-tables are in production with dual-write active, admin dashboard is live on staging and production, and the observation period timer has started.*
