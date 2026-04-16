import type { Config, Context } from "@netlify/edge-functions";

const SUPABASE_URL = 'https://pjyorgedaxevxophpfib.supabase.co';
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY') || '';
const DEFAULT_IMAGE = 'https://pjyorgedaxevxophpfib.supabase.co/storage/v1/object/public/agent-images/dubai-skyline.jpg';

// Bot user-agent patterns for SSR prerendering
const BOT_UA_PATTERNS = [
  'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider',
  'yandexbot', 'facebookexternalhit', 'facebot', 'twitterbot',
  'linkedinbot', 'whatsapp', 'telegrambot', 'discordbot',
  'applebot', 'semrushbot', 'ahrefsbot', 'mj12bot',
  'ia_archiver', 'archive.org_bot', 'petalbot',
];

function isBot(userAgent: string): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_UA_PATTERNS.some(pattern => ua.includes(pattern));
}

function escapeHtml(text: string): string {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export default async (request: Request, context: Context) => {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  let slug = '';
  if (pathParts[0] === 'a' && pathParts[1]) {
    slug = pathParts[1];
  } else if (pathParts.length === 1) {
    slug = pathParts[0];
  }

  if (!slug) {
    return context.next();
  }

  // Skip known paths that aren't agent slugs
  const reserved = ['join', 'edit', 'landing', 'dashboard', 'pricing', 'terms', 'privacy', 'favicon.ico', '_redirects'];
  if (reserved.includes(slug)) {
    return context.next();
  }

  // ─── BOT DETECTION: Proxy to Supabase prerender function ───
  const userAgent = request.headers.get('user-agent') || '';
  if (isBot(userAgent)) {
    try {
      const prerenderUrl = `${SUPABASE_URL}/functions/v1/prerender?slug=${encodeURIComponent(slug)}`;
      const botCtrl = new AbortController();
      const botTid = setTimeout(() => botCtrl.abort(), 5000);
      const prerenderRes = await fetch(prerenderUrl, {
        headers: {
          'User-Agent': userAgent,
        },
        signal: botCtrl.signal,
      });
      clearTimeout(botTid);

      if (prerenderRes.ok) {
        const html = await prerenderRes.text();
        return new Response(html, {
          status: 200,
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'public, max-age=3600, s-maxage=7200',
            'x-robots-tag': 'index, follow',
          },
        });
      }
      // If prerender returns non-200 (e.g. 404 for unknown agent),
      // pass through the response as-is
      if (prerenderRes.status === 404) {
        const html = await prerenderRes.text();
        return new Response(html, {
          status: 404,
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'x-robots-tag': 'noindex',
          },
        });
      }
    } catch {
      // Prerender failed — fall through to normal OG injection
    }
  }

  // ─── HUMAN VISITORS: OG tag injection into SPA HTML ───

  // Fetch agent from Supabase — do this BEFORE context.next() so we
  // can bail cleanly if the agent doesn't exist.
  let agent: { name: string; tagline: string; photo_url: string; slug: string; verification_status: string; whatsapp: string | null; broker_number: string | null; dld_broker_number: string | null } | null = null;

  try {
    const ogCtrl = new AbortController();
    const ogTid = setTimeout(() => ogCtrl.abort(), 3000);
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/agents?slug=eq.${encodeURIComponent(slug)}&select=name,tagline,photo_url,slug,verification_status,whatsapp,broker_number,dld_broker_number`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        signal: ogCtrl.signal,
      }
    );
    clearTimeout(ogTid);

    if (res.ok) {
      const agents = await res.json();
      if (agents && agents.length > 0 && agents[0].name) {
        agent = agents[0];
      }
    }
  } catch {
    // Supabase fetch failed or timed out — pass through without OG injection
  }

  // If no verified agent found, serve the page as-is (no OG tags)
  if (!agent) {
    return context.next();
  }

  // Now get the HTML response and inject OG tags
  try {
    const response = await context.next();
    const html = await response.text();

    const title = escapeHtml(agent.name) + ' | SellingDubai';
    const description = escapeHtml(agent.tagline || 'Dubai Real Estate Agent');

    // Validate image URL — prevents stored XSS via photo_url
    let rawImage = DEFAULT_IMAGE;
    if (agent.photo_url) {
      try {
        const parsedUrl = new URL(agent.photo_url);
        if (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:') {
          rawImage = agent.photo_url;
        }
      } catch {
        // Invalid URL — fall back to default
      }
    }
    const image = escapeHtml(rawImage);
    const profileUrl = `${url.origin}/a/${encodeURIComponent(agent.slug)}`;

    let modified = html.replace(
      /<title>[^<]*<\/title>/,
      `<title>${title}</title>`
    );

    // Use Netlify Image CDN for OG image (absolute URL required for social cards)
    const ogImage = rawImage.startsWith('https://pjyorgedaxevxophpfib.supabase.co/')
      ? `${url.origin}/.netlify/images?url=${encodeURIComponent(rawImage)}&w=1200&fm=webp&q=80`
      : image;

    const jsonLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "RealEstateAgent",
      "name": agent.name,
      "description": agent.tagline || "Dubai Real Estate Agent",
      "url": profileUrl,
      "image": rawImage,
      "sameAs": [],
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "Dubai",
        "addressCountry": "AE"
      }
    });

    const ogBlock = `
    <link rel="canonical" href="${profileUrl}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:url" content="${profileUrl}" />
    <meta property="og:type" content="profile" />
    <meta property="og:site_name" content="SellingDubai" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${ogImage}" />
    <meta name="description" content="${description}" />
    <script type="application/ld+json">${jsonLd}</script>
    `;

    modified = modified.replace(/<\/head>/i, `${ogBlock}</head>`);

    // ─── SSR: Inject above-fold content for instant first paint ───
    // This HTML renders immediately; JS hydrates over it when ready.
    // The #ssr-hero div is hidden by init.ts once the full page renders.
    const isVerified = agent.verification_status === 'verified';
    const initials = escapeHtml((agent.name || '').split(' ').map(n => (n?.[0] ?? '')).join('').slice(0, 2));
    const photoHtml = agent.photo_url
      ? `<img src="${url.origin}/.netlify/images?url=${encodeURIComponent(agent.photo_url)}&w=200&fm=webp&q=80" width="96" height="96" alt="${escapeHtml(agent.name)}" style="width:96px;height:96px;border-radius:50%;object-fit:cover;border:2.5px solid ${isVerified ? 'rgba(77,101,255,0.5)' : 'rgba(255,255,255,0.2)'};box-shadow:0 12px 40px rgba(0,0,0,0.4);">`
      : `<div style="width:96px;height:96px;border-radius:50%;border:2.5px solid rgba(255,255,255,0.2);background:linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.04));display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:700;font-family:'Manrope',sans-serif;box-shadow:0 12px 40px rgba(0,0,0,0.4);">${initials}</div>`;
    const verifiedSvg = isVerified ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="#4d65ff"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>` : '';
    const waNum = (agent.whatsapp || '').replace(/[^0-9]/g, '');
    const firstName = (agent.name || '').split(' ')[0] || '';
    const waHtml = waNum
      ? `<a href="https://wa.me/${waNum}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;justify-content:center;gap:10px;width:100%;max-width:340px;padding:17px 24px;background:#25d366;color:#fff;border-radius:14px;font-size:15px;font-weight:600;text-decoration:none;font-family:'Inter',sans-serif;box-shadow:0 1px 2px rgba(0,0,0,0.2);"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg> WhatsApp ${escapeHtml(firstName)}</a>`
      : '';

    const ssrHero = `<div id="ssr-hero" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:70vh;padding:40px 24px;text-align:center;animation:fadeUp 0.4s ease both;">
      <div style="margin-bottom:20px;">${photoHtml}</div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
        <h1 style="font-family:'Manrope',sans-serif;font-size:26px;font-weight:800;letter-spacing:-0.6px;color:#fff;margin:0;">${escapeHtml(agent.name)}</h1>
        ${verifiedSvg}
      </div>
      ${agent.tagline ? `<p style="font-size:14px;color:rgba(255,255,255,0.55);margin-bottom:24px;max-width:300px;">${escapeHtml(agent.tagline)}</p>` : '<div style="margin-bottom:24px;"></div>'}
      ${waHtml}
    </div>`;

    modified = modified.replace(
      /(<div id="loading")/,
      `${ssrHero}$1`
    );

    // CRITICAL: Strip Content-Encoding and Content-Length.
    // response.text() decompresses the body (gzip/br → plain text).
    // If we pass the original Content-Encoding header, the browser will
    // try to decompress already-plain text → blank/white page.
    const headers = new Headers(response.headers);
    headers.delete('content-encoding');
    headers.delete('content-length');

    return new Response(modified, {
      status: response.status,
      headers,
    });
  } catch {
    // If HTML modification fails, context.next() was already consumed —
    // serve a minimal redirect to let the browser re-fetch cleanly.
    return new Response(
      `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${url.pathname}?_bypass=1"></head><body></body></html>`,
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }
    );
  }
};

// Config is declared in netlify.toml — path: /a/* only
// No catch-all needed; _redirects handles all other routing
