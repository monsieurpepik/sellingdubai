// ==========================================
// PROPERTY FILTERS (Mobile Overlay + Desktop Sidebar)
// ==========================================
import { currentFilters, allProperties, setAllProperties, currentAgent, setCurrentFilters, resetCurrentFilters } from './state.js';
import { renderPropertyList, loadProperties, renderSkeletonCards, propertiesLoaded } from './properties.js';
import { logEvent } from './analytics.js';

// ==========================================
// FILTER LOGIC
// ==========================================
export function applyCurrentFilters() {
  let filtered = [...allProperties];
  const f = currentFilters;
  if (f.search) {
    const q = f.search.toLowerCase();
    filtered = filtered.filter(p =>
      (p.title || '').toLowerCase().includes(q) ||
      (p.location || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      (p.property_type || '').toLowerCase().includes(q)
    );
  }
  if (f.priceMin > 0) filtered = filtered.filter(p => parsePrice(p.price) >= f.priceMin);
  if (f.priceMax > 0) filtered = filtered.filter(p => parsePrice(p.price) <= f.priceMax);
  if (f.beds > 0) filtered = filtered.filter(p => (p.bedrooms || 0) >= f.beds);
  if (f.baths > 0) filtered = filtered.filter(p => (p.bathrooms || 0) >= f.baths);
  if (f.areaMin > 0) filtered = filtered.filter(p => (p.area_sqft || 0) >= f.areaMin);
  if (f.areaMax > 0) filtered = filtered.filter(p => (p.area_sqft || 0) <= f.areaMax);
  if (f.furnishing !== 'all') {
    filtered = filtered.filter(p => {
      const feats = (p.features || []).map(x => x.toLowerCase()).join(' ');
      if (f.furnishing === 'furnished') return feats.includes('furnished') && !feats.includes('unfurnished') && !feats.includes('partly');
      if (f.furnishing === 'unfurnished') return feats.includes('unfurnished');
      if (f.furnishing === 'partly') return feats.includes('partly') || feats.includes('semi');
      return true;
    });
  }
  if (f.amenities.length > 0) {
    filtered = filtered.filter(p => {
      const feats = (p.features || []).map(x => x.toLowerCase()).join(' ');
      return f.amenities.every(a => feats.includes(a));
    });
  }
  return filtered;
}

export function parsePrice(priceStr: unknown): number {
  if (!priceStr) return 0;
  return parseInt(String(priceStr).replace(/[^0-9]/g, ''), 10) || 0;
}

// ==========================================
// PROPERTY OVERLAY + TABS
// ==========================================
window.openProps = async function() {
  const overlay = document.getElementById('prop-overlay');
  overlay!.classList.add('open');
  document.body.style.overflow = 'hidden';
  logEvent('link_click', { link_type: 'view_listings' });

  if (!currentAgent) return;
  const listEl = document.getElementById('prop-list');
  if (!propertiesLoaded && listEl) listEl.innerHTML = renderSkeletonCards(3);
  const props = await loadProperties(currentAgent.id);
  setAllProperties(props);
  const filtered = applyCurrentFilters();
  renderPropertyList(filtered);
};

window.closeProps = function() {
  document.getElementById('prop-overlay')!.classList.remove('open');
  document.body.style.overflow = '';
};

// ==========================================
// FILTERS
// ==========================================
window.openFilters = function() {
  document.getElementById('filters-overlay')!.classList.add('open');
};
window.closeFilters = function() {
  document.getElementById('filters-overlay')!.classList.remove('open');
};

// Pill toggle logic
document.querySelectorAll('.filters-pills').forEach(container => {
  container.addEventListener('click', (e) => {
    const pill = (e.target as Element | null)?.closest('.filters-pill');
    if (!pill) return;
    const id = container.id;
    if (id === 'filter-furnishing') {
      container.querySelectorAll('.filters-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
    } else if (id === 'filter-amenities') {
      pill.classList.toggle('active');
    } else {
      const wasActive = pill.classList.contains('active');
      container.querySelectorAll('.filters-pill').forEach(p => p.classList.remove('active'));
      if (!wasActive) pill.classList.add('active');
    }
  });
});

window.clearAllFilters = function() {
  (document.getElementById('filter-search') as HTMLInputElement).value = '';
  (document.getElementById('filter-price-min') as HTMLInputElement).value = '';
  (document.getElementById('filter-price-max') as HTMLInputElement).value = '';
  (document.getElementById('filter-area-min') as HTMLInputElement).value = '';
  (document.getElementById('filter-area-max') as HTMLInputElement).value = '';
  document.querySelectorAll('.filters-pills .filters-pill').forEach(p => p.classList.remove('active'));
  document.querySelector<HTMLElement>('#filter-furnishing .filters-pill[data-val="all"]')?.classList.add('active');
  resetCurrentFilters();
  document.getElementById('filter-toggle-btn')?.classList.remove('active');
};

window.applyFilters = function() {
  currentFilters.search = (document.getElementById('filter-search') as HTMLInputElement).value.trim();
  currentFilters.priceMin = parseInt((document.getElementById('filter-price-min') as HTMLInputElement).value) || 0;
  currentFilters.priceMax = parseInt((document.getElementById('filter-price-max') as HTMLInputElement).value) || 0;
  currentFilters.areaMin = parseInt((document.getElementById('filter-area-min') as HTMLInputElement).value) || 0;
  currentFilters.areaMax = parseInt((document.getElementById('filter-area-max') as HTMLInputElement).value) || 0;
  const activeBed = document.querySelector('#filter-beds .filters-pill.active');
  currentFilters.beds = activeBed ? parseInt((activeBed as HTMLElement).dataset['val'] ?? '') : 0;
  const activeBath = document.querySelector('#filter-baths .filters-pill.active');
  currentFilters.baths = activeBath ? parseInt((activeBath as HTMLElement).dataset['val'] ?? '') : 0;
  const activeFurn = document.querySelector('#filter-furnishing .filters-pill.active');
  currentFilters.furnishing = activeFurn ? (activeFurn as HTMLElement).dataset['val'] ?? 'all' : 'all';
  currentFilters.amenities = [...document.querySelectorAll('#filter-amenities .filters-pill.active')].map(p => (p as HTMLElement).dataset['val'] ?? '');

  const hasActive = currentFilters.search || currentFilters.priceMin || currentFilters.priceMax ||
    currentFilters.beds || currentFilters.baths || currentFilters.areaMin || currentFilters.areaMax ||
    currentFilters.furnishing !== 'all' || currentFilters.amenities.length > 0;
  document.getElementById('filter-toggle-btn')?.classList.toggle('active', Boolean(hasActive));

  const filtered = applyCurrentFilters();
  renderPropertyList(filtered);
  window.closeFilters?.();
};

window.resetFilters = function() {
  resetCurrentFilters();
  // Clear UI inputs
  const searchEl = document.getElementById('filter-search') as HTMLInputElement | null;
  if (searchEl) searchEl.value = '';
  ['filter-price-min','filter-price-max','filter-area-min','filter-area-max'].forEach(id => { const el = document.getElementById(id) as HTMLInputElement | null; if (el) el.value = ''; });
  document.querySelectorAll('.filters-pill.active').forEach(p => p.classList.remove('active'));
  document.getElementById('filter-toggle-btn')?.classList.remove('active');
  renderPropertyList(allProperties);
};

// ==========================================
// SIDEBAR FILTERS (DESKTOP)
// ==========================================
window.toggleSidebarPill = function(pill, groupId) {
  const group = document.getElementById(groupId);
  if (!group) return;
  const wasActive = pill.classList.contains('active');
  group.querySelectorAll('.sidebar-pill').forEach(p => p.classList.remove('active'));
  if (!wasActive) pill.classList.add('active');
};

let _sidebarDebounce: ReturnType<typeof setTimeout> | null = null;
window.sidebarFilterChanged = function() {
  clearTimeout(_sidebarDebounce!);
  _sidebarDebounce = setTimeout(() => window.applySidebarFilters?.(), 350);
};

window.applySidebarFilters = function() {
  currentFilters.search = ((document.getElementById('sidebar-search') as HTMLInputElement | null)?.value || '').trim();
  currentFilters.priceMin = parseInt((document.getElementById('sidebar-price-min') as HTMLInputElement | null)?.value ?? '') || 0;
  currentFilters.priceMax = parseInt((document.getElementById('sidebar-price-max') as HTMLInputElement | null)?.value ?? '') || 0;
  currentFilters.areaMin = parseInt((document.getElementById('sidebar-area-min') as HTMLInputElement | null)?.value ?? '') || 0;
  currentFilters.areaMax = parseInt((document.getElementById('sidebar-area-max') as HTMLInputElement | null)?.value ?? '') || 0;
  const activeBed = document.querySelector('#sidebar-beds .sidebar-pill.active');
  currentFilters.beds = activeBed ? parseInt((activeBed as HTMLElement).dataset['val'] ?? '') : 0;
  const activeBath = document.querySelector('#sidebar-baths .sidebar-pill.active');
  currentFilters.baths = activeBath ? parseInt((activeBath as HTMLElement).dataset['val'] ?? '') : 0;
  const filtered = applyCurrentFilters();
  renderPropertyList(filtered);
};

window.clearSidebarFilters = function() {
  const ids = ['sidebar-search','sidebar-price-min','sidebar-price-max','sidebar-area-min','sidebar-area-max'];
  ids.forEach(id => { const el = document.getElementById(id) as HTMLInputElement | null; if (el) el.value = ''; });
  document.querySelectorAll('.sidebar-pill.active').forEach(p => p.classList.remove('active'));
  resetCurrentFilters();
  renderPropertyList(allProperties);
};
