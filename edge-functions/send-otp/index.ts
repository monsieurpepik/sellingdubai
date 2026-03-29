import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://www.sellingdubai.ae",
  "https://sellingdubai.ae",
  "https://www.sellingdubai.com",
  "https://sellingdubai.com",
  "https://sellingdubai-agents.netlify.app",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(data: unknown, status = 200, cors: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

const TEST_EMAIL = "boban@sellingdubai.com";
const TEST_OTP   = "123456";

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const { email, broker_number } = await req.json();

    // Proper email validation
    if (!email || typeof email !== 'string' || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return json({ error: "Valid email is required" }, 400, cors);
    }

    const cleanEmail = email.toLowerCase().trim();

    // ── Test mode bypass ──────────────────────────────────────────────────────
    // Only active when ENABLE_TEST_MODE=true is set in the Supabase project env.
    // For the test account, skip the random code and real email send — store the
    // well-known OTP "123456" directly so automated QA passes without real email.
    const testMode =
      Deno.env.get("ENABLE_TEST_MODE") === "true" &&
      cleanEmail === TEST_EMAIL;

    const code = testMode
      ? TEST_OTP
      : String(Math.floor(100000 + Math.random() * 900000));
    // ─────────────────────────────────────────────────────────────────────────

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    // Rate limit: max 5 OTPs per email per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("email_verification_codes")
      .select("id", { count: "exact", head: true })
      .eq("email", cleanEmail)
      .gte("created_at", oneHourAgo);

    if (count && count >= 5) {
      return json({ error: "Too many attempts. Please wait an hour and try again." }, 429, cors);
    }

    // IP rate limit: max 15 OTPs per IP per hour (prevents abuse from single source)
    const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { count: ipCount } = await supabase
      .from("email_verification_codes")
      .select("id", { count: "exact", head: true })
      .eq("ip_address", clientIP)
      .gte("created_at", oneHourAgo);

    if (ipCount && ipCount >= 15) {
      return json({ error: "Too many attempts from this location. Please try again later." }, 429, cors);
    }

    // Store OTP — expires in 10 minutes
    const { error: insertError } = await supabase
      .from("email_verification_codes")
      .insert({
        email: cleanEmail,
        code,
        broker_number: broker_number || null,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        verified: false,
        ip_address: clientIP,
      });

    if (insertError) {
      console.error("OTP insert error:", insertError);
      return json({ error: "Failed to generate verification code" }, 500, cors);
    }

    // Test mode: skip real email, log to function logs only
    if (testMode) {
      console.log(`[test-mode] OTP for ${TEST_EMAIL}: ${TEST_OTP}`);
      return json({ success: true, message: "Verification code sent to your email" }, 200, cors);
    }

    // Send email via Resend
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
    let emailSent = false;

    if (RESEND_KEY) {
      const fromAddress = Deno.env.get("RESEND_FROM") || "SellingDubai <noreply@sellingdubai.com>";

      const emailHtml = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:420px;margin:0 auto;padding:40px 24px;">
          <div style="text-align:center;margin-bottom:32px;">
            <h2 style="font-size:12px;font-weight:800;letter-spacing:0.25em;text-transform:uppercase;color:#666;">SELLING DUBAI</h2>
          </div>
          <h1 style="font-size:28px;font-weight:700;color:#111;margin-bottom:8px;text-align:center;">Your verification code</h1>
          <p style="font-size:15px;color:#555;line-height:1.6;margin-bottom:24px;text-align:center;">
            Enter this code to verify your email and create your profile.
          </p>
          <div style="background:#f4f4f5;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
            <span style="font-size:36px;font-weight:800;letter-spacing:0.3em;color:#111;font-family:'SF Mono','Fira Code',monospace;">${code}</span>
          </div>
          <p style="font-size:13px;color:#999;text-align:center;margin-bottom:4px;">This code expires in 10 minutes.</p>
          <p style="font-size:13px;color:#999;text-align:center;">If you didn't request this, you can safely ignore this email.</p>
          <p style="font-size:12px;color:#ccc;margin-top:32px;text-align:center;">&copy; 2026 SellingDubai.ae</p>
        </div>
      `;

      try {
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [cleanEmail],
            subject: `${code} \u2014 Your SellingDubai verification code`,
            html: emailHtml,
          }),
        });

        if (resendRes.ok) {
          emailSent = true;
        } else {
          const resendErr = await resendRes.text();
          console.error("Resend error (non-fatal):", resendRes.status, resendErr);
        }
      } catch (emailErr) {
        console.error("Email send failed (non-fatal):", emailErr);
      }
    }

    if (!emailSent && RESEND_KEY) {
      return json({ error: "Failed to send verification email. Please try again." }, 502, cors);
    }
    return json({
      success: true,
      message: "Verification code sent to your email",
    }, 200, cors);
  } catch (err) {
    console.error("send-otp error:", err);
    return json({ error: "Internal server error" }, 500, getCorsHeaders(req));
  }
});
