// edge-functions/vapi-webhook/index.ts
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders } from "../_shared/utils.ts";
import { executeTool, TOOL_DEFINITIONS, type ToolName } from "../_shared/tool-executor.ts";

type ClientFactory = (url: string, key: string) => any;

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
