import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const { token, image_base64, file_type, image_type } = await req.json();
    // image_type: 'avatar' | 'background' | 'agency_logo' | 'license'

    if (!token || !image_base64) {
      return new Response(JSON.stringify({ error: 'Token and image required' }), {
        status: 400, headers: cors
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify magic link token — column is used_at, not used
    const { data: link, error: linkErr } = await supabase
      .from('magic_links')
      .select('agent_id, used_at')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (linkErr || !link) {
      console.error('Token verification failed');
      return new Response(JSON.stringify({ error: 'Invalid or expired token. Please log in again.' }), {
        status: 401, headers: cors
      });
    }

    if (!link.used_at) {
      return new Response(JSON.stringify({ error: 'Session not activated. Please use the login link sent to your email.' }), {
        status: 401, headers: cors
      });
    }

    // Get agent slug for file naming
    const { data: agent } = await supabase
      .from('agents')
      .select('slug')
      .eq('id', link.agent_id)
      .single();

    if (!agent) {
      return new Response(JSON.stringify({ error: 'Agent not found' }), {
        status: 404, headers: cors
      });
    }

    // Decode base64 — handle both image and PDF (for license)
    const base64Data = image_base64.replace(/^data:[^;]+;base64,/, '');
    const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    // Determine file extension
    let ext = 'jpg';
    if (file_type === 'image/png') ext = 'png';
    else if (file_type === 'image/webp') ext = 'webp';
    else if (file_type === 'application/pdf') ext = 'pdf';

    const type = image_type || 'avatar';
    const fileName = `${agent.slug}/${type}-${Date.now()}.${ext}`;

    // Upload to storage
    const { data: upload, error: uploadError } = await supabase.storage
      .from('agent-images')
      .upload(fileName, bytes, {
        contentType: file_type || 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload failed');
      return new Response(JSON.stringify({ error: 'Upload failed. Please try again.' }), {
        status: 500, headers: cors
      });
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from('agent-images').getPublicUrl(fileName);
    const publicUrl = urlData.publicUrl;

    // Auto-update the agent's photo/background/logo/license field
    const fieldMap: Record<string, string> = {
      'avatar': 'photo_url',
      'background': 'background_image_url',
      'agency_logo': 'agency_logo_url',
      'license': 'license_image_url',
    };
    const field = fieldMap[type];
    if (field) {
      await supabase.from('agents').update({ [field]: publicUrl, updated_at: new Date().toISOString() }).eq('id', link.agent_id);
    }

    return new Response(JSON.stringify({ url: publicUrl, field }), {
      headers: cors
    });

  } catch (e) {
    console.error('upload-image error');
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500, headers: getCorsHeaders(req)
    });
  }
});
