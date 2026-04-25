// js/agency-page.ts
import { supabase } from './config';
import { escAttr, escHtml, safeUrl } from './utils';

const NETLIFY_IMG = (url: string | null | undefined, w: number): string =>
  url ? `/.netlify/images?url=${encodeURIComponent(url)}&w=${w}&fm=webp&q=80` : '';

const SUPABASE_STORAGE = 'https://pjyorgedaxevxophpfib.supabase.co/';
function safeImgUrl(url: string | null | undefined): string | null {
  return url?.startsWith(SUPABASE_STORAGE) ? url : null;
}

const _pathMatch = window.location.pathname.match(/^\/agency\/([^/]+)/);
const slug = _pathMatch ? (_pathMatch[1] ?? '') : '';

async function init(): Promise<void> {
  if (!slug) { showError('Agency not found.'); return; }

  const { data: agency, error: agencyErr } = await supabase
    .from('agencies')
    .select('id, slug, name, logo_url, website, description, owner_agent_id')
    .eq('slug', slug)
    .single();

  if (agencyErr || !agency) { showError('Agency not found.'); return; }

  const { data: agents, error: agentsErr } = await supabase
    .from('agents')
    .select('id, slug, name, photo_url, tagline, tier, verification_status, dld_broker_number, whatsapp')
    .eq('agency_id', agency.id)
    .eq('verification_status', 'verified')
    .order('name');

  if (agentsErr) {
    console.error('Failed to load agents:', agentsErr);
  }

  document.title = `${agency.name} \u2014 SellingDubai`;
  const canonicalEl = document.createElement('link');
  canonicalEl.rel = 'canonical';
  canonicalEl.href = `https://sellingdubai.com/agency/${encodeURIComponent(agency.slug)}`;
  document.head.appendChild(canonicalEl);
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', `${agency.name} \u2014 SellingDubai`);
  const agencyDesc = agency.description ?? `${agency.name} \u2014 verified DLD real estate agency in Dubai. Browse agent profiles, listings, and contact directly.`;
  document.querySelector('meta[name="description"]')?.setAttribute('content', agencyDesc);
  document.querySelector('meta[property="og:description"]')?.setAttribute('content', agencyDesc);

  interface JsonLd {
    '@context': string;
    '@type': string;
    name: string;
    url: string;
    address: { '@type': string; addressLocality: string; addressCountry: string };
    description?: string;
    sameAs?: string;
  }
  const jsonLd: JsonLd = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    'name': agency.name,
    'url': window.location.href,
    'address': { '@type': 'PostalAddress', 'addressLocality': 'Dubai', 'addressCountry': 'AE' }
  };
  if (agency.description) jsonLd.description = agency.description;
  if (agency.website) { const sw = safeUrl(agency.website); if (sw) jsonLd.sameAs = sw; }
  const ldScript = document.createElement('script');
  ldScript.type = 'application/ld+json';
  ldScript.textContent = JSON.stringify(jsonLd);
  document.head.appendChild(ldScript);

  const safeLogoUrl = safeImgUrl(agency.logo_url);
  if (safeLogoUrl) {
    const ogImageUrl = `https://sellingdubai.com${NETLIFY_IMG(safeLogoUrl, 400)}`;
    document.querySelector('meta[property="og:image"]')?.setAttribute('content', ogImageUrl);
  }

  const logoEl = document.getElementById('agency-logo');
  if (logoEl) {
    if (safeLogoUrl) {
      const img = document.createElement('img');
      img.src = NETLIFY_IMG(safeLogoUrl, 144);
      img.alt = agency.name;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:16px;';
      logoEl.appendChild(img);
    } else {
      logoEl.textContent = agency.name.charAt(0).toUpperCase();
    }
  }
  const nameEl = document.getElementById('agency-name');
  if (nameEl) nameEl.textContent = agency.name;
  if (agency.description) {
    const descEl = document.getElementById('agency-description');
    if (descEl) {
      descEl.textContent = agency.description;
      descEl.style.display = 'block';
    }
  }
  if (agency.website) {
    const websiteEl = document.getElementById('agency-website') as HTMLAnchorElement | null;
    const safeWebsite = safeUrl(agency.website);
    if (websiteEl && safeWebsite && (safeWebsite.startsWith('https://') || safeWebsite.startsWith('http://'))) {
      websiteEl.href = safeWebsite;
      const span = websiteEl.querySelector('span');
      if (span) span.textContent = agency.website.replace(/^https?:\/\//, '');
      websiteEl.style.display = 'inline-flex';
    }
  }

  const skeletonEl = document.getElementById('skeleton');
  if (skeletonEl) skeletonEl.style.display = 'none';
  const headerEl = document.getElementById('agency-header');
  if (headerEl) headerEl.style.display = 'block';

  const grid = document.getElementById('agents-grid');
  if (!grid) return;

  if (!agents || agents.length === 0) {
    grid.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:14px;">No verified agents in this agency yet.</p>';
    const agentsSectionEl = document.getElementById('agents-section');
    if (agentsSectionEl) agentsSectionEl.style.display = 'block';
    return;
  }

  const agentsCountEl = document.getElementById('agents-count');
  if (agentsCountEl) agentsCountEl.textContent = `${agents.length} agent${agents.length === 1 ? '' : 's'}`;

  grid.innerHTML = agents.map(a => {
    const initials = (a.name ?? '?').split(' ').map((w: string) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
    const safePhoto = safeImgUrl(a.photo_url);
    const avatarHtml = safePhoto
      ? `<img src="${escAttr(NETLIFY_IMG(safePhoto, 112))}" srcset="${escAttr(NETLIFY_IMG(safePhoto, 80))} 80w, ${escAttr(NETLIFY_IMG(safePhoto, 160))} 160w" sizes="80px" width="56" height="56" alt="${escAttr(a.name ?? '')}" style="width:100%;height:100%;object-fit:cover;">`
      : `<span style="font-size:20px;font-weight:700;">${escHtml(initials)}</span>`;
    return `
      <a href="/${encodeURIComponent(a.slug ?? '')}" class="agent-card">
        <div class="agent-avatar">${avatarHtml}</div>
        <div class="agent-name">${escHtml(a.name ?? '')}</div>
        ${a.tagline ? `<div class="agent-tagline">${escHtml(a.tagline)}</div>` : ''}
        ${a.dld_broker_number ? `<div class="agent-brn">BRN ${escHtml(a.dld_broker_number)}</div>` : ''}
        ${a.whatsapp ? `<div class="agent-wa">WhatsApp available</div>` : ''}
      </a>
    `;
  }).join('');
  const agentsSectionEl = document.getElementById('agents-section');
  if (agentsSectionEl) agentsSectionEl.style.display = 'block';
}

function showError(msg: string): void {
  const skeletonEl = document.getElementById('skeleton');
  if (skeletonEl) skeletonEl.style.display = 'none';
  const errEl = document.getElementById('error-state');
  if (errEl) {
    errEl.textContent = msg;
    errEl.style.display = 'block';
  }
}

void init();
