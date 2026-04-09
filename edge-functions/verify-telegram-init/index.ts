// edge-functions/verify-telegram-init/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/utils.ts";
import { createLogger } from "../_shared/logger.ts";

// deno-lint-ignore no-explicit-any
type CreateClientFn = (url: string, key: string) => any;

// ── Telegram initData HMAC Validation ──────────────────────────────────────
// Spec: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

async function validateInitData(initData: string, botToken: string): Promise<Record<string, string> | null> {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;

    // Build data_check_string: sorted key=value pairs joined by \n, excluding "hash"
    const pairs: string[] = [];
    for (const [key, value] of params.entries()) {
      if (key !== "hash") pairs.push(`${key}=${value}`);
    }
    pairs.sort();
    const dataCheckString = pairs.join("\n");

    // HMAC key = HMAC-SHA256("WebAppData", botToken)
    const botTokenBytes = new TextEncoder().encode(botToken);
    const webAppDataBytes = new TextEncoder().encode("WebAppData");

    const secretKey = await crypto.subtle.importKey(
      "raw", webAppDataBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const secretKeyBytes = await crypto.subtle.sign("HMAC", secretKey, botTokenBytes);

    // HMAC-SHA256(data_check_string, secretKeyBytes)
    const hmacKey = await crypto.subtle.importKey(
      "raw", secretKeyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const dataBytes = new TextEncoder().encode(dataCheckString);
    const sigBytes = await crypto.subtle.sign("HMAC", hmacKey, dataBytes);
    const computed = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Constant-time comparison
    if (computed.length !== hash.length) return null;
    let diff = 0;
    for (let i = 0; i < computed.length; i++) {
      diff |= computed.charCodeAt(i) ^ hash.charCodeAt(i);
    }
    if (diff !== 0) return null;

    // Return parsed params as object
    const result: Record<string, string> = {};
    for (const [key, value] of params.entries()) {
      result[key] = value;
    }
    return result;
  } catch (_e) {
    return null;
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────

export async function handler(
  req: Request,
  _createClient: CreateClientFn = createClient,
): Promise<Response> {
  const log = createLogger("verify-telegram-init", req);
  const start = Date.now();
  const origin = req.headers.get("origin");
  const cors = { ...getCorsHeaders(origin), "Content-Type": "application/json" };

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });
  }

  try {
    const body = await req.json();
    const { mode, init_data, bot_auth_token } = body;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return new Response(JSON.stringify({ error: "Server configuration error" }), { status: 500, headers: cors });
    }

    const supabase = _createClient(SUPABASE_URL, SERVICE_KEY);

    // ── Mode 1: Telegram Mini App initData validation ──────────────────────
    if (mode === "mini_app") {
      if (!init_data || typeof init_data !== "string") {
        return new Response(JSON.stringify({ error: "init_data required" }), { status: 400, headers: cors });
      }

      const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
      if (!BOT_TOKEN) {
        return new Response(JSON.stringify({ error: "Bot not configured" }), { status: 500, headers: cors });
      }

      const validated = await validateInitData(init_data, BOT_TOKEN);
      if (!validated) {
        return new Response(JSON.stringify({ error: "Invalid initData" }), { status: 401, headers: cors });
      }

      // Extract Telegram user ID from initData "user" JSON field
      let telegramUserId: number;
      try {
        const userObj = JSON.parse(validated.user ?? "{}");
        telegramUserId = userObj.id;
        if (!telegramUserId) throw new Error("no id");
      } catch (_e) {
        return new Response(JSON.stringify({ error: "Invalid user in initData" }), { status: 400, headers: cors });
      }

      // Look up session
      const { data: session } = await supabase
        .from("telegram_sessions")
        .select("agent_id, auth_token")
        .eq("telegram_user_id", telegramUserId)
        .not("agent_id", "is", null)
        .maybeSingle();

      if (!session?.agent_id) {
        return new Response(
          JSON.stringify({ error: "Telegram account not linked. Open the bot and type /start first." }),
          { status: 401, headers: cors },
        );
      }

      // Return the session token (auth_token) as a bearer token for dashboard
      log({ event: "mini_app_auth", agent_id: session.agent_id, status: 200 });
      return new Response(
        JSON.stringify({ session_token: session.auth_token, agent_id: session.agent_id }),
        { status: 200, headers: cors },
      );
    }

    // ── Mode 2: Bot auth callback (magic link with ?token=) ────────────────
    if (mode === "bot_auth") {
      if (!bot_auth_token || typeof bot_auth_token !== "string") {
        return new Response(JSON.stringify({ error: "bot_auth_token required" }), { status: 400, headers: cors });
      }

      // Find session by auth_token
      const { data: session } = await supabase
        .from("telegram_sessions")
        .select("id, telegram_user_id, auth_token_used")
        .eq("auth_token", bot_auth_token)
        .maybeSingle();

      if (!session) {
        return new Response(JSON.stringify({ error: "Invalid or expired token" }), { status: 401, headers: cors });
      }
      if (session.auth_token_used) {
        return new Response(JSON.stringify({ error: "Token already used" }), { status: 401, headers: cors });
      }

      // The magic link was clicked — extract agent from the magic_links table
      const authHeader = req.headers.get("Authorization") ?? "";
      const bearerToken = authHeader.replace(/^Bearer\s+/, "");

      if (!bearerToken) {
        return new Response(
          JSON.stringify({ error: "Authentication required. Please click the magic link." }),
          { status: 401, headers: cors },
        );
      }

      // Validate bearer token against magic_links
      const { data: magicLink } = await supabase
        .from("magic_links")
        .select("agent_id, used_at, revoked_at")
        .eq("token", bearerToken)
        .maybeSingle();

      if (!magicLink?.agent_id || magicLink.revoked_at) {
        return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: cors });
      }

      // Link the Telegram session to the agent
      await supabase
        .from("telegram_sessions")
        .update({
          agent_id: magicLink.agent_id,
          auth_token_used: true,
          last_active: new Date().toISOString(),
        })
        .eq("id", session.id);

      log({ event: "bot_auth_complete", agent_id: magicLink.agent_id, status: 200 });
      return new Response(
        JSON.stringify({ success: true, agent_id: magicLink.agent_id }),
        { status: 200, headers: cors },
      );
    }

    return new Response(JSON.stringify({ error: "mode must be 'mini_app' or 'bot_auth'" }), { status: 400, headers: cors });
  } catch (e) {
    log({ event: "error", status: 500, error: String(e) });
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: cors });
  } finally {
    log.flush(Date.now() - start);
  }
}

Deno.serve((req) => handler(req));
