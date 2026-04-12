// js/agents.ts — Public agent directory (/agents)
// Fetches verified/pro/premium agents from Supabase.
// Client-side search + filter — no extra API calls after initial load.

import { supabase } from './config';
import { escAttr, escHtml } from './utils';

const SUPABASE_STORAGE = 'https://pjyorgedaxevxophpfib.supabase.co/';

function safeImgUrl(url: string | null | undefined): string | null {
  return url?.startsWith(SUPABASE_STORAGE) ? url : null;
}

function netlifyImg(url: string, w: number): string {
  return `/.netlify/images?url=${encodeURIComponent(url)}&w=${w}&fm=webp&q=80`;
}

interface Agent {
  slug: string;
  name: string;
  photo_url: string | null;
  agency_name: string | null;
  verification_status: string;
  tier: string | null;
  dld_verified: boolean | null;
  created_at: string;
  leads: { count: number }[];
}

const TIER_ORDER: Record<string, number> = { premium: 0, pro: 1, free: 2 };

let allAgents: Agent[] = [];
let activeFilter = 'all';
let searchQuery = '';

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0] ?? '')
    .join('')
    .toUpperCase();
}

function renderCard(agent: Agent): string {
  const safePhoto = safeImgUrl(agent.photo_url);
  const photoHtml = safePhoto
    ? `<img class="card-photo" src="${escAttr(netlifyImg(safePhoto, 144))}" alt="${escAttr(agent.name)}" width="72" height="72" loading="lazy">`
    : `<div class="card-photo-placeholder" aria-hidden="true">${escHtml(initials(agent.name))}</div>`;

  const verifiedBadge = agent.dld_verified
    ? `<span class="verified-badge" title="DLD Verified" aria-label="DLD Verified">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2 6l3 3 5-5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
       </span>`
    : '';

  const tierBadge = agent.tier === 'premium'
    ? `<span class="tier-badge tier-badge-premium">Premium</span>`
    : agent.tier === 'pro'
    ? `<span class="tier-badge tier-badge-pro">Pro</span>`
    : '';

  const leadCount = agent.leads?.[0]?.count ?? 0;
  const leadHtml = leadCount > 0
    ? `<span class="lead-count">${leadCount} ${leadCount === 1 ? 'inquiry' : 'inquiries'}</span>`
    : '';

  const agencyHtml = agent.agency_name
    ? `<div class="card-agency">${escHtml(agent.agency_name)}</div>`
    : '';

  return `<div class="agent-card" role="listitem">
  <div class="card-photo-wrap">
    ${photoHtml}
    ${verifiedBadge}
  </div>
  <div class="card-name">${escHtml(agent.name)}</div>
  ${agencyHtml}
  <div class="card-meta">
    ${tierBadge}
    ${leadHtml}
  </div>
  <a class="card-cta" href="/a/${escAttr(agent.slug)}">View Profile</a>
</div>`;
}

function applyFiltersAndRender(): void {
  const q = searchQuery.toLowerCase();

  const filtered = allAgents.filter(agent => {
    // Search
    if (q) {
      const nameMatch = agent.name.toLowerCase().includes(q);
      const agencyMatch = (agent.agency_name ?? '').toLowerCase().includes(q);
      if (!nameMatch && !agencyMatch) return false;
    }
    // Filter chips
    if (activeFilter === 'dld') return !!agent.dld_verified;
    if (activeFilter === 'pro') return agent.tier === 'pro';
    if (activeFilter === 'premium') return agent.tier === 'premium';
    return true;
  });

  const grid = document.getElementById('agent-grid')!;
  const countEl = document.getElementById('results-count')!;

  if (filtered.length === 0) {
    const isFiltered = q || activeFilter !== 'all';
    grid.innerHTML = `<div class="empty-state">
      <h3>${isFiltered ? 'No agents match your search' : 'No agents yet'}</h3>
      <p>${isFiltered ? 'Try a different search term or filter.' : 'Agents will appear here once verified.'}</p>
      ${isFiltered ? `<button class="empty-clear-btn" id="clear-filters-btn">Clear search &amp; filters</button>` : ''}
    </div>`;
    if (isFiltered) {
      document.getElementById('clear-filters-btn')?.addEventListener('click', clearFilters);
    }
    countEl.textContent = '0 results';
    return;
  }

  grid.innerHTML = filtered.map(renderCard).join('');
  countEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'agent' : 'agents'}`;
}

function clearFilters(): void {
  searchQuery = '';
  activeFilter = 'all';
  const input = document.getElementById('search-input') as HTMLInputElement;
  if (input) input.value = '';
  document.querySelectorAll<HTMLButtonElement>('.chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === 'all');
  });
  applyFiltersAndRender();
}

async function init(): Promise<void> {
  const { data, error } = await supabase
    .from('agents')
    .select('slug, name, photo_url, agency_name, verification_status, tier, dld_verified, created_at, leads(count)')
    .or('verification_status.eq.verified,tier.in.(pro,premium)');

  if (error || !data) {
    console.error('agents: failed to load', error);
    document.getElementById('agent-grid')!.innerHTML =
      '<div class="empty-state"><h3>Could not load agents</h3><p>Please refresh the page to try again.</p></div>';
    return;
  }

  allAgents = (data as Agent[]).sort((a, b) => {
    const ta = TIER_ORDER[a.tier ?? ''] ?? 3;
    const tb = TIER_ORDER[b.tier ?? ''] ?? 3;
    if (ta !== tb) return ta - tb;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  // Update hero count badge
  const countBadge = document.getElementById('agent-count-badge');
  if (countBadge) {
    const verifiedCount = allAgents.filter(a => a.verification_status === 'verified').length;
    countBadge.textContent = `${verifiedCount} verified ${verifiedCount === 1 ? 'agent' : 'agents'} across Dubai`;
  }

  applyFiltersAndRender();

  // Search input
  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  searchInput?.addEventListener('input', () => {
    searchQuery = searchInput.value.trim();
    applyFiltersAndRender();
  });

  // Filter chips
  document.querySelectorAll<HTMLButtonElement>('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter ?? 'all';
      document.querySelectorAll<HTMLButtonElement>('.chip').forEach(b =>
        b.classList.toggle('active', b === btn)
      );
      applyFiltersAndRender();
    });
  });
}

init();
