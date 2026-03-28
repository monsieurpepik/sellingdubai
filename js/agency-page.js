// js/agency-page.js
import { supabase } from './config.js';
import { escHtml, escAttr, safeUrl } from './utils.js';

const NETLIFY_IMG = (url, w) =>
  url ? `/.netlify/images?url=${encodeURIComponent(url)}&w=${w}&fm=webp&q=80` : '';

const slug = window.location.pathname.replace(/^\/agency\//, '').replace(/\/$/, '');

async function init() {
  if (!slug) { showError('Agency not found.'); return; }

  const { data: agency, error: agencyErr } = await supabase
    .from('agencies')
    .select('id, slug, name, logo_url, website, description, owner_agent_id')
    .eq('slug', slug)
    .single();

  if (agencyErr || !agency) { showError('Agency not found.'); return; }

  document.title = escHtml(agency.name) + ' — SELLING DUBAI';
  document.querySelector('meta[property="og:title"]').setAttribute('content', agency.name + ' — SELLING DUBAI');
  if (agency.logo_url) {
    document.querySelector('meta[property="og:image"]').setAttribute('content', NETLIFY_IMG(agency.logo_url, 400));
  }

  const logoEl = document.getElementById('agency-logo');
  if (agency.logo_url) {
    const img = document.createElement('img');
    img.src = NETLIFY_IMG(agency.logo_url, 144);
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
    if (safeWebsite) {
      websiteEl.href = safeWebsite;
      websiteEl.querySelector('span').textContent = agency.website.replace(/^https?:\/\//, '');
      websiteEl.style.display = 'inline-flex';
    }
  }
  document.getElementById('skeleton').style.display = 'none';
  document.getElementById('agency-header').style.display = 'block';

  const { data: agents } = await supabase
    .from('agents')
    .select('id, slug, name, photo_url, tagline, tier, verification_status, dld_broker_number, whatsapp')
    .eq('agency_id', agency.id)
    .eq('verification_status', 'verified')
    .order('name');

  const grid = document.getElementById('agents-grid');
  if (!agents || agents.length === 0) {
    grid.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:14px;">No verified agents in this agency yet.</p>';
    document.getElementById('agents-section').style.display = 'block';
    return;
  }

  document.getElementById('agents-count').textContent = agents.length + ' agent' + (agents.length === 1 ? '' : 's');
  grid.innerHTML = agents.map(a => {
    const initials = (a.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const avatarHtml = a.photo_url
      ? `<img src="${escAttr(NETLIFY_IMG(a.photo_url, 112))}" alt="${escAttr(a.name)}" style="width:100%;height:100%;object-fit:cover;">`
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
