# Voice Layer (Vapi + Siri Shortcuts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Vapi.ai phone call secretary and Siri Shortcuts integration so Dubai agents can manage leads and listings by calling a number or speaking to Siri.

**Architecture:** A `vapi-webhook` edge function handles Vapi's `assistant-request` (dynamic per-agent config) and `tool-calls` (execute AI tools via phone). A shared `_shared/tool-executor.ts` is extracted from `ai-secretary` so both functions use identical tool logic. A `rotate-siri-token` edge function lets agents regenerate their Bearer token. The dashboard gains an AI Secretary card showing the phone number, token, and a Siri Shortcut download link.

**Tech Stack:** Deno/TypeScript (edge functions), Vapi.ai (voice call orchestration), ElevenLabs TTS (via Vapi), Whisper STT (via Vapi), Siri Shortcuts (iOS `.shortcut` binary), Supabase (agents table migration)

---

## File Map

**Created:**
- `supabase/migrations/20260408000005_siri_token.sql` — adds `siri_token UUID` column to agents
- `edge-functions/_shared/tool-executor.ts` — shared `executeTool()` + `TOOL_DEFINITIONS`; imported by `ai-secretary` and `vapi-webhook`
- `edge-functions/vapi-webhook/index.ts` — Vapi webhook handler
- `edge-functions/vapi-webhook/index.test.ts` — tests for vapi-webhook
- `edge-functions/rotate-siri-token/index.ts` — rotates agent siri_token via magic_link session
- `edge-functions/rotate-siri-token/index.test.ts` — tests for rotate-siri-token
- `siri/SellingDubai.shortcut` — binary placeholder (developer replaces with real iOS Shortcuts file)

**Modified:**
- `edge-functions/ai-secretary/index.ts` — import tool-executor instead of inline; add Siri Bearer auth path
- `edge-functions/ai-secretary/index.test.ts` — 2 new tests for Siri Bearer auth
- `dashboard.html` — AI Secretary section before `</main>`
- `js/dashboard.js` — `renderSecretarySection()`, `rotateSiriToken()`, copy globals, `ROTATE_SIRI_URL`
- `js/event-delegation.js` — 3 new `data-action` cases
- `js/sd-config.js` — `VAPI_PHONE_NUMBER` placeholder

---

## Task 1: Add siri_token migration

**Files:**
- Create: `supabase/migrations/20260408000005_siri_token.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260408000005_siri_token.sql
ALTER TABLE agents ADD COLUMN IF NOT EXISTS siri_token UUID DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS agents_siri_token_idx ON agents(siri_token) WHERE siri_token IS NOT NULL;
```

- [ ] **Step 2: Verify migration file exists**

Run: `ls supabase/migrations/ | grep siri_token`
Expected: `20260408000005_siri_token.sql`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260408000005_siri_token.sql
git commit -m "feat(voice): add siri_token column to agents"
```

---

## Task 2: Extract shared tool executor

**Files:**
- Create: `edge-functions/_shared/tool-executor.ts`
- Modify: `edge-functions/ai-secretary/index.ts`

- [ ] **Step 1: Read ai-secretary to find inline tool definitions**

Run: `grep -n "executeTool\|TOOL_DEFINITIONS\|ToolName" edge-functions/ai-secretary/index.ts | head -30`

Note the line ranges so you can remove them in Step 4.

- [ ] **Step 2: Write _shared/tool-executor.ts**

```typescript
// edge-functions/_shared/tool-executor.ts
// deno-lint-ignore-file no-explicit-any
type SupabaseClient = { from: (table: string) => any };

export type ToolName =
  | "get_leads"
  | "update_lead"
  | "get_listings"
  | "update_listing"
  | "get_stats"
  | "get_brief";

export const TOOL_DEFINITIONS = [
  {
    name: "get_leads",
    description: "Get the agent's recent and today's leads",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "update_lead",
    description: "Update a lead's status or add a note",
    input_schema: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        status: {
          type: "string",
          enum: ["new", "contacted", "qualified", "archived"],
        },
        note: { type: "string" },
      },
      required: ["lead_id"],
    },
  },
  {
    name: "get_listings",
    description: "Get the agent's active property listings",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "update_listing",
    description: "Update a listing's price, status, or description",
    input_schema: {
      type: "object",
      properties: {
        listing_id: { type: "string" },
        price: { type: "number" },
        status: {
          type: "string",
          enum: ["active", "under_offer", "sold", "draft"],
        },
        description: { type: "string" },
      },
      required: ["listing_id"],
    },
  },
  {
    name: "get_stats",
    description: "Get performance stats for the agent",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_brief",
    description: "Get a morning brief: leads needing follow-up + performance summary",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];

