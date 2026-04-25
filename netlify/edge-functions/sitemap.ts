import type { Config, Context } from "@netlify/edge-functions";

const SUPABASE_URL = Netlify.env.get('SUPABASE_URL') || 'https://pjyorgedaxevxophpfib.supabase.co';
const SUPABASE_ANON_KEY = Netlify.env.get('SUPABASE_ANON_KEY') || '';

const STATIC_PAGES = [
  { loc: 'https://sellingdubai.com/', changefreq: 'weekly', priority: '1.0' },
  { loc: 'https://sellingdubai.com/join', changefreq: 'monthly', priority: '0.8' },
  { loc: 'https://sellingdubai.com/pricing', changefreq: 'monthly', priority: '0.7' },
  { loc: 'https://sellingdubai.com/terms', changefreq: 'yearly', priority: '0.3' },
  { loc: 'https://sellingdubai.com/privacy', changefreq: 'yearly', priority: '0.3' },
];

export default async (_request: Request, _context: Context) => {
  let agentSlugs: string[] = [];

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/agents?select=slug,updated_at&verification_status=eq.verified&order=updated_at.desc&limit=5000`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );
    if (res.ok) {
      const agents: { slug: string; updated_at: string }[] = await res.json();
      agentSlugs = agents.map(a => a.slug).filter(Boolean);
    }
  } catch {
    // Supabase unavailable — serve static pages only
  }

  const agentUrls = agentSlugs.map(slug =>
    `  <url>\n    <loc>https://sellingdubai.com/${encodeURIComponent(slug)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`
  );

  const staticUrls = STATIC_PAGES.map(p =>
    `  <url>\n    <loc>${p.loc}</loc>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticUrls, ...agentUrls].join('\n')}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
};

export const config: Config = { path: '/sitemap.xml' };
