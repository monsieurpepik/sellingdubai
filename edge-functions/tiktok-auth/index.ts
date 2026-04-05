import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/utils.ts";
import { createLogger } from "../_shared/logger.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TT_CLIENT_KEY = Deno.env.get('TIKTOK_CLIENT_KEY') || '';
const TT_CLIENT_SECRET = Deno.env.get('TIKTOK_CLIENT_SECRET')!;
const REDIRECT_URI = 'https://agents.sellingdubai.ae/edit?tt_callback=1';

Deno.serve(async (req: Request) => {
  const log = createLogger('tiktok-auth', req);
  const _start = Date.now();
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, code, token, state } = await req.json();
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

    if (action === 'get_auth_url') {
      const csrfBytes = new Uint8Array(16);
      crypto.getRandomValues(csrfBytes);
      const csrfState = Array.from(csrfBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${TT_CLIENT_KEY}&scope=user.info.basic&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${csrfState}`;
      log({ event: 'success', status: 200, action: 'get_auth_url' });
      return new Response(JSON.stringify({ url: authUrl, state: csrfState }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'exchange_code') {
      if (!code || !token) {
        log({ event: 'bad_request', status: 400, action: 'exchange_code' });
        return new Response(JSON.stringify({ error: 'Missing code or token' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const agent_id = await getAgentIdFromToken(token);
      if (!agent_id) {
        log({ event: 'auth_failed', status: 401, action: 'exchange_code' });
        return new Response(JSON.stringify({ error: 'Invalid or expired session.' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        log({ event: 'error', status: 400, agent_id: agent_id, error: tokenData.error_description || 'Token exchange failed' });
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
        log({ event: 'error', status: 500, agent_id: agent_id, error: String(vaultError) });
        console.error('Vault store error');
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

      log({ event: 'success', status: 200, agent_id: agent_id, action: 'exchange_code' });
      return new Response(JSON.stringify({
        success: true,
        username: userInfo.username || userInfo.display_name,
        url: userInfo.username ? `https://tiktok.com/@${userInfo.username}` : null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'disconnect') {
      if (!token) {
        log({ event: 'bad_request', status: 400, action: 'disconnect' });
        return new Response(JSON.stringify({ error: 'Missing token' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const agent_id = await getAgentIdFromToken(token);
      if (!agent_id) {
        log({ event: 'auth_failed', status: 401, action: 'disconnect' });
        return new Response(JSON.stringify({ error: 'Invalid or expired session.' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Delete vault secret via parameterized RPC (no SQL injection)
      await supabase.rpc('delete_social_token', {
        p_agent_id: agent_id,
        p_provider: 'tiktok',
      }).catch(() => {}); // Ignore if secret doesn't exist

      // Clear agent fields
      await supabase.from('agents').update({
        tiktok_access_token: null, tiktok_user_id: null, tiktok_connected_at: null,
      }).eq('id', agent_id);

      log({ event: 'success', status: 200, agent_id: agent_id, action: 'disconnect' });
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    log({ event: 'bad_request', status: 400, action: 'unknown' });
    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    log({ event: 'error', status: 500, error: String(err) });
    return new Response(JSON.stringify({ error: 'Authentication failed. Please try again.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } finally {
    log.flush(Date.now() - _start);
  }
});
