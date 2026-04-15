import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createLogger } from '../_shared/logger.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL = 'https://sellingdubai.ae';
const DEFAULT_IMAGE = `https://sellingdubai.ae/.netlify/images?url=${encodeURIComponent(SUPABASE_URL + '/storage/v1/object/public/agent-images/dubai-skyline.jpg')}&w=1200&fm=webp&q=80`;

// deno-lint-ignore no-explicit-any
type CreateClientFn = (url: string, key: string) => any;

function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export async function handler(req: Request, _createClient: CreateClientFn = createClient): Promise<Response> {
  const supabase = _createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const log = createLogger('prerender', req);
  const _start = Date.now();
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get('slug');
    if (!slug) {
      log({ event: 'bad_request', status: 400 });
      return new Response('Missing slug parameter', { status: 400, headers: corsHeaders });
    }

    // Fetch agent
    const { data: agent, error: agentErr } = await supabase
      .from('agents')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();

    if (agentErr || !agent) {
      log({ event: 'bad_request', status: 404 });
      return new Response(renderNotFound(slug), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // Fetch properties
    const { data: properties } = await supabase
      .from('properties')
      .select('id,title,image_url,price,location,property_type,bedrooms,bathrooms,area_sqft,features,description,listing_type,status')
      .eq('agent_id', agent.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .limit(50);

    const html = renderAgentPage(agent, properties || []);

    log({ event: 'success', agent_id: agent.id, status: 200 });
    return new Response(html, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=7200',
      }
    });
  } catch (e) {
    log({ event: 'error', status: 500, error: String(e) });
    return new Response('Internal server error', { status: 500, headers: corsHeaders });
  } finally {
    log.flush(Date.now() - _start);
  }
}

Deno.serve((req) => handler(req));

