import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const IG_APP_ID = Deno.env.get('INSTAGRAM_APP_ID') || '';
const IG_APP_SECRET = Deno.env.get('INSTAGRAM_APP_SECRET') || '';
const REDIRECT_URI = 'https://agents.sellingdubai.ae/edit?ig_callback=1';
const IG_GRAPH_VERSION = 'v22.0';

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
    const { action, code, token } = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Helper: validate magic link token and return authenticated agent_id
    async function getAgentIdFromToken(t: string): Promise<string | null> {
      if (!t || typeof t !== 'string') return null;
      const { data: link } = await supabase
        .from('magic_links')
        .select('agent_id, expires_at, used_at')
        .eq('token', t)
        .single();
      if (!link) return null;
      if (new Date(link.expires_at) < new Date()) return null;
      if (!link.used_at) return null; // not yet activated
      return link.agent_id;
    }

    // === ACTION: get_auth_url ===
    if (action === 'get_auth_url') {
      const csrfBytes = new Uint8Array(16);
      crypto.getRandomValues(csrfBytes);
      const csrfState = Array.from(csrfBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const scopes = 'instagram_business_basic';
      const authUrl = `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&client_id=${IG_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scopes}&state=${csrfState}`;
      return new Response(JSON.stringify({ url: authUrl, state: csrfState }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === ACTION: exchange_code ===
    if (action === 'exchange_code') {
      if (!code || !token) {
        return new Response(JSON.stringify({ error: 'Missing code or token' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const agent_id = await getAgentIdFromToken(token);
      if (!agent_id) {
        return new Response(JSON.stringify({ error: 'Invalid or expired session.' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Step 1: Exchange code for short-lived token
      const tokenForm = new URLSearchParams();
      tokenForm.append('client_id', IG_APP_ID);
      tokenForm.append('client_secret', IG_APP_SECRET);
      tokenForm.append('grant_type', 'authorization_code');
      tokenForm.append('redirect_uri', REDIRECT_URI);
      tokenForm.append('code', code);

      const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
        method: 'POST', body: tokenForm,
      });
      const tokenData = await tokenRes.json();

      if (tokenData.error_type || tokenData.error_message) {
        return new Response(JSON.stringify({ error: tokenData.error_message || 'Token exchange failed' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const shortToken = tokenData.access_token;
      const userId = String(tokenData.user_id);

      // Step 2: Exchange for long-lived token (60 days)
      const longRes = await fetch(
        `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${IG_APP_SECRET}&access_token=${shortToken}`
      );
      const longData = await longRes.json();
      const longToken = longData.access_token || shortToken;

      // Step 3: Get Instagram username
      const profileRes = await fetch(
        `https://graph.instagram.com/${IG_GRAPH_VERSION}/me?fields=username,account_type,media_count&access_token=${longToken}`
      );
      const profile = await profileRes.json();

      // Step 4: Store token in Vault (encrypted) instead of plaintext
      const { error: vaultError } = await supabase.rpc('store_social_token', {
        p_agent_id: agent_id,
        p_provider: 'instagram',
        p_token: longToken,
      });

      if (vaultError) {
        console.error('Vault store error:', vaultError);
        return new Response(JSON.stringify({ error: 'Failed to save token securely' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Step 5: Update non-secret fields
      const { error: updateError } = await supabase
        .from('agents')
        .update({
          instagram_user_id: userId,
          instagram_connected_at: new Date().toISOString(),
          instagram_url: profile.username ? `https://instagram.com/${profile.username}` : undefined,
        })
        .eq('id', agent_id);

      if (updateError) {
        console.error('Agent update error:', updateError);
      }

      return new Response(JSON.stringify({
        success: true,
        username: profile.username,
        media_count: profile.media_count,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === ACTION: disconnect ===
    if (action === 'disconnect') {
      if (!token) {
        return new Response(JSON.stringify({ error: 'Missing token' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const agent_id = await getAgentIdFromToken(token);
      if (!agent_id) {
        return new Response(JSON.stringify({ error: 'Invalid or expired session.' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Delete vault secret via parameterized RPC (no SQL injection)
      await supabase.rpc('delete_social_token', {
        p_agent_id: agent_id,
        p_provider: 'instagram',
      }).catch(() => {}); // Ignore if secret doesn't exist

      // Clear agent fields
      const { error: updateError } = await supabase
        .from('agents')
        .update({
          instagram_access_token: null,
          instagram_user_id: null,
          instagram_connected_at: null,
        })
        .eq('id', agent_id);

      return new Response(JSON.stringify({ success: !updateError }), {
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
