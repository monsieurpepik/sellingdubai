// ===========================================
// SEND MAGIC LINK — SellingDubai Agent Auth
// ===========================================
// Sends a magic link email to the agent's registered email
// via Resend. Token valid for 15 minutes. Rate limited to 3 per 15 min.
//
// POST { email: "agent@example.com" }
// Returns { success: true }
// ===========================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Escape HTML for email templates (defense in depth)
function escHtml(s: string): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const ALLOWED_ORIGINS = [
  "https://www.sellingdubai.ae",
  "https://sellingdubai.ae",
  "https://www.sellingdubai.com",
  "https://sellingdubai.com",
  "https://sellingdubai-agents.netlify.app",
];
const IS_LOCAL_DEV = (Deno.env.get("SUPABASE_URL") ?? "").startsWith("http://127.0.0.1");
function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const isLocalOrigin = IS_LOCAL_DEV &&
    (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:"));
  const allowedOrigin = isLocalOrigin ? origin
    : (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const { email, destination } = await req.json();

    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "Email is required." }), {
        status: 400,
        headers: cors,
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Init Supabase with service_role to bypass RLS
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    // Find agent by email
    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("id, name, email, slug, verification_status")
      .eq("email", cleanEmail)
      .single();

    if (agentErr || !agent) {
      // Don't reveal if email exists or not — always show success
      // This prevents email enumeration attacks
      return new Response(
        JSON.stringify({ success: true, message: "If this email is registered, you'll receive a magic link." }),
        { status: 200, headers: cors }
      );
    }

    // Per-agent rate limit: max 3 links in 15 min
    const { count: agentRecentCount } = await supabase
      .from("magic_links")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agent.id)
      .gt("created_at", fifteenMinAgo);

    if ((agentRecentCount || 0) >= 3) {
      // Silent success — don't reveal rate limit
      return new Response(
        JSON.stringify({ success: true, message: "If this email is registered, you'll receive a magic link." }),
        { status: 200, headers: cors }
      );
    }

    // Generate a secure random token
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = Array.from(tokenBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Store token — expires in 15 minutes
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Delete unused tokens older than 24 hours (preserve recent signup tokens)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("magic_links")
      .delete()
      .eq("agent_id", agent.id)
      .is("used_at", null)
      .lt("created_at", twentyFourHoursAgo);

    // Insert new token
    const { error: insertErr } = await supabase.from("magic_links").insert({
      agent_id: agent.id,
      token,
      expires_at: expiresAt,
    });

    if (insertErr) {
      console.error("Failed to insert magic link");
      return new Response(
        JSON.stringify({ error: "Failed to create magic link." }),
        { status: 500, headers: cors }
      );
    }

    // Build magic link URL — destination defaults to /dashboard
    const allowedDests = ['/edit', '/dashboard'];
    const dest = typeof destination === 'string' && allowedDests.includes(destination) ? destination : '/dashboard';
    const siteUrl = Deno.env.get("SITE_URL") || "https://sellingdubai.ae";
    const loginUrl = `${siteUrl}${dest}?token=${token}`;
    const buttonText = dest === '/dashboard' ? 'Go to My Dashboard' : 'Edit My Profile';

    // Send email via Resend (with 1 retry on failure)
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
    if (RESEND_KEY) {
      const emailPayload = {
        from: Deno.env.get("RESEND_FROM") || "Boban at SellingDubai <boban@sellingdubai.com>",
        to: [agent.email],
        subject: "Sign in to edit your SellingDubai profile",
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;">
            <div style="text-align:center;margin-bottom:32px;">
              <h2 style="font-size:12px;font-weight:800;letter-spacing:0.25em;text-transform:uppercase;color:#666;margin-bottom:24px;">SELLING DUBAI</h2>
            </div>
            <h1 style="font-size:24px;font-weight:700;color:#111;margin-bottom:8px;">Hey ${escHtml(agent.name)},</h1>
            <p style="font-size:16px;color:#555;line-height:1.6;margin-bottom:32px;">
              Click the button below to sign in and edit your SellingDubai profile. This link expires in 15 minutes.
            </p>
            <div style="text-align:center;margin-bottom:32px;">
              <a href="${loginUrl}" style="display:inline-block;background:#25d366;color:#fff;padding:16px 40px;border-radius:12px;font-size:16px;font-weight:700;text-decoration:none;">
                ${buttonText}
              </a>
            </div>
            <p style="font-size:13px;color:#999;line-height:1.5;">
              If you didn't request this, you can safely ignore this email. The link will expire automatically.
            </p>
            <p style="font-size:12px;color:#ccc;margin-top:32px;text-align:center;">
              &copy; 2026 SellingDubai.com
            </p>
          </div>
        `,
      };

      const sendEmail = () => fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(emailPayload),
      });

      let emailOk = false;
      try {
        const firstRes = await sendEmail();
        if (firstRes.ok) {
          emailOk = true;
        } else {
          const errBody = await firstRes.text();
          console.error("Resend attempt 1 failed:", errBody);
          // Retry after 600ms
          await new Promise(resolve => setTimeout(resolve, 600));
          const retryRes = await sendEmail();
          if (retryRes.ok) {
            emailOk = true;
          } else {
            const retryErr = await retryRes.text();
            console.error("Resend attempt 2 failed:", retryErr);
          }
        }
      } catch (emailErr) {
        console.error("Email send threw:", emailErr);
        // Retry once on network error
        try {
          await new Promise(resolve => setTimeout(resolve, 600));
          const retryRes = await sendEmail();
          if (retryRes.ok) emailOk = true;
        } catch (retryErr) {
          console.error("Resend retry also threw");
        }
      }

      if (!emailOk) {
        return new Response(
          JSON.stringify({ error: "We couldn't send your login email right now. Please try again in a moment." }),
          { status: 503, headers: cors }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: "If this email is registered, you'll receive a magic link." }),
      { status: 200, headers: cors }
    );
  } catch (e) {
    console.error("send-magic-link error:", e instanceof Error ? e.stack : String(e));
    return new Response(
      JSON.stringify({ error: "Internal server error." }),
      { status: 500, headers: cors }
    );
  }
});
