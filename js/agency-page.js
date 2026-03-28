// js/agency-page.js
const SUPABASE_URL = 'https://pjyorgedaxevxophpfib.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqeW9yZ2VkYXhldnhvcGhwZmliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMjU2MzYsImV4cCI6MjA4OTgwMTYzNn0.IhIpAxk--Y0ZKufK51-CPuhw-NafyLPvhH31iqzpgrU';

const slug = window.location.pathname.replace(/^\/agency\//, '').replace(/\/$/, '');

async function init() {
  if (!slug) { showError('Agency not found.'); return; }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data: agency, error: agencyErr } = await sb
    .from('agencies')
    .select('id, slug, name, logo_url, website, description, owner_agent_id')
    .eq('slug', slug)
    .single();

  if (agencyErr || !agency) { showError('Agency not found.'); return; }

  document.title = agency.name + ' — SELLING DUBAI';
  document.querySelector('meta[property="og:title"]').setAttribute('content', agency.name + ' — SELLING DUBAI');
  if (agency.logo_url) {
    document.querySelector('meta[property="og:image"]').setAttribute('content', agency.logo_url);
  }

  const logoEl = document.getElementById('agency-logo');
  if (agency.logo_url) {
    logoEl.innerHTML = `<img src="${agency.logo_url}" alt="${agency.name}" style="width:100%;height:100%;object-fit:cover;border-radius:16px;">`;
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
    websiteEl.href = agency.website;
    websiteEl.querySelector('span').textContent = agency.website.replace(/^https?:\/\//, '');
    websiteEl.style.display = 'inline-flex';
  }
  document.getElementById('skeleton').style.display = 'none';
  document.getElementById('agency-header').style.display = 'block';

  const { data: agents } = await sb
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
      ? `<img src="${a.photo_url}" alt="${a.name}" style="width:100%;height:100%;object-fit:cover;">`
      : `<span style="font-size:20px;font-weight:700;">${initials}</span>`;
    return `
      <a href="/a/${a.slug}" class="agent-card">
        <div class="agent-avatar">${avatarHtml}</div>
        <div class="agent-name">${a.name || ''}</div>
        ${a.tagline ? `<div class="agent-tagline">${a.tagline}</div>` : ''}
        ${a.dld_broker_number ? `<div class="agent-brn">BRN ${a.dld_broker_number}</div>` : ''}
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
