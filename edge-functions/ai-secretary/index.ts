// edge-functions/ai-secretary/index.ts
// deno-lint-ignore-file no-explicit-any
//
// Claude-powered AI orchestrator for all channels (WhatsApp, Telegram, Siri, VAPI).
//
// POST /functions/v1/ai-secretary
// Authorization: Bearer <session_token>
// { "message": "...", "channel": "whatsapp"|"telegram"|"siri"|"vapi", "agent_id": "uuid" }
//
// Returns: { "reply": "...", "actions_taken": ["tool_name", ...] }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";
import { createLogger } from "../_shared/logger.ts";
import { executeTool, TOOL_DEFINITIONS, type ToolName } from "../_shared/tool-executor.ts";

/** The 5 tools exposed to Claude per spec. Extra tools in TOOL_DEFINITIONS are reserved for future use. */
const AI_SECRETARY_TOOLS = TOOL_DEFINITIONS.filter((t) =>
  ["get_leads", "get_listings", "get_stats", "get_cobrokes", "update_lead"].includes(t.name)
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Channel = "whatsapp" | "telegram" | "siri" | "vapi";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

// deno-lint-ignore no-explicit-any
type CreateClientFn = (url: string, key: string) => any;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_ORIGINS = [
  "https://www.sellingdubai.ae",
  "https://sellingdubai.ae",
  "https://www.sellingdubai.com",
  "https://sellingdubai.com",
  "https://staging.sellingdubai.com",
];

const IS_LOCAL_DEV = (Deno.env.get("SUPABASE_URL") ?? "").startsWith("http://127.0.0.1");

const SYSTEM_PROMPT =
  "You are an AI secretary for a Dubai real estate agent. Help them manage their leads, " +
  "listings, and performance stats efficiently. Be concise and professional. Use the available " +
  "tools to fetch real data before responding. Format responses as short messages suitable for " +
  "WhatsApp/Telegram.";

const MODEL = "claude-haiku-4-5-20251001";

/** Maximum conversation turns to persist per session. */
const MAX_TURNS = 10;

/** Rate limit: max requests per IP per minute for this function. */
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const isLocalOrigin =
    IS_LOCAL_DEV &&
    (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:"));
  const allowedOrigin = isLocalOrigin
    ? origin
    : ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

// ---------------------------------------------------------------------------
// Rate limiting (in-memory per isolate, intentionally lightweight)
// ---------------------------------------------------------------------------

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/** Verify a magic_link session token. Returns agent_id or null. */
async function verifyMagicLinkToken(
  token: string,
  supabase: any,
): Promise<string | null> {
  const now = new Date().toISOString();
  const { data: link, error } = await supabase
    .from("magic_links")
    .select("agent_id, used_at, expires_at, revoked_at")
    .eq("token", token)
    .gt("expires_at", now)
    .is("revoked_at", null)
    .single();
  if (error || !link) return null;
  // Session must have been activated (used_at set by verify-magic-link)
  if (!link.used_at) return null;
  return link.agent_id as string;
}

/** Verify a siri_token. Returns agent_id or null. */
async function verifySiriToken(
  token: string,
  supabase: any,
): Promise<string | null> {
  const { data: agent, error } = await supabase
    .from("agents")
    .select("id")
    .eq("siri_token", token)
    .single();
  if (error || !agent) return null;
  return agent.id as string;
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

type SessionTable = "whatsapp_sessions" | "telegram_sessions";

function sessionTable(channel: Channel): SessionTable | null {
  if (channel === "whatsapp") return "whatsapp_sessions";
  if (channel === "telegram") return "telegram_sessions";
  return null; // siri/vapi are single-turn
}

async function loadTurns(
  table: SessionTable,
  agentId: string,
  supabase: any,
): Promise<Turn[]> {
  const { data } = await supabase
    .from(table)
    .select("turns")
    .eq("agent_id", agentId)
    .single();
  if (!data?.turns) return [];
  return (data.turns as Turn[]).slice(-MAX_TURNS);
}

async function saveTurns(
  table: SessionTable,
  agentId: string,
  turns: Turn[],
  supabase: any,
): Promise<void> {
  const trimmed = turns.slice(-MAX_TURNS);
  await supabase.from(table).upsert(
    { agent_id: agentId, turns: trimmed, last_active: new Date().toISOString() },
    { onConflict: "agent_id" },
  );
}

// ---------------------------------------------------------------------------
// Agent context loader
// ---------------------------------------------------------------------------

async function loadAgentContext(
  agentId: string,
  supabase: any,
): Promise<string> {
  const { data: agent } = await supabase
    .from("agents")
    .select("name, agency_name")
    .eq("id", agentId)
    .single();
  if (!agent) return "";
  const parts: string[] = [`Agent: ${agent.name}`];
  if (agent.agency_name) parts.push(`Agency: ${agent.agency_name}`);
  return parts.join(" | ");
}

// ---------------------------------------------------------------------------
// Claude tool call loop
// ---------------------------------------------------------------------------

async function runClaude(
  userMessage: string,
  history: Turn[],
  agentContext: string,
  agentId: string,
  supabase: any,
): Promise<{ reply: string; actionsTaken: string[] }> {
  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

  // Build system prompt with agent context
  const systemPrompt = agentContext
    ? `${SYSTEM_PROMPT}\n\n${agentContext}`
    : SYSTEM_PROMPT;

  // Convert history turns to Anthropic message format
  const messages: Anthropic.MessageParam[] = [
    ...history.map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: userMessage },
  ];

  const actionsTaken: string[] = [];

  // Agentic loop — keep going while Claude calls tools
  let response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    tools: AI_SECRETARY_TOOLS as Anthropic.Tool[],
    messages,
  });

  while (response.stop_reason === "tool_use") {
    // Collect all tool use blocks from this response
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    // Build tool results
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      const toolName = toolUse.name as ToolName;
      const toolInput = (toolUse.input ?? {}) as Record<string, unknown>;

      let result: string;
      try {
        result = await executeTool(toolName, toolInput, agentId, supabase);
      } catch (err) {
        result = `Tool error: ${String(err)}`;
      }

      if (!actionsTaken.includes(toolName)) actionsTaken.push(toolName);

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    // Append assistant turn + tool results and continue
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });

    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      tools: AI_SECRETARY_TOOLS as Anthropic.Tool[],
      messages,
    });
  }

  // Extract final text reply
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  const reply = textBlock?.text ?? "I'm sorry, I couldn't generate a response.";

  return { reply, actionsTaken };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handler(
  req: Request,
  _createClient: CreateClientFn = createClient,
): Promise<Response> {
  const log = createLogger("ai-secretary", req);
  const _start = Date.now();
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: cors,
    });
  }

  // Rate limit by IP
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
  if (isRateLimited(ip)) {
    log({ event: "rate_limited", status: 429 });
    return new Response(JSON.stringify({ error: "Too many requests. Please wait a moment." }), {
      status: 429,
      headers: cors,
    });
  }

  try {
    // Parse body
    let body: { message?: unknown; channel?: unknown; agent_id?: unknown };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
        status: 400,
        headers: cors,
      });
    }

    const { message, channel, agent_id: bodyAgentId } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return new Response(JSON.stringify({ error: "message is required." }), {
        status: 400,
        headers: cors,
      });
    }

    const channelStr = (typeof channel === "string" ? channel : "whatsapp") as Channel;
    const validChannels: Channel[] = ["whatsapp", "telegram", "siri", "vapi"];
    if (!validChannels.includes(channelStr)) {
      return new Response(
        JSON.stringify({ error: `channel must be one of: ${validChannels.join(", ")}` }),
        { status: 400, headers: cors },
      );
    }

    // Auth: Bearer header → siri_token lookup; no header → body agent_id (WhatsApp/Telegram/etc.)
    let resolvedAgentId: string | undefined;

    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const supabaseForAuth = _createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const token = authHeader.slice(7);
      const tokenAgentId = await verifySiriToken(token, supabaseForAuth);
      if (!tokenAgentId) {
        log({ event: "auth_failed", status: 401 });
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401,
          headers: cors,
        });
      }
      resolvedAgentId = tokenAgentId;
    } else {
      // No Bearer header — fall back to body agent_id (existing behavior for WhatsApp/Telegram/etc.)
      resolvedAgentId = (body as Record<string, unknown>).agent_id as string | undefined;
    }

    const agentId: string | null = resolvedAgentId ?? null;

    if (!agentId) {
      log({ event: "auth_failed", status: 401 });
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: cors,
      });
    }

    const supabase = _createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load conversation history (stateful channels only)
    const table = sessionTable(channelStr);
    let history: Turn[] = [];
    if (table) {
      history = await loadTurns(table, agentId, supabase);
    }

    // Load agent context (name, agency)
    const agentContext = await loadAgentContext(agentId, supabase);

    // Call Claude with tool loop
    const { reply, actionsTaken } = await runClaude(
      message.trim(),
      history,
      agentContext,
      agentId,
      supabase,
    );

    // Persist updated history (stateful channels only)
    if (table) {
      const updatedTurns: Turn[] = [
        ...history,
        { role: "user", content: message.trim() },
        { role: "assistant", content: reply },
      ];
      await saveTurns(table, agentId, updatedTurns, supabase);
    }

    log({ event: "success", agent_id: agentId, channel: channelStr, status: 200 });
    return new Response(
      JSON.stringify({ reply, actions_taken: actionsTaken }),
      { status: 200, headers: cors },
    );
  } catch (err) {
    log({ event: "error", status: 500, error: String(err) });
    console.error("ai-secretary error:", err instanceof Error ? err.stack : String(err));
    return new Response(JSON.stringify({ error: "Internal server error." }), {
      status: 500,
      headers: cors,
    });
  } finally {
    log.flush(Date.now() - _start);
  }
}

Deno.serve((req) => handler(req));
