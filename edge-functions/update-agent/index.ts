// ===========================================
// UPDATE AGENT — SellingDubai Profile Editor
// ===========================================
// Authenticated endpoint — requires valid magic link token.
// Updates agent profile fields.
//
// POST { token: "abc123", updates: { name: "...", tagline: "..." } }
// Returns { success: true, agent: { ...updated } }
// ===========================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders as getSharedCorsHeaders } from "../_shared/utils.ts";
import { createLogger } from '../_shared/logger.ts';

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || null;
  return {
    ...getSharedCorsHeaders(origin),
    "Content-Type": "application/json",
  };
}

// Only these fields can be updated by the agent
const ALLOWED_FIELDS = new Set([
  "name",
  "tagline",
  "email",
  "whatsapp",
  "photo_url",
  "background_image_url",
  "agency_name",
  "agency_logo_url",
  "calendly_url",
  "dld_broker_number",
  "license_image_url",
  "custom_link_1_label",
  "custom_link_1_url",
  "custom_link_2_label",
  "custom_link_2_url",
  "instagram_url",
  "youtube_url",
  "tiktok_url",
  "linkedin_url",
  "webhook_url",
  "facebook_pixel_id",
  "facebook_capi_token",
  "ga4_measurement_id",
  "show_preapproval",
  "show_golden_visa",
]);

// deno-lint-ignore no-explicit-any
type CreateClientFn = (url: string, key: string) => any;