function renderAgentPage(agent: any, properties: any[]): string {
  // Keep raw values — only escape at the point of insertion
  const rawName = agent.name || '';
  const rawTagline = agent.tagline || '';
  const rawBio = agent.bio || '';
  const photo = agent.photo_url || DEFAULT_IMAGE;
  const slug = agent.slug || '';
  const pageUrl = `${SITE_URL}/a/${slug}`;

  const propCount = properties.length;
  const offPlan = properties.filter((p: any) => p.listing_type === 'off_plan' || p.listing_type === 'new_launch');
  const standard = properties.filter((p: any) => !p.listing_type || p.listing_type === 'standard');

  // Schema.org structured data (JSON — no HTML escaping needed, JSON.stringify handles it)
  const schemaAgent = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    'name': rawName,
    'url': pageUrl,
    'image': photo,
    'description': rawTagline || rawBio || 'Dubai Real Estate Agent',
    'address': {
      '@type': 'PostalAddress',
      'addressLocality': 'Dubai',
      'addressCountry': 'AE'
    },
    'areaServed': 'Dubai, UAE',
    ...(agent.agency_name ? { 'worksFor': { '@type': 'Organization', 'name': agent.agency_name } } : {})
  };

  const schemaProperties = standard.slice(0, 20).map((p: any) => ({
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    'name': p.title,
    'url': pageUrl,
    'image': p.image_url || '',
    'description': p.description || `${p.title} in Dubai`,
    'offers': p.price ? {
      '@type': 'Offer',
      'price': String(p.price).replace(/[^0-9.]/g, ''),
      'priceCurrency': 'AED'
    } : undefined,
    'address': {
      '@type': 'PostalAddress',
      'addressLocality': p.location || 'Dubai',
      'addressCountry': 'AE'
    }
  }));

  const propertyListHtml = standard.map((p: any) => {
    const specs = [
      p.bedrooms ? `${p.bedrooms} Bed${p.bedrooms > 1 ? 's' : ''}` : '',
      p.bathrooms ? `${p.bathrooms} Bath${p.bathrooms > 1 ? 's' : ''}` : '',
      p.area_sqft ? `${p.area_sqft.toLocaleString()} sqft` : '',
      p.property_type || ''
    ].filter(Boolean).join(' \u00b7 ');

    const features = (p.features || []).slice(0, 6).map((f: string) => `<span>${escHtml(f)}</span>`).join(' ');
    const desc = p.description ? `<p>${escHtml(p.description.substring(0, 200))}${p.description.length > 200 ? '...' : ''}</p>` : '';

    return `
    <article itemscope itemtype="https://schema.org/RealEstateListing">
      ${p.image_url ? `<img itemprop="image" src="${escHtml(p.image_url)}" alt="${escHtml(p.title || '')}" width="400" height="300" loading="lazy" style="max-width:400px;aspect-ratio:4/3;object-fit:cover;">` : ''}
      <div>
        <h3 itemprop="name">${escHtml(p.title || 'Property')}</h3>
        ${p.location ? `<p itemprop="address">${escHtml(p.location)}, Dubai</p>` : ''}
        ${p.price ? `<p><strong itemprop="offers" itemscope itemtype="https://schema.org/Offer"><span itemprop="priceCurrency">AED</span> <span itemprop="price">${escHtml(String(p.price).replace(/AED\s*/i, ''))}</span></strong></p>` : ''}
        <p>${escHtml(specs)}</p>
        ${features ? `<p>${features}</p>` : ''}
        ${desc}
      </div>
    </article>`;
  }).join('\n');

  const offPlanHtml = offPlan.map((p: any) => `
    <article>
      ${p.image_url ? `<img src="${escHtml(p.image_url)}" alt="${escHtml(p.title || '')}" width="400" height="250" loading="lazy">` : ''}
      <h3>${escHtml(p.title || 'Off Plan Project')}</h3>
      ${p.location ? `<p>${escHtml(p.location)}, Dubai</p>` : ''}
      ${p.price ? `<p><strong>Starting from ${escHtml(String(p.price))}</strong></p>` : ''}
    </article>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(rawName)} \u2014 Dubai Real Estate Agent | SellingDubai</title>
  <meta name="description" content="${escHtml(rawName)} \u2014 ${escHtml(rawTagline || 'Verified Dubai real estate agent')}. Browse ${propCount} properties, off-plan projects, and connect directly.">
  <link rel="canonical" href="${escHtml(pageUrl)}">
  <meta property="og:type" content="profile">
  <meta property="og:title" content="${escHtml(rawName)} \u2014 Dubai Real Estate Agent | SellingDubai">
  <meta property="og:description" content="${escHtml(rawTagline || 'Verified Dubai real estate agent')}">
  <meta property="og:image" content="${escHtml(photo)}">
  <meta property="og:url" content="${escHtml(pageUrl)}">
  <meta property="og:site_name" content="SellingDubai">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escHtml(rawName)} \u2014 Dubai Real Estate Agent">
  <meta name="twitter:description" content="${escHtml(rawTagline || 'Verified Dubai real estate agent')}">
  <meta name="twitter:image" content="${escHtml(photo)}">
  <script type="application/ld+json">${JSON.stringify(schemaAgent)}</script>
  ${schemaProperties.map((s: any) => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join('\n  ')}
  <style>body{font-family:system-ui,sans-serif;background:#000;color:#fff;margin:0;padding:24px;max-width:960px;margin:0 auto;}img{border-radius:12px;display:block;margin-bottom:12px;}article{margin-bottom:32px;padding-bottom:24px;border-bottom:1px solid rgba(255,255,255,0.1);}h1{font-size:28px;}h2{font-size:22px;margin-top:40px;}h3{font-size:18px;margin:8px 0 4px;}p{color:rgba(255,255,255,0.7);line-height:1.6;margin:4px 0;}a{color:#4d65ff;}.avatar{width:96px;height:96px;border-radius:50%;object-fit:cover;margin-bottom:16px;}</style>
</head>
<body>
  <header>
    <a href="${SITE_URL}">SellingDubai</a>
  </header>
  <main itemscope itemtype="https://schema.org/RealEstateAgent">
    <img class="avatar" itemprop="image" src="${escHtml(photo)}" alt="${escHtml(rawName)}" width="96" height="96">
    <h1 itemprop="name">${escHtml(rawName)}</h1>
    ${rawTagline ? `<p itemprop="description">${escHtml(rawTagline)}</p>` : ''}
    ${rawBio ? `<p>${escHtml(rawBio)}</p>` : ''}
    ${agent.agency_name ? `<p>Agency: <span itemprop="worksFor">${escHtml(agent.agency_name)}</span></p>` : ''}
    ${agent.dld_license ? `<p>DLD License: ${escHtml(agent.dld_license)}</p>` : ''}

    ${offPlan.length > 0 ? `<h2>Off Plan &amp; New Launches (${offPlan.length})</h2>${offPlanHtml}` : ''}

    ${standard.length > 0 ? `<h2>Properties (${standard.length})</h2>${propertyListHtml}` : ''}

    ${propCount === 0 ? '<p>Portfolio coming soon \u2014 check back shortly.</p>' : ''}

    <h2>Contact ${escHtml(rawName)}</h2>
    <p>Get in touch with ${escHtml(rawName)} about properties in Dubai.</p>
    ${agent.whatsapp ? `<p><a href="https://wa.me/${String(agent.whatsapp).replace(/[^0-9]/g, '')}" rel="nofollow">WhatsApp ${escHtml(rawName)}</a></p>` : ''}
  </main>
  <footer>
    <p><a href="${SITE_URL}">SellingDubai</a> \u2014 PropTeFi Tech Limited, DIFC, Dubai</p>
  </footer>
  <script>window.location.href=${JSON.stringify(pageUrl)};</script>
</body>
</html>`;
}

function renderNotFound(slug: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Agent Not Found \u2014 SellingDubai</title>
  <meta name="robots" content="noindex">
</head>
<body style="font-family:system-ui;background:#000;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="text-align:center;">
    <h1>Agent Not Found</h1>
    <p>The profile "${escHtml(slug)}" doesn't exist.</p>
    <a href="${SITE_URL}" style="color:#4d65ff;">Browse All Agents</a>
  </div>
</body>
</html>`;
}
