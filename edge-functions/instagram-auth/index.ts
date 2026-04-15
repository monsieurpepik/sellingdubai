import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/utils.ts";
import { createLogger } from '../_shared/logger.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const IG_APP_ID = Deno.env.get('INSTAGRAM_APP_ID') || '';
const IG_APP_SECRET = Deno.env.get('INSTAGRAM_APP_SECRET')!;
const REDIRECT_URI = 'https://agents.sellingdubai.ae/edit?ig_callback=1';
const IG_GRAPH_VERSION = 'v22.0';

// HMAC-SHA256 helper — used to sign/verify CSRF state without server-side storage
async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// deno-lint-ignore no-explicit-any
type CreateClientFn = (url: string, key: string) => any;

export async function handler(req: Request, _createClient: CreateClientFn = createClient): Promise<Response> {
  const log = createLogger('instagram-auth', req);
  const _start = Date.now();
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, code, token, state } = await req.json();
    const supabase = _createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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
      // Require token so we can bind state to this agent (prevents CSRF / auth-code injection)
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

      // CSRF state = nonce.HMAC(IG_APP_SECRET, agent_id.nonce)
      // Stateless — no DB storage needed; verified by recomputing in exchange_code.
      // Binds this OAuth flow to the authenticated agent so another party cannot
      // complete the code exchange even if they intercept the redirect.
      const nonceBytes = new Uint8Array(16);
      crypto.getRandomValues(nonceBytes);
      const nonce = Array.from(nonceBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const mac = await hmacHex(IG_APP_SECRET, `${agent_id}.${nonce}`);
      const csrfState = `${nonce}.${mac}`;

      const scopes = 'instagram_business_basic';
      const authUrl = `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&client_id=${IG_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scopes}&state=${encodeURIComponent(csrfState)}`;
      log({ event: 'success', status: 200, action: 'get_auth_url' });
      return new Response(JSON.stringify({ url: authUrl, state: csrfState }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === ACTION: exchange_code ===
    if (action === 'exchange_code') {
      if (!code || !token || !state) {
        return new Response(JSON.stringify({ error: 'Missing code, token, or state' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const agent_id = await getAgentIdFromToken(token);
      if (!agent_id) {
        return new Response(JSON.stringify({ error: 'Invalid or expired session.' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify CSRF state — prevents OAuth authorization-code injection attacks.
      // state = nonce.HMAC(IG_APP_SECRET, agent_id.nonce), generated in get_auth_url.
      const dotIdx = (state as string).indexOf('.');
      if (dotIdx < 0) {
        return new Response(JSON.stringify({ error: 'Invalid state parameter.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const nonce = (state as string).slice(0, dotIdx);
      const providedMac = (state as string).slice(dotIdx + 1);
      const expectedMac = await hmacHex(IG_APP_SECRET, `${agent_id}.${nonce}`);
      // Constant-time comparison to prevent timing attacks
      if (providedMac.length !== expectedMac.length) {
        return new Response(JSON.stringify({ error: 'State verification failed.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      let macDiff = 0;
      for (let i = 0; i < providedMac.length; i++) {
        macDiff |= providedMac.charCodeAt(i) ^ expectedMac.charCodeAt(i);
      }
      if (macDiff !== 0) {
        return new Response(JSON.stringify({ error: 'State verification failed.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        console.error('Vault store error');
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
        console.error('Agent update error');
      }

      log({ event: 'success', status: 200, agent_id: agent_id, action: 'exchange_code' });
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

      log({ event: 'success', status: 200, agent_id: agent_id, action: 'disconnect' });
      return new Response(JSON.stringify({ success: !updateError }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    log({ event: 'bad_request', status: 400 });
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
}

Deno.serve((req) => handler(req));
