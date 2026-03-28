import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TT_CLIENT_KEY = Deno.env.get('TIKTOK_CLIENT_KEY') || '';
const TT_CLIENT_SECRET = Deno.env.get('TIKTOK_CLIENT_SECRET') || '';
const REDIRECT_URI = 'https://agents.sellingdubai.ae/edit?tt_callback=1';

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
    "Content-Type": "application/json",
  };
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, code, agent_id, state } = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    if (action === 'get_auth_url') {
      const csrfBytes = new Uint8Array(16);
      crypto.getRandomValues(csrfBytes);
      const csrfState = Array.from(csrfBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${TT_CLIENT_KEY}&scope=user.info.basic&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${csrfState}`;
      return new Response(JSON.stringify({ url: authUrl, state: csrfState }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'exchange_code') {
      if (!code || !agent_id) {
        return new Response(JSON.stringify({ error: 'Missing code or agent_id' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: TT_CLIENT_KEY,
          client_secret: TT_CLIENT_SECRET,
          code, grant_type: 'authorization_code',
          redirect_uri: REDIRECT_URI,
        }),
      });
      const tokenData = await tokenRes.json();

      if (tokenData.error || !tokenData.access_token) {
        return new Response(JSON.stringify({ error: tokenData.error_description || 'Token exchange failed' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const userRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=display_name,username,avatar_url', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
      });
      const userData = await userRes.json();
      const userInfo = userData?.data?.user || {};

      // Store token in Vault (encrypted) instead of plaintext
      const { error: vaultError } = await supabase.rpc('store_social_token', {
        p_agent_id: agent_id,
        p_provider: 'tiktok',
        p_token: tokenData.access_token,
      });

      if (vaultError) {
        console.error('Vault store error:', vaultError);
        return new Response(JSON.stringify({ error: 'Failed to save token securely' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Update non-secret fields
      const updates: Record<string, any> = {
        tiktok_user_id: tokenData.open_id || '',
        tiktok_connected_at: new Date().toISOString(),
      };
      if (userInfo.username) updates.tiktok_url = `https://tiktok.com/@${userInfo.username}`;

      await supabase.from('agents').update(updates).eq('id', agent_id);

      return new Response(JSON.stringify({
        success: true,
        username: userInfo.username || userInfo.display_name,
        url: userInfo.username ? `https://tiktok.com/@${userInfo.username}` : null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'disconnect') {
      if (!agent_id) {
        return new Response(JSON.stringify({ error: 'Missing agent_id' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Delete vault secret
      const secretName = `agent_${agent_id}_tiktok_token`;
      await supabase.rpc('sql', {
        query: `SELECT vault.delete_secret((SELECT id FROM vault.secrets WHERE name = '${secretName}'))`,
      }).catch(() => {}); // Ignore if secret doesn't exist

      // Clear agent fields
      await supabase.from('agents').update({
        tiktok_access_token: null, tiktok_user_id: null, tiktok_connected_at: null,
      }).eq('id', agent_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