export async function handler(
  req: Request,
  _createClient: CreateClientFn = createClient,
): Promise<Response> {
  const log = createLogger('update-agent', req);
  const _start = Date.now();
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const { token, updates } = await req.json();

    if (!token) {
      log({ event: 'auth_failed', status: 401 });
      return new Response(
        JSON.stringify({ error: "Authentication required." }),
        { status: 401, headers: cors }
      );
    }

    if (!updates || typeof updates !== "object") {
      log({ event: 'bad_request', status: 400 });
      return new Response(
        JSON.stringify({ error: "No updates provided." }),
        { status: 400, headers: cors }
      );
    }

    const supabase = _createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify token (same logic as verify-magic-link)
    const { data: link, error: linkErr } = await supabase
      .from("magic_links")
      .select("*")
      .eq("token", token)
      .is("revoked_at", null)
      .single();

    if (linkErr || !link) {
      log({ event: 'auth_failed', status: 401 });
      return new Response(
        JSON.stringify({ error: "Invalid or expired session. Sign in again." }),
        { status: 401, headers: cors }
      );
    }

    if (new Date(link.expires_at) < new Date()) {
      log({ event: 'auth_failed', status: 401 });
      return new Response(
        JSON.stringify({ error: "Session expired. Sign in again." }),
        { status: 401, headers: cors }
      );
    }

    if (!link.used_at) {
      log({ event: 'auth_failed', status: 401 });
      return new Response(
        JSON.stringify({ error: "Session not activated. Please use the login link sent to your email." }),
        { status: 401, headers: cors }
      );
    }

    // Filter updates to only allowed fields
    const safeUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (ALLOWED_FIELDS.has(key)) {
        // Sanitize: trim strings, allow null
        if (typeof value === "string") {
          safeUpdates[key] = value.trim() || null;
        } else {
          safeUpdates[key] = value;
        }
      }
    }

    // Validate input length limits
    const TEXT_MAX_LENGTHS: Record<string, number> = {
      name: 100,
      tagline: 300,
      agency_name: 150,
      custom_link_1_label: 50,
      custom_link_2_label: 50,
      dld_broker_number: 50,
      email: 254,
      whatsapp: 30,
      facebook_pixel_id: 50,
      facebook_capi_token: 500,
      ga4_measurement_id: 50,
    };
    for (const [field, max] of Object.entries(TEXT_MAX_LENGTHS)) {
      if (safeUpdates[field] && typeof safeUpdates[field] === "string" && (safeUpdates[field] as string).length > max) {
        return new Response(
          JSON.stringify({ error: `${field} exceeds maximum length of ${max} characters.` }),
          { status: 400, headers: cors }
        );
      }
    }

    // Validate required fields
    if (safeUpdates.name !== undefined && !safeUpdates.name) {
      return new Response(
        JSON.stringify({ error: "Display name cannot be empty." }),
        { status: 400, headers: cors }
      );
    }
    if (safeUpdates.whatsapp !== undefined && !safeUpdates.whatsapp) {
      return new Response(
        JSON.stringify({ error: "WhatsApp number cannot be empty." }),
        { status: 400, headers: cors }
      );
    }

    // Validate URLs
    const urlFields = [
      "photo_url", "background_image_url", "calendly_url",
      "custom_link_1_url", "custom_link_2_url", "instagram_url", "youtube_url",
      "tiktok_url", "linkedin_url", "webhook_url",
    ];
    for (const field of urlFields) {
      if (safeUpdates[field] && typeof safeUpdates[field] === "string") {
        const val = safeUpdates[field] as string;
        if (!val.startsWith("http://") && !val.startsWith("https://")) {
          safeUpdates[field] = "https://" + val;
        }
      }
    }

    // SSRF protection: block internal/private IPs in webhook_url
    if (safeUpdates.webhook_url && typeof safeUpdates.webhook_url === "string") {
      try {
        const webhookUrl = new URL(safeUpdates.webhook_url as string);
        const hostname = webhookUrl.hostname.toLowerCase();
        // Block localhost, private IPs, link-local, metadata endpoints
        const BLOCKED_PATTERNS = [
          /^localhost$/,
          /^127\./,
          /^10\./,
          /^172\.(1[6-9]|2\d|3[01])\./,
          /^192\.168\./,
          /^169\.254\./,
          /^0\.0\.0\.0$/,
          /^\[::1?\]$/,
          /^metadata\.google\.internal$/,
          /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,  // CGN range
        ];
        if (BLOCKED_PATTERNS.some(p => p.test(hostname))) {
          return new Response(
            JSON.stringify({ error: "Webhook URL cannot point to internal addresses." }),
            { status: 400, headers: cors }
          );
        }
        // Only allow http/https protocols
        if (!["http:", "https:"].includes(webhookUrl.protocol)) {
          return new Response(
            JSON.stringify({ error: "Webhook URL must use HTTP or HTTPS." }),
            { status: 400, headers: cors }
          );
        }
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid webhook URL." }),
          { status: 400, headers: cors }
        );
      }
    }

    // Add updated_at timestamp
    safeUpdates.updated_at = new Date().toISOString();

    // Update agent
    const { data: agent, error: updateErr } = await supabase
      .from("agents")
      .update(safeUpdates)
      .eq("id", link.agent_id)
      .select("*")
      .single();

    if (updateErr) {
      console.error("Update error");
      log({ event: 'error', status: 500, error: String(updateErr) });
      return new Response(
        JSON.stringify({ error: "Failed to update profile." }),
        { status: 500, headers: cors }
      );
    }

    // Strip sensitive fields before returning to client
    const SENSITIVE_FIELDS = [
      'instagram_access_token', 'instagram_user_id',
      'tiktok_access_token', 'tiktok_user_id',
      'facebook_capi_token',
    ];
    const safeAgent = { ...agent };
    for (const field of SENSITIVE_FIELDS) {
      delete safeAgent[field];
    }

    log({ event: 'success', agent_id: link.agent_id, status: 200 });
    return new Response(
      JSON.stringify({ success: true, agent: safeAgent }),
      { status: 200, headers: cors }
    );
  } catch (e) {
    log({ event: 'error', status: 500, error: String(e) });
    console.error("update-agent error");
    return new Response(
      JSON.stringify({ error: "Internal server error." }),
      { status: 500, headers: cors }
    );
  } finally {
    log.flush(Date.now() - _start);
  }
}

Deno.serve((req) => handler(req));
