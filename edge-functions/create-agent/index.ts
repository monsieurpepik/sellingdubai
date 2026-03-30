import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeUrl(val: string | undefined | null): string | null {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
    return null;
  }
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
    return 'https://' + trimmed;
  }
  return trimmed;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      broker_number, display_name, whatsapp, email, otp_code,
      tagline, calendly_url, instagram_url, youtube_url,
      tiktok_url, linkedin_url, photo_base64,
      manual_verification, rera_image_base64, rera_file_type,
    } = body;

    if (!display_name || !email || !whatsapp) {
      return json({ error: "Name, email, and WhatsApp are required." }, 400);
    }
    if (!otp_code) {
      return json({ error: "Verification code is required." }, 400);
    }

    const cleanEmail = email.toLowerCase().trim();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: otpRecord, error: otpError } = await supabase
      .from("email_verification_codes")
      .select("*")
      .eq("email", cleanEmail)
      .eq("code", otp_code)
      .eq("verified", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (otpError || !otpRecord) {
      return json({ error: "Invalid or expired verification code. Please request a new one." }, 400);
    }

    await supabase
      .from("email_verification_codes")
      .update({ verified: true })
      .eq("id", otpRecord.id);

    const { data: existingByEmail } = await supabase
      .from("agents")
      .select("id, slug")
      .eq("email", cleanEmail)
      .limit(1);

    if (existingByEmail && existingByEmail.length > 0) {
      return json({
        error: "An agent with this email already exists.",
        slug: existingByEmail[0].slug,
      }, 409);
    }

    if (broker_number) {
      const { data: existingByBrn } = await supabase
        .from("agents")
        .select("id, slug")
        .eq("broker_number", broker_number)
        .limit(1);

      if (existingByBrn && existingByBrn.length > 0) {
        return json({
          error: "This broker number is already registered.",
          slug: existingByBrn[0].slug,
        }, 409);
      }
    }

    let dldBrokerId: string | null = null;
    let isAutoVerified = false;

    if (broker_number) {
      const { data: dldBroker } = await supabase
        .from("dld_brokers")
        .select("id, broker_name_en, real_estate_number, license_end_date")
        .eq("broker_number", broker_number)
        .single();

      if (dldBroker) {
        dldBrokerId = dldBroker.id;
        const licenseEnd = dldBroker.license_end_date
          ? new Date(dldBroker.license_end_date)
          : null;
        const isLicenseValid = licenseEnd ? licenseEnd > new Date() : false;

        if (isLicenseValid && !manual_verification) {
          isAutoVerified = true;
        }
      }
    }

    let slug = slugify(display_name);
    const { data: slugCheck } = await supabase
      .from("agents")
      .select("id")
      .eq("slug", slug)
      .limit(1);

    if (slugCheck && slugCheck.length > 0) {
      slug = slug + "-" + Math.floor(Math.random() * 9000 + 1000);
    }

    const referralCode = slug;

    const agentData: Record<string, unknown> = {
      name: display_name,
      slug,
      email: cleanEmail,
      whatsapp,
      tagline: tagline || null,
      calendly_url: sanitizeUrl(calendly_url),
      instagram_url: sanitizeUrl(instagram_url),
      youtube_url: sanitizeUrl(youtube_url),
      tiktok_url: sanitizeUrl(tiktok_url),
      linkedin_url: sanitizeUrl(linkedin_url),
      broker_number: broker_number || null,
      dld_broker_number: broker_number ? String(broker_number) : null,
      dld_broker_id: dldBrokerId,
      referral_code: referralCode,
      email_verified: true,
      is_active: true,
      tier: "free",
    };

    if (isAutoVerified) {
      agentData.verification_status = "verified";
      agentData.license_verified = true;
      agentData.dld_verified = true;
      agentData.verified_at = new Date().toISOString();
    } else {
      agentData.verification_status = "pending";
      agentData.license_verified = false;
      agentData.dld_verified = false;
    }

    const { data: agent, error: insertError } = await supabase
      .from("agents")
      .insert([agentData])
      .select()
      .single();

    if (insertError || !agent) {
      console.error("Agent insert error:", insertError);
      return json({ error: "Failed to create agent. " + (insertError?.message || "") }, 500);
    }

    if (photo_base64) {
      try {
        const binaryStr = atob(photo_base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const photoPath = `agents/${agent.id}/photo.jpg`;

        const { error: uploadErr } = await supabase.storage
          .from("agent-images")
          .upload(photoPath, bytes.buffer, {
            contentType: "image/jpeg",
            upsert: true,
          });

        if (!uploadErr) {
          const { data: urlData } = supabase.storage
            .from("agent-images")
            .getPublicUrl(photoPath);

          await supabase
            .from("agents")
            .update({ photo_url: urlData.publicUrl })
            .eq("id", agent.id);

          agent.photo_url = urlData.publicUrl;
        } else {
          console.error("Photo upload error:", uploadErr);
        }
      } catch (photoErr) {
        console.error("Photo processing error:", photoErr);
      }
    }

    if (manual_verification && rera_image_base64) {
      try {
        const binaryStr = atob(rera_image_base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const ext = rera_file_type === "application/pdf" ? "pdf" : "jpg";
        const contentType = rera_file_type || "image/jpeg";
        const reraPath = `agents/${agent.id}/rera-card.${ext}`;

        const { error: reraErr } = await supabase.storage
          .from("agent-images")
          .upload(reraPath, bytes.buffer, {
            contentType,
            upsert: true,
          });

        if (!reraErr) {
          const { data: urlData } = supabase.storage
            .from("agent-images")
            .getPublicUrl(reraPath);

          await supabase
            .from("agents")
            .update({ license_image_url: urlData.publicUrl })
            .eq("id", agent.id);
        } else {
          console.error("RERA upload error:", reraErr);
        }
      } catch (reraErr) {
        console.error("RERA processing error:", reraErr);
      }
    }

    const editToken = crypto.randomUUID();
    const { error: tokenError } = await supabase
      .from("magic_links")
      .insert({
        agent_id: agent.id,
        token: editToken,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });

    if (tokenError) {
      console.error("Magic link token error:", tokenError);
    }

    const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
    if (RESEND_KEY) {
      try {
        const profileUrl = `https://sellingdubai.ae/a/${slug}`;
        const subject = isAutoVerified
          ? `You're live on SellingDubai!`
          : `We're reviewing your profile \u2014 SellingDubai`;

        const bodyHtml = isAutoVerified
          ? `
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;">
              <div style="text-align:center;margin-bottom:32px;">
                <h2 style="font-size:12px;font-weight:800;letter-spacing:0.25em;text-transform:uppercase;color:#666;">SELLING DUBAI</h2>
              </div>
              <h1 style="font-size:24px;font-weight:700;color:#111;margin-bottom:8px;">You're live, ${display_name}!</h1>
              <p style="font-size:16px;color:#555;line-height:1.6;margin-bottom:24px;">Your verified profile is now live. Share your link and start getting leads.</p>
              <div style="text-align:center;margin-bottom:24px;">
                <a href="${profileUrl}" style="display:inline-block;background:#111;color:#fff;padding:16px 40px;border-radius:12px;font-size:16px;font-weight:700;text-decoration:none;">View My Profile</a>
              </div>
              <div style="background:#f8f8f8;border-radius:8px;padding:16px;margin-bottom:24px;">
                <p style="font-size:14px;color:#333;font-weight:600;margin-bottom:8px;">Your profile link:</p>
                <p style="font-size:14px;color:#1127d2;word-break:break-all;">${profileUrl}</p>
              </div>
              <p style="font-size:14px;color:#555;line-height:1.6;">Add it to your Instagram bio, WhatsApp status, and business card.</p>
              <p style="font-size:12px;color:#ccc;margin-top:32px;text-align:center;">&copy; 2026 SellingDubai.ae</p>
            </div>
          `
          : `
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;">
              <div style="text-align:center;margin-bottom:32px;">
                <h2 style="font-size:12px;font-weight:800;letter-spacing:0.25em;text-transform:uppercase;color:#666;">SELLING DUBAI</h2>
              </div>
              <h1 style="font-size:24px;font-weight:700;color:#111;margin-bottom:8px;">Thanks for signing up, ${display_name}!</h1>
              <p style="font-size:16px;color:#555;line-height:1.6;margin-bottom:24px;">We've received your profile and RERA card. Our team is reviewing it now \u2014 this usually takes less than 24 hours.</p>
              <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin-bottom:24px;">
                <p style="font-size:14px;color:#92400e;font-weight:600;">Verification in progress</p>
                <p style="font-size:13px;color:#a16207;margin-top:4px;">We'll email you when your profile is verified and live.</p>
              </div>
              <div style="text-align:center;margin-bottom:24px;">
                <a href="https://sellingdubai.ae/edit?token=${editToken}" style="display:inline-block;background:#111;color:#fff;padding:16px 40px;border-radius:12px;font-size:16px;font-weight:700;text-decoration:none;">Edit My Profile</a>
              </div>
              <p style="font-size:12px;color:#ccc;margin-top:32px;text-align:center;">&copy; 2026 SellingDubai.ae</p>
            </div>
          `;

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: Deno.env.get("RESEND_FROM") || "SellingDubai <noreply@sellingdubai.com>",
            to: [cleanEmail],
            subject,
            html: bodyHtml,
          }),
        }).catch((e) => console.error("Welcome email failed:", e));
      } catch (emailErr) {
        console.error("Welcome email error:", emailErr);
      }
    }

    return json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        slug: agent.slug,
        email: agent.email,
        photo_url: agent.photo_url || null,
        verification_status: agent.verification_status,
      },
      edit_token: editToken,
    }, 201);

  } catch (err) {
    console.error("create-agent error:", err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