export async function executeTool(
  toolName: ToolName,
  input: Record<string, unknown>,
  agentId: string,
  supabase: SupabaseClient,
): Promise<string> {
  switch (toolName) {
    case "get_leads": {
      const { data: leads } = await supabase
        .from("leads")
        .select("id, name, phone, status, created_at, notes")
        .eq("agent_id", agentId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (!leads || leads.length === 0) return "You have no leads yet.";
      const lines = leads.map((l: any) =>
        `${l.name} (${l.phone}) — ${l.status}${l.notes ? ` — ${l.notes}` : ""}`
      );
      return `Your ${leads.length} most recent leads:\n${lines.join("\n")}`;
    }

    case "update_lead": {
      const { lead_id, status, note } = input as {
        lead_id: string;
        status?: string;
        note?: string;
      };
      const updates: Record<string, unknown> = {};
      if (status) updates.status = status;
      if (note) updates.notes = note;
      const { error } = await supabase
        .from("leads")
        .update(updates)
        .eq("id", lead_id)
        .eq("agent_id", agentId);
      if (error) return `Failed to update lead: ${error.message}`;
      return `Lead updated successfully.`;
    }

    case "get_listings": {
      const { data: listings } = await supabase
        .from("properties")
        .select("id, title, price, status, bedrooms, area")
        .eq("agent_id", agentId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(10);
      if (!listings || listings.length === 0) return "You have no active listings.";
      const lines = listings.map((p: any) =>
        `${p.title} — AED ${p.price?.toLocaleString()} — ${p.bedrooms}BR in ${p.area}`
      );
      return `Your ${listings.length} active listings:\n${lines.join("\n")}`;
    }

    case "update_listing": {
      const { listing_id, price, status, description } = input as {
        listing_id: string;
        price?: number;
        status?: string;
        description?: string;
      };
      const updates: Record<string, unknown> = {};
      if (price !== undefined) updates.price = price;
      if (status) updates.status = status;
      if (description) updates.description = description;
      const { error } = await supabase
        .from("properties")
        .update(updates)
        .eq("id", listing_id)
        .eq("agent_id", agentId);
      if (error) return `Failed to update listing: ${error.message}`;
      return `Listing updated successfully.`;
    }

    case "get_stats": {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [leadsWeek, leadsTotal, activeListings] = await Promise.all([
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("agent_id", agentId)
          .gte("created_at", weekAgo),
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("agent_id", agentId),
        supabase
          .from("properties")
          .select("id", { count: "exact", head: true })
          .eq("agent_id", agentId)
          .eq("status", "active"),
      ]);
      return `Stats: ${leadsWeek.count ?? 0} leads this week, ${leadsTotal.count ?? 0} total leads, ${activeListings.count ?? 0} active listings.`;
    }

    case "get_brief": {
      const [leadsResult, statsResult] = await Promise.all([
        executeTool("get_leads", {}, agentId, supabase),
        executeTool("get_stats", {}, agentId, supabase),
      ]);
      return `Good morning! Here's your brief.\n\n${statsResult}\n\nRecent leads:\n${leadsResult}`;
    }

    default:
      return "Unknown tool.";
  }
}
```

- [ ] **Step 3: Verify the file was written**

Run: `head -5 edge-functions/_shared/tool-executor.ts`
Expected: `// edge-functions/_shared/tool-executor.ts`

- [ ] **Step 4: Update ai-secretary/index.ts to import from shared tool-executor**

Remove the inline `TOOL_DEFINITIONS`, `executeTool`, and `ToolName` from `ai-secretary/index.ts`. Add this import at the top (after existing imports):

```typescript
import { executeTool, TOOL_DEFINITIONS, type ToolName } from "../_shared/tool-executor.ts";
```

- [ ] **Step 5: Verify ai-secretary still type-checks**

Run: `grep -n "TOOL_DEFINITIONS\|executeTool\|ToolName" edge-functions/ai-secretary/index.ts`
Expected: Only the import line and existing usages (no inline definitions).

- [ ] **Step 6: Commit**

```bash
git add edge-functions/_shared/tool-executor.ts edge-functions/ai-secretary/index.ts
git commit -m "refactor(voice): extract tool-executor to shared module"
```

---

## Task 3: vapi-webhook edge function

**Files:**
- Create: `edge-functions/vapi-webhook/index.ts`

- [ ] **Step 1: Write the failing test first (see Task 4 — write test before implementation)**

Skip ahead to Task 4 Step 1, then come back here.

- [ ] **Step 2: Write vapi-webhook/index.ts**

```typescript
// edge-functions/vapi-webhook/index.ts
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders } from "../_shared/utils.ts";
import { executeTool, TOOL_DEFINITIONS, type ToolName } from "../_shared/tool-executor.ts";

type ClientFactory = (url: string, key: string) => SupabaseClient;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-vapi-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/** Normalise phone to multiple formats for OR lookup */
function phoneVariants(raw: string): string[] {
  const digits = raw.replace(/\D/g, "");
  const variants: string[] = [raw, digits];
  if (digits.startsWith("971")) {
    variants.push("+" + digits);          // +971...
    variants.push("0" + digits.slice(3)); // 0XX...
    variants.push(digits.slice(3));       // bare local
  } else if (digits.startsWith("0")) {
    variants.push("971" + digits.slice(1));
    variants.push("+971" + digits.slice(1));
  }
  return [...new Set(variants)];
}

async function lookupAgentByPhone(
  phone: string,
  // deno-lint-ignore no-explicit-any
  supabase: any,
): Promise<{ id: string; name: string; agency_id: string | null } | null> {
  const variants = phoneVariants(phone);
  const orFilter = variants.map((v) => `whatsapp.eq.${v}`).join(",");
  const { data } = await supabase
    .from("agents")
    .select("id, name, agency_id")
    .or(orFilter)
    .maybeSingle();
  return data ?? null;
}

async function handleAssistantRequest(
  // deno-lint-ignore no-explicit-any
  message: any,
  // deno-lint-ignore no-explicit-any
  supabase: any,
): Promise<Response> {
  const callerPhone: string = message?.call?.customer?.number ?? "";
  const agent = callerPhone ? await lookupAgentByPhone(callerPhone, supabase) : null;

  const agentName = agent?.name ?? "Agent";
  let leadCount = 0;
  if (agent) {
    const { count } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agent.id)
      .eq("status", "new");
    leadCount = count ?? 0;
  }

  const VAPI_WEBHOOK_URL = Deno.env.get("VAPI_WEBHOOK_URL") ?? "";
  const VAPI_SERVER_SECRET = Deno.env.get("VAPI_SERVER_SECRET") ?? "";
  const VOICE_PROVIDER = Deno.env.get("VOICE_PROVIDER") ?? "elevenlabs";
  const ELEVENLABS_VOICE_ID = Deno.env.get("ELEVENLABS_VOICE_ID") ?? "21m00Tcm4TlvDq8ikWAM";

  const tools = TOOL_DEFINITIONS.map((def) => ({
    type: "function",
    function: {
      name: def.name,
      description: def.description,
      parameters: def.input_schema,
    },
    server: {
      url: VAPI_WEBHOOK_URL,
      secret: VAPI_SERVER_SECRET,
    },
  }));

  const firstMessage = agent
    ? `Hi ${agentName}! You have ${leadCount} new lead${leadCount !== 1 ? "s" : ""}. How can I help?`
    : "Welcome to SellingDubai. Your number isn't registered. Please sign up at sellingdubai.com.";

  return json({
    assistant: {
      firstMessage,
      model: {
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        messages: [
          {
            role: "system",
            content: agent
              ? `You are the AI secretary for ${agentName}, a Dubai real estate agent on SellingDubai. Help them manage their leads and listings. Be concise — this is a phone call. Always confirm actions before executing them.`
              : "You are the SellingDubai AI secretary. This caller is not registered. Politely direct them to sellingdubai.com to sign up.",
          },
        ],
      },
      voice: {
        provider: VOICE_PROVIDER,
        voiceId: VOICE_PROVIDER === "elevenlabs" ? ELEVENLABS_VOICE_ID : undefined,
      },
      tools,
    },
  });
}

async function handleToolCalls(
  // deno-lint-ignore no-explicit-any
  message: any,
  // deno-lint-ignore no-explicit-any
  supabase: any,
): Promise<Response> {
  const callerPhone: string = message?.call?.customer?.number ?? "";
  const agent = callerPhone ? await lookupAgentByPhone(callerPhone, supabase) : null;
  if (!agent) {
    return json({ error: "Agent not found" }, 404);
  }

  // deno-lint-ignore no-explicit-any
  const toolCallList: any[] = message?.toolCallList ?? [];
  const results = await Promise.all(
    toolCallList.map(async (tc: any) => {
      const toolName = tc?.function?.name as ToolName;
      let input: Record<string, unknown> = {};
      try {
        input = typeof tc?.function?.arguments === "string"
          ? JSON.parse(tc.function.arguments)
          : tc?.function?.arguments ?? {};
      } catch {
        // ignore parse error; use empty input
      }
      const result = await executeTool(toolName, input, agent.id, supabase);
      return { toolCallId: tc.id, result };
    }),
  );

  return json({ results });
}

export async function handler(req: Request, _createClient: ClientFactory): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const log = createLogger("vapi-webhook", req);
  const _start = Date.now();

  try {
    const VAPI_SERVER_SECRET = Deno.env.get("VAPI_SERVER_SECRET") ?? "";
    const incomingSecret = req.headers.get("x-vapi-secret") ?? "";
    if (VAPI_SERVER_SECRET && incomingSecret !== VAPI_SERVER_SECRET) {
      log({ event: "signature_failure", status: 401 });
      return json({ error: "Unauthorized" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = _createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const messageType: string = body?.message?.type ?? "";

    let response: Response;
    if (messageType === "assistant-request") {
      response = await handleAssistantRequest(body.message, supabase);
    } else if (messageType === "tool-calls") {
      response = await handleToolCalls(body.message, supabase);
    } else {
      // status-update, end-of-call-report, etc. — acknowledge only
      response = json({ received: true });
    }

    log({ event: "success", status: response.status, message_type: messageType });
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log({ event: "error", status: 500, error: msg });
    return json({ error: "Internal server error" }, 500);
  } finally {
    log.flush(Date.now() - _start);
  }
}

Deno.serve((req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return handler(req, createClient);
});
```

- [ ] **Step 3: Verify file exists**

Run: `wc -l edge-functions/vapi-webhook/index.ts`
Expected: >100 lines

---

## Task 4: Tests for vapi-webhook

**Files:**
- Create: `edge-functions/vapi-webhook/index.test.ts`

- [ ] **Step 1: Write the tests**

```typescript
// edge-functions/vapi-webhook/index.test.ts
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { handler } from "./index.ts";
import { createMockSupabase, mockClientFactory } from "../_shared/test-mock.ts";

const VALID_SECRET = "test-secret";

function makeReq(body: unknown, secret = VALID_SECRET): Request {
  return new Request("http://localhost/vapi-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vapi-secret": secret,
      "origin": "https://sellingdubai.com",
    },
    body: JSON.stringify(body),
  });
}

Deno.test("vapi-webhook: rejects missing secret", async () => {
  const originalEnv = Deno.env.get("VAPI_SERVER_SECRET");
  Deno.env.set("VAPI_SERVER_SECRET", VALID_SECRET);
  try {
    const client = mockClientFactory({
      agents: { data: null, error: null },
    });
    const req = makeReq({ message: { type: "assistant-request" } }, "wrong-secret");
    const res = await handler(req, client);
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error, "Unauthorized");
  } finally {
    if (originalEnv !== undefined) Deno.env.set("VAPI_SERVER_SECRET", originalEnv);
    else Deno.env.delete("VAPI_SERVER_SECRET");
  }
});

Deno.test("vapi-webhook: assistant-request returns config for unknown caller", async () => {
  const originalEnv = Deno.env.get("VAPI_SERVER_SECRET");
  Deno.env.set("VAPI_SERVER_SECRET", VALID_SECRET);
  try {
    const client = mockClientFactory({
      agents: { data: null, error: null },
    });
    const req = makeReq({
      message: {
        type: "assistant-request",
        call: { customer: { number: "+971501234567" } },
      },
    });
    const res = await handler(req, client);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(typeof body.assistant, "object");
    assertEquals(typeof body.assistant.firstMessage, "string");
  } finally {
    if (originalEnv !== undefined) Deno.env.set("VAPI_SERVER_SECRET", originalEnv);
    else Deno.env.delete("VAPI_SERVER_SECRET");
  }
});

Deno.test("vapi-webhook: assistant-request returns personalised greeting for known agent", async () => {
  const originalEnv = Deno.env.get("VAPI_SERVER_SECRET");
  Deno.env.set("VAPI_SERVER_SECRET", VALID_SECRET);
  try {
    const mockAgent = { id: "agent-uuid", name: "Hassan", agency_id: null };
    const client = mockClientFactory({
      agents: { data: mockAgent, error: null },
      leads: { data: null, error: null, count: 3 },
    });
    const req = makeReq({
      message: {
        type: "assistant-request",
        call: { customer: { number: "+971501234567" } },
      },
    });
    const res = await handler(req, client);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.assistant.firstMessage.includes("Hassan"), true);
    assertEquals(body.assistant.firstMessage.includes("3"), true);
  } finally {
    if (originalEnv !== undefined) Deno.env.set("VAPI_SERVER_SECRET", originalEnv);
    else Deno.env.delete("VAPI_SERVER_SECRET");
  }
});

Deno.test("vapi-webhook: tool-calls returns 404 for unknown caller", async () => {
  const originalEnv = Deno.env.get("VAPI_SERVER_SECRET");
  Deno.env.set("VAPI_SERVER_SECRET", VALID_SECRET);
  try {
    const client = mockClientFactory({
      agents: { data: null, error: null },
    });
    const req = makeReq({
      message: {
        type: "tool-calls",
        call: { customer: { number: "+971500000000" } },
        toolCallList: [
          { id: "tc1", function: { name: "get_stats", arguments: "{}" } },
        ],
      },
    });
    const res = await handler(req, client);
    assertEquals(res.status, 404);
  } finally {
    if (originalEnv !== undefined) Deno.env.set("VAPI_SERVER_SECRET", originalEnv);
    else Deno.env.delete("VAPI_SERVER_SECRET");
  }
});

Deno.test("vapi-webhook: tool-calls executes tools and returns results array", async () => {
  const originalEnv = Deno.env.get("VAPI_SERVER_SECRET");
  Deno.env.set("VAPI_SERVER_SECRET", VALID_SECRET);
  try {
    const mockAgent = { id: "agent-uuid", name: "Hassan", agency_id: null };
    const client = mockClientFactory({
      agents: { data: mockAgent, error: null },
      leads: { data: [], error: null, count: 0 },
      properties: { data: null, error: null, count: 5 },
    });
    const req = makeReq({
      message: {
        type: "tool-calls",
        call: { customer: { number: "+971501234567" } },
        toolCallList: [
          { id: "tc1", function: { name: "get_stats", arguments: "{}" } },
        ],
      },
    });
    const res = await handler(req, client);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(Array.isArray(body.results), true);
    assertEquals(body.results[0].toolCallId, "tc1");
    assertEquals(typeof body.results[0].result, "string");
  } finally {
    if (originalEnv !== undefined) Deno.env.set("VAPI_SERVER_SECRET", originalEnv);
    else Deno.env.delete("VAPI_SERVER_SECRET");
  }
});

Deno.test("vapi-webhook: unrecognised message type returns 200 ack", async () => {
  const originalEnv = Deno.env.get("VAPI_SERVER_SECRET");
  Deno.env.set("VAPI_SERVER_SECRET", VALID_SECRET);
  try {
    const client = mockClientFactory({});
    const req = makeReq({ message: { type: "end-of-call-report" } });
    const res = await handler(req, client);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.received, true);
  } finally {
    if (originalEnv !== undefined) Deno.env.set("VAPI_SERVER_SECRET", originalEnv);
    else Deno.env.delete("VAPI_SERVER_SECRET");
  }
});
```

- [ ] **Step 2: Run tests to verify they fail (implementation not wired yet)**

Run: `cd edge-functions && deno test vapi-webhook/index.test.ts --allow-env --allow-net 2>&1 | tail -20`
Expected: Errors about missing module or failed assertions (confirms tests are linked to real code)

- [ ] **Step 3: Run tests after implementation (Task 3 must be complete)**

Run: `cd edge-functions && deno test vapi-webhook/index.test.ts --allow-env --allow-net 2>&1 | tail -20`
Expected: All 6 tests pass

- [ ] **Step 4: Commit**

```bash
git add edge-functions/vapi-webhook/index.ts edge-functions/vapi-webhook/index.test.ts
git commit -m "feat(voice): add vapi-webhook edge function with tests"
```

---

## Task 5: Siri Bearer auth in ai-secretary

**Files:**
- Modify: `edge-functions/ai-secretary/index.ts`
- Modify: `edge-functions/ai-secretary/index.test.ts`

- [ ] **Step 1: Read the current agent-id resolution in ai-secretary**

Run: `grep -n "agent_id\|resolvedAgent\|body\." edge-functions/ai-secretary/index.ts | head -30`

Find the line where `agent_id` is first read from the request body.

- [ ] **Step 2: Add Siri Bearer auth path**

In `ai-secretary/index.ts`, replace the existing agent_id extraction (the line like `const agent_id = body.agent_id`) with:

```typescript
let resolvedAgentId: string | undefined = (body as Record<string, unknown>).agent_id as string | undefined;

const authHeader = req.headers.get("Authorization");
if (authHeader?.startsWith("Bearer ")) {
  const token = authHeader.slice(7);
  const { data: tokenAgent } = await supabase
    .from("agents")
    .select("id")
    .eq("siri_token", token)
    .maybeSingle();
  if (!tokenAgent) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  resolvedAgentId = tokenAgent.id;
}
```

Then replace all uses of the old `agent_id` variable with `resolvedAgentId` throughout the function. Verify with:

Run: `grep -n "agent_id\b" edge-functions/ai-secretary/index.ts | grep -v "resolvedAgentId\|\.agent_id\|body"`
Expected: No bare `agent_id` variable usages remain.

- [ ] **Step 3: Write two new tests in ai-secretary/index.test.ts**

Add these two tests to the existing test file:

```typescript
Deno.test("ai-secretary: rejects invalid Bearer token", async () => {
  const client = mockClientFactory({
    agents: { data: null, error: null },
    whatsapp_sessions: { data: null, error: null },
  });
  const req = new Request("http://localhost/ai-secretary", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer invalid-token-uuid",
      "origin": "https://sellingdubai.com",
    },
    body: JSON.stringify({ message: "check my leads", channel: "siri" }),
  });
  const res = await handler(req, client);
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Invalid token");
});

Deno.test("ai-secretary: resolves agent from valid Bearer token", async () => {
  const mockAgent = { id: "agent-from-token", name: "Fatima", siri_token: "valid-uuid" };
  const mockSession = { agent_id: "agent-from-token", turns: [], last_active: new Date().toISOString() };
  const client = mockClientFactory({
    agents: { data: mockAgent, error: null },
    whatsapp_sessions: { data: mockSession, error: null },
    leads: { data: [], error: null },
    properties: { data: null, error: null, count: 0 },
  });
  const req = new Request("http://localhost/ai-secretary", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer valid-uuid",
      "origin": "https://sellingdubai.com",
    },
    body: JSON.stringify({ message: "check my leads", channel: "siri" }),
  });
  const res = await handler(req, client);
  // Should not be 401 — agent was resolved from token
  assertEquals(res.status !== 401, true);
});
```

- [ ] **Step 4: Run ai-secretary tests**

Run: `cd edge-functions && deno test ai-secretary/index.test.ts --allow-env --allow-net 2>&1 | tail -20`
Expected: All tests pass including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add edge-functions/ai-secretary/index.ts edge-functions/ai-secretary/index.test.ts
git commit -m "feat(voice): add Siri Bearer token auth to ai-secretary"
```

---

## Task 6: rotate-siri-token edge function

**Files:**
- Create: `edge-functions/rotate-siri-token/index.ts`
- Create: `edge-functions/rotate-siri-token/index.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// edge-functions/rotate-siri-token/index.test.ts
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { handler } from "./index.ts";
import { createMockSupabase, mockClientFactory } from "../_shared/test-mock.ts";

Deno.test("rotate-siri-token: rejects missing token", async () => {
  const client = mockClientFactory({});
  const req = new Request("http://localhost/rotate-siri-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const res = await handler(req, client);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "Missing token");
});

Deno.test("rotate-siri-token: rejects invalid magic link token", async () => {
  const client = mockClientFactory({
    magic_links: { data: null, error: null },
  });
  const req = new Request("http://localhost/rotate-siri-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "bad-token" }),
  });
  const res = await handler(req, client);
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Invalid session");
});

Deno.test("rotate-siri-token: rejects expired magic link token", async () => {
  const expiredLink = {
    token: "expired-token",
    agent_id: "agent-uuid",
    expires_at: new Date(Date.now() - 1000).toISOString(),
    revoked_at: null,
    used_at: new Date().toISOString(),
  };
  const client = mockClientFactory({
    magic_links: { data: expiredLink, error: null },
  });
  const req = new Request("http://localhost/rotate-siri-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "expired-token" }),
  });
  const res = await handler(req, client);
  assertEquals(res.status, 401);
});

Deno.test("rotate-siri-token: rotates siri_token and returns new value", async () => {
  const validLink = {
    token: "valid-session",
    agent_id: "agent-uuid",
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    revoked_at: null,
    used_at: new Date().toISOString(),
  };
  const client = mockClientFactory({
    magic_links: { data: validLink, error: null },
    "agents:write": { data: { siri_token: "new-generated-uuid" }, error: null },
  });
  const req = new Request("http://localhost/rotate-siri-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "valid-session" }),
  });
  const res = await handler(req, client);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(typeof body.siri_token, "string");
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd edge-functions && deno test rotate-siri-token/index.test.ts --allow-env 2>&1 | tail -10`
Expected: Error — `rotate-siri-token/index.ts` not found.

- [ ] **Step 3: Write rotate-siri-token/index.ts**

```typescript
// edge-functions/rotate-siri-token/index.ts
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders } from "../_shared/utils.ts";

type ClientFactory = (url: string, key: string) => SupabaseClient;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export async function handler(req: Request, _createClient: ClientFactory): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const log = createLogger("rotate-siri-token", req);
  const _start = Date.now();

  try {
    const body = await req.json();
    const { token } = body as { token?: string };

    if (!token) {
      return json({ error: "Missing token" }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = _createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Validate magic link session
    const { data: link } = await supabase
      .from("magic_links")
      .select("*")
      .eq("token", token)
      .is("revoked_at", null)
      .single();

    if (!link || new Date(link.expires_at) < new Date() || !link.used_at) {
      log({ event: "invalid_session", status: 401 });
      return json({ error: "Invalid session" }, 401);
    }

    // Generate new UUID and update agents table
    const { data: updated, error: updateError } = await supabase
      .from("agents")
      .update({ siri_token: crypto.randomUUID() })
      .eq("id", link.agent_id)
      .select("siri_token")
      .single();

    if (updateError || !updated) {
      log({ event: "error", status: 500, error: updateError?.message });
      return json({ error: "Failed to rotate token" }, 500);
    }

    log({ event: "token_rotated", status: 200, agent_id: link.agent_id });
    return json({ siri_token: updated.siri_token });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log({ event: "error", status: 500, error: msg });
    return json({ error: "Internal server error" }, 500);
  } finally {
    log.flush(Date.now() - _start);
  }
}

Deno.serve((req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return handler(req, createClient);
});
```

- [ ] **Step 4: Run tests — all should pass**

Run: `cd edge-functions && deno test rotate-siri-token/index.test.ts --allow-env 2>&1 | tail -20`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add edge-functions/rotate-siri-token/index.ts edge-functions/rotate-siri-token/index.test.ts
git commit -m "feat(voice): add rotate-siri-token edge function with tests"
```

---

## Task 7: Dashboard AI Secretary UI

**Files:**
- Modify: `dashboard.html`
- Modify: `js/dashboard.js`
- Modify: `js/event-delegation.js`
- Modify: `js/sd-config.js`

- [ ] **Step 1: Read the current end of dashboard.html to find insertion point**

Run: `grep -n "secretary\|</main>\|referral-section" dashboard.html | tail -20`

Locate the `</main>` closing tag line number.

- [ ] **Step 2: Add AI Secretary HTML section before </main>**

Insert the following block immediately before the `</main>` closing tag:

```html
      <!-- AI Secretary -->
      <div class="secretary-section" id="secretary-section" style="display:none">
        <div class="leads-header">
          <span class="leads-title">AI Secretary</span>
        </div>
        <div class="secretary-card">
          <div class="secretary-row">
            <div class="secretary-label">Secretary number</div>
            <div class="secretary-value-row">
              <span id="secretary-phone" class="secretary-value"></span>
              <button class="btn-sm btn-outline" data-action="copySecretaryPhone">Copy</button>
            </div>
          </div>
          <div class="secretary-row">
            <div class="secretary-label">Siri shortcut token</div>
            <div class="secretary-value-row">
              <code id="secretary-token" class="secretary-value"></code>
              <button class="btn-sm btn-outline" data-action="copySecretaryToken">Copy</button>
              <button class="btn-sm btn-ghost" data-action="rotateSiriToken">Rotate</button>
            </div>
          </div>
          <div class="secretary-row">
            <a href="/siri/SellingDubai.shortcut" download="SellingDubai.shortcut" class="btn-sm btn-primary">
              Add Siri Shortcut
            </a>
          </div>
        </div>
      </div>
```

- [ ] **Step 3: Add VAPI_PHONE_NUMBER to sd-config.js**

In `js/sd-config.js`, add `VAPI_PHONE_NUMBER` to the `window.SD_CONFIG` object:

```javascript
VAPI_PHONE_NUMBER: '+971XXXXXXXXX', // Set after Vapi phone number provisioned
```

- [ ] **Step 4: Add ROTATE_SIRI_URL to resolveConfig() in dashboard.js**

Find `resolveConfig()` in `js/dashboard.js` (the function that sets `SUPABASE_URL` etc.) and add:

```javascript
const ROTATE_SIRI_URL = `${SUPABASE_URL}/functions/v1/rotate-siri-token`;
```

- [ ] **Step 5: Add renderSecretarySection and window globals to dashboard.js**

Add these functions to `js/dashboard.js` (near the other `window.*` global assignments):

```javascript
function renderSecretarySection(agent) {
  const section = document.getElementById('secretary-section');
  if (!section || !agent) return;
  const phoneEl = document.getElementById('secretary-phone');
  const tokenEl = document.getElementById('secretary-token');
  if (phoneEl) phoneEl.textContent = (window.SD_CONFIG && window.SD_CONFIG.VAPI_PHONE_NUMBER) || 'Not configured';
  if (tokenEl) tokenEl.textContent = agent.siri_token || 'Loading…';
  section.style.display = '';
}

window.copySecretaryPhone = function () {
  const phone = document.getElementById('secretary-phone')?.textContent || '';
  navigator.clipboard.writeText(phone).catch(() => {});
};

window.copySecretaryToken = function () {
  const token = document.getElementById('secretary-token')?.textContent || '';
  navigator.clipboard.writeText(token).catch(() => {});
};

window.rotateSiriToken = async function () {
  if (!authToken) return;
  try {
    const res = await fetch(ROTATE_SIRI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: authToken }),
    });
    if (!res.ok) throw new Error('Failed to rotate token');
    const data = await res.json();
    const tokenEl = document.getElementById('secretary-token');
    if (tokenEl) tokenEl.textContent = data.siri_token;
  } catch (err) {
    window.reportError?.('rotateSiriToken', err);
  }
};
```

- [ ] **Step 6: Call renderSecretarySection inside loadDashboard()**

In `js/dashboard.js`, find `loadDashboard()` and add the call after the existing render calls:

```javascript
renderSecretarySection(currentAgent);
```

- [ ] **Step 7: Add 3 new data-action cases to event-delegation.js**

In `js/event-delegation.js`, add to the switch statement:

```javascript
case 'copySecretaryPhone':
  window.copySecretaryPhone && window.copySecretaryPhone();
  break;
case 'copySecretaryToken':
  window.copySecretaryToken && window.copySecretaryToken();
  break;
case 'rotateSiriToken':
  window.rotateSiriToken && window.rotateSiriToken();
  break;
```

- [ ] **Step 8: Verify the changes compile (JS is @ts-check annotated)**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds, no new errors. `dist/init.bundle.js` still under 30KB.

Run: `ls -la dist/init.bundle.js | awk '{print $5}'`
Expected: Size < 30720 (30KB in bytes)

- [ ] **Step 9: Commit**

```bash
git add dashboard.html js/dashboard.js js/event-delegation.js js/sd-config.js
git commit -m "feat(voice): add AI Secretary card to dashboard with Siri token rotation"
```

---

## Task 8: Siri Shortcut placeholder + deploy checklist

**Files:**
- Create: `siri/SellingDubai.shortcut`

- [ ] **Step 1: Create the siri/ directory and placeholder file**

Run: `mkdir -p siri`

The `.shortcut` file is a binary plist created in iOS Shortcuts app. Commit a text placeholder so the download URL works and the path is reserved:

```bash
echo "# SellingDubai Siri Shortcut placeholder
# Replace this file with the real .shortcut binary built in the iOS Shortcuts app.
#
# Shortcut logic (build in iOS Shortcuts app):
# 1. Action: Ask for Input (Dictation) — prompt: 'What would you like to do?'
# 2. Action: Get contents of URL
#    URL: https://pjyorgedaxevxophpfib.supabase.co/functions/v1/ai-secretary
#    Method: POST
#    Headers: Authorization = Bearer [stored siri_token], Content-Type = application/json
#    Body (JSON): { 'message': [Dictation result], 'channel': 'siri' }
# 3. Action: Get dictionary value 'reply' from response
# 4. Action: Speak text [reply]
#
# Agent onboarding:
# 1. Agent opens dashboard > AI Secretary > copies their Siri token
# 2. Agent taps 'Add Siri Shortcut' — downloads this file
# 3. iOS Shortcuts opens — agent sets their token in the URL header variable
# 4. Agent sets trigger phrase (e.g. 'Hey Siri, SellingDubai')
" > siri/SellingDubai.shortcut
```

- [ ] **Step 2: Verify the file exists**

Run: `ls -la siri/`
Expected: `SellingDubai.shortcut` present

- [ ] **Step 3: Add pre-deploy-check for vapi-webhook and rotate-siri-token**

Run: `grep -n "vapi\|rotate-siri\|ai-secretary" scripts/pre-deploy-check.sh`

If `ai-secretary` is already checked, add the two new functions to the same endpoint health check list. If the check uses a loop variable like `FUNCTIONS=("ai-secretary" ...)`, add:

```bash
"vapi-webhook"
"rotate-siri-token"
```

- [ ] **Step 4: Commit**

```bash
git add siri/SellingDubai.shortcut scripts/pre-deploy-check.sh
git commit -m "feat(voice): add Siri shortcut placeholder and update pre-deploy checks"
```

- [ ] **Step 5: Deploy to staging (manual checklist)**

Run these commands to deploy the new edge functions to staging (project ref `lhrtdlxqbdxrfvjeoxrt`):

```bash
# Apply migration to staging
supabase db push --project-ref lhrtdlxqbdxrfvjeoxrt

# Deploy new edge functions
supabase functions deploy vapi-webhook --project-ref lhrtdlxqbdxrfvjeoxrt --use-api
supabase functions deploy rotate-siri-token --project-ref lhrtdlxqbdxrfvjeoxrt --use-api
supabase functions deploy ai-secretary --project-ref lhrtdlxqbdxrfvjeoxrt --use-api
```

- [ ] **Step 6: Set required secrets on staging**

```bash
supabase secrets set VAPI_SERVER_SECRET=<your-vapi-secret> --project-ref lhrtdlxqbdxrfvjeoxrt
supabase secrets set VAPI_WEBHOOK_URL=https://lhrtdlxqbdxrfvjeoxrt.supabase.co/functions/v1/vapi-webhook --project-ref lhrtdlxqbdxrfvjeoxrt
supabase secrets set VOICE_PROVIDER=elevenlabs --project-ref lhrtdlxqbdxrfvjeoxrt
supabase secrets set ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM --project-ref lhrtdlxqbdxrfvjeoxrt
```

- [ ] **Step 7: Provision Vapi phone number (manual — outside codebase)**

In Vapi dashboard (vapi.ai):
1. Create a new assistant — leave config minimal; it will be overridden per-call by `assistant-request`
2. Buy/provision a phone number and attach it to the assistant
3. Set the server URL to: `https://lhrtdlxqbdxrfvjeoxrt.supabase.co/functions/v1/vapi-webhook` (staging) or production URL
4. Set the server secret — must match `VAPI_SERVER_SECRET` env var on Supabase
5. Copy the phone number and update `VAPI_PHONE_NUMBER` in `js/sd-config.js`
6. Commit the phone number update: `git commit -m "chore(voice): set Vapi phone number in sd-config.js"`

- [ ] **Step 8: Smoke test the voice flow**

Call the Vapi phone number. Expected:
- Greeting plays within 3 seconds: "Hi [name]! You have N new leads. How can I help?"
- Say "check my leads" — should respond with lead list
- Say "what are my stats" — should respond with stats summary

For an unregistered number, expected: "Welcome to SellingDubai. Your number isn't registered..."

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task covering it |
|---|---|
| Vapi phone number provisioning | Task 8 Step 7 |
| Dynamic assistant-request config (agent context, tools) | Task 3 |
| Vapi tool-calls handling | Task 3 |
| Vapi webhook secret validation | Task 3, Task 4 |
| Shared tool executor extracted | Task 2 |
| Siri Bearer token auth in ai-secretary | Task 5 |
| `siri_token` DB column + migration | Task 1 |
| `rotate-siri-token` edge function | Task 6 |
| Dashboard AI Secretary card (phone, token, rotate, download) | Task 7 |
| Siri Shortcut static file | Task 8 |
| ElevenLabs TTS as default voice | Task 3 (VOICE_PROVIDER env var) |
| Whisper STT (via Vapi built-in) | Task 8 Step 7 (Vapi config) — Vapi handles STT automatically |
| `VAPI_PHONE_NUMBER` in sd-config | Task 7 Step 3 |
| Pre-deploy check coverage | Task 8 Step 3 |

**Type consistency:**
- `ToolName` defined in `_shared/tool-executor.ts` and imported in both `ai-secretary` and `vapi-webhook` — consistent
- `handler(req, _createClient)` pattern matches update-agent, ai-secretary, all other functions — consistent
- `createMockSupabase` / `mockClientFactory` test helpers match existing test files — consistent
- `createLogger` / `log.flush` pattern matches all other edge functions — consistent

**Placeholder scan:** No TBDs. All code blocks are complete. Vapi provisioning steps in Task 8 are manual actions that cannot be automated from code — documented as manual checklist steps with explicit expected outcomes.
