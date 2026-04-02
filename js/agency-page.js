// js/agency-page.js
import { supabase } from './config.js';
import { escHtml, escAttr, safeUrl } from './utils.js';

const NETLIFY_IMG = (url, w) =>
  url ? `/.netlify/images?url=${encodeURIComponent(url)}&w=${w}&fm=webp&q=80` : '';

const SUPABASE_STORAGE = 'https://pjyorgedaxevxophpfib.supabase.co/';
function safeImgUrl(url) {
  return url && url.startsWith(SUPABASE_STORAGE) ? url : null;
}

const slug = window.location.pathname.replace(/^\/agency\//, '').replace(/\/$/, '');

async function init() {
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

  document.title = agency.name + ' — SellingDubai';
  const canonicalEl = document.createElement('link');
  canonicalEl.rel = 'canonical';
  canonicalEl.href = `https://sellingdubai.ae/agency/${encodeURIComponent(agency.slug)}`;
  document.head.appendChild(canonicalEl);
  document.querySelector('meta[property="og:title"]').setAttribute('content', agency.name + ' — SellingDubai');
  const agencyDesc = agency.description || `${agency.name} — verified DLD real estate agency in Dubai. Browse agent profiles, listings, and contact directly.`;
  document.querySelector('meta[name="description"]')?.setAttribute('content', agencyDesc);
  document.querySelector('meta[property="og:description"]')?.setAttribute('content', agencyDesc);
  const jsonLd = {
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
    const ogImageUrl = 'https://sellingdubai.ae' + NETLIFY_IMG(safeLogoUrl, 400);
    document.querySelector('meta[property="og:image"]').setAttribute('content', ogImageUrl);
  }

  const logoEl = document.getElementById('agency-logo');
  if (safeLogoUrl) {
    const img = document.createElement('img');
    img.src = NETLIFY_IMG(safeLogoUrl, 144);
    img.alt = agency.name;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:16px;';
    logoEl.appendChild(img);
  } else {
    logoEl.textContent = agency.name.charAt(0).toUpperCase();
  }
  document.getElementById('agency-name').textContent = agency.name;
  if (agency.description) {
    const descEl = document.getElementById('agency-description');
    descEl.textContent = agency.description;
    descEl.style.display = 'block';
  }
  if (agency.website) {
    const websiteEl = document.getElementById('agency-website');
    const safeWebsite = safeUrl(agency.website);
    if (safeWebsite && (safeWebsite.startsWith('https://') || safeWebsite.startsWith('http://'))) {
      websiteEl.href = safeWebsite;
      websiteEl.querySelector('span').textContent = agency.website.replace(/^https?:\/\//, '');
      websiteEl.style.display = 'inline-flex';
    }
  }

  document.getElementById('skeleton').style.display = 'none';
  document.getElementById('agency-header').style.display = 'block';

  const grid = document.getElementById('agents-grid');
  if (!agents || agents.length === 0) {
    grid.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:14px;">No verified agents in this agency yet.</p>';
    document.getElementById('agents-section').style.display = 'block';
    return;
  }

  document.getElementById('agents-count').textContent = agents.length + ' agent' + (agents.length === 1 ? '' : 's');
  grid.innerHTML = agents.map(a => {
    const initials = (a.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const safePhoto = safeImgUrl(a.photo_url);
    const avatarHtml = safePhoto
      ? `<img src="${escAttr(NETLIFY_IMG(safePhoto, 112))}" srcset="${escAttr(NETLIFY_IMG(safePhoto, 80))} 80w, ${escAttr(NETLIFY_IMG(safePhoto, 160))} 160w" sizes="80px" width="56" height="56" alt="${escAttr(a.name)}" style="width:100%;height:100%;object-fit:cover;">`
      : `<span style="font-size:20px;font-weight:700;">${escHtml(initials)}</span>`;
    return `
      <a href="/a/${encodeURIComponent(a.slug)}" class="agent-card">
        <div class="agent-avatar">${avatarHtml}</div>
        <div class="agent-name">${escHtml(a.name)}</div>
        ${a.tagline ? `<div class="agent-tagline">${escHtml(a.tagline)}</div>` : ''}
        ${a.dld_broker_number ? `<div class="agent-brn">BRN ${escHtml(a.dld_broker_number)}</div>` : ''}
        ${a.whatsapp ? `<div class="agent-wa">WhatsApp available</div>` : ''}
      </a>
    `;
  }).join('');
  document.getElementById('agents-section').style.display = 'block';
}

function showError(msg) {
  document.getElementById('skeleton').style.display = 'none';
  const errEl = document.getElementById('error-state');
  errEl.textContent = msg;
  errEl.style.display = 'block';
}

init();
