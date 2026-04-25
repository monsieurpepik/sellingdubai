// ==========================================
// APP INITIALIZATION
// ==========================================

import { hydrateOgMeta, injectSchemaOrg, renderAgent, showEditButtonIfOwner, showPage } from './agent-page.js';
import { trackPageView } from './analytics.js';
import { SUPABASE_URL, supabase } from './config.js';
import { getAgentSlug } from './utils.js';
import './event-delegation.js';

// closeDetail stub — available immediately, before property-detail.js lazy-loads.
// property-detail.js replaces this with its full implementation when it loads.
window.closeDetail = () => {
  document.getElementById('detail-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
};

// Lazy-load helpers — modules load on first user interaction, not on init
let _gallery, _propDetail, _leadModal, _filters, _projectDetail;

function lazyLoad(promise, name) {
  return promise.catch(e => {
    console.error(`[${name}] failed to load:`, e);
    showFeatureError(name);
  });
}

function showFeatureError(featureName) {
  let toast = document.getElementById('feature-error-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'feature-error-toast';
    toast.setAttribute('role', 'alert');
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;background:#1d1d1f;color:#fff;border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:12px 20px;font-family:Inter,sans-serif;font-size:13px;font-weight:500;box-shadow:0 4px 24px rgba(0,0,0,0.4);pointer-events:none;opacity:0;transition:opacity 0.2s;';
    document.body.appendChild(toast);
  }
  toast.textContent = `${featureName} couldn't load — please refresh the page.`;
  toast.style.opacity = '1';
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, 4000);
}

// gallery.js — loaded on first photo/gallery open
window.openFullGallery = async function openFullGalleryLazy() {
  if (!_gallery) _gallery = lazyLoad(import('./gallery.js'), 'gallery');
  await _gallery;
  if (window.openFullGallery !== openFullGalleryLazy) window.openFullGallery();
};
window.openPhotoViewer = async function openPhotoViewerLazy(idx) {
  if (!_gallery) _gallery = lazyLoad(import('./gallery.js'), 'gallery');
  await _gallery;
  if (window.openPhotoViewer !== openPhotoViewerLazy) window.openPhotoViewer(idx);
};

// property-detail.js — loaded on first property card open
window.openPropertyDetail = async function openPropertyDetailLazy(propIndex) {
  if (!_propDetail) _propDetail = lazyLoad(import('./property-detail.js'), 'property-detail');
  await _propDetail;
  if (window.openPropertyDetail !== openPropertyDetailLazy) window.openPropertyDetail(propIndex);
};
window.openPropertyById = async function openPropertyByIdLazy(propId) {
  if (!_propDetail) _propDetail = lazyLoad(import('./property-detail.js'), 'property-detail');
  await _propDetail;
  if (window.openPropertyById !== openPropertyByIdLazy) window.openPropertyById(propId);
};

// lead-modal.js — loaded on first contact/lead open
window.openLead = async function openLeadLazy() {
  if (!_leadModal) _leadModal = lazyLoad(import('./lead-modal.js'), 'lead-modal');
  await _leadModal;
  if (window.openLead !== openLeadLazy) window.openLead();
};
window.openLeadForBrochure = async function openLeadForBrochureLazy(projectName, brochureUrl) {
  if (!_leadModal) _leadModal = lazyLoad(import('./lead-modal.js'), 'lead-modal');
  await _leadModal;
  if (window.openLeadForBrochure !== openLeadForBrochureLazy) window.openLeadForBrochure(projectName, brochureUrl);
};
window.openLeadForProperty = async function openLeadForPropertyLazy(propertyTitle) {
  if (!_leadModal) _leadModal = lazyLoad(import('./lead-modal.js'), 'lead-modal');
  await _leadModal;
  if (window.openLeadForProperty !== openLeadForPropertyLazy) window.openLeadForProperty(propertyTitle);
};

// filters.js — loaded on first filters/properties panel open
window.openFilters = async function openFiltersLazy() {
  if (!_filters) _filters = lazyLoad(import('./filters.js'), 'filters');
  await _filters;
  if (window.openFilters !== openFiltersLazy) window.openFilters();
};
window.openProps = async function openPropsLazy() {
  if (!_filters) _filters = lazyLoad(import('./filters.js'), 'filters');
  await _filters;
  if (window.openProps !== openPropsLazy) window.openProps();
};

// mortgage.js is lazy-loaded on first openMortgage() call
// Named so the guard below can detect whether the module replaced it
window.openMortgage = async function openMortgageLazy() {
  try {
    await import('./mortgage.js');
    // mortgage.js sets window.openMortgage to the real impl as a side-effect.
    // Only call it if the replacement happened — prevents infinite recursion if
    // the module ever fails to overwrite the global.
    if (window.openMortgage !== openMortgageLazy) window.openMortgage();
  } catch (e) {
    console.error('[mortgage] failed to load:', e);
    showFeatureError('Mortgage calculator');
  }
};

// initMortModal — off-plan mode entry point; shares same lazy load as openMortgage
window.initMortModal = async function initMortModalLazy(opts) {
  try {
    await import('./mortgage.js');
    // mortgage.js registers window.initMortModal as a side-effect.
    if (window.initMortModal !== initMortModalLazy) window.initMortModal(opts);
  } catch (e) {
    console.error('[mortgage] failed to load:', e);
    showFeatureError('Mortgage calculator');
  }
};

// project-detail.js is lazy-loaded on first openProjectDetail() call
window.openProjectDetail = async function openProjectDetailLazy(slug) {
  if (!_projectDetail) _projectDetail = lazyLoad(import('./project-detail.js'), 'project-detail');
  await _projectDetail;
  if (window.openProjectDetail !== openProjectDetailLazy) window.openProjectDetail(slug);
};

// ==========================================
// KEYBOARD NAVIGATION
// ==========================================
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const mortModal = document.getElementById('mortgage-modal');
    if (mortModal?.classList.contains('open')) { if (typeof closeMortgage === 'function') closeMortgage(); return; }
    const photoViewer = document.getElementById('photo-viewer');
    if (photoViewer?.classList.contains('open')) { if (typeof closePhotoViewer === 'function') closePhotoViewer(); return; }
    const galleryOverlay = document.getElementById('gallery-overlay');
    if (galleryOverlay?.classList.contains('open')) { if (typeof closeFullGallery === 'function') closeFullGallery(); return; }
    const detailOverlay = document.getElementById('detail-overlay');
    if (detailOverlay?.classList.contains('open')) { if (typeof closeDetail === 'function') closeDetail(); return; }
    const filtersOverlay = document.getElementById('filters-overlay');
    if (filtersOverlay?.classList.contains('open')) { if (typeof closeFilters === 'function') closeFilters(); return; }
    const propOverlay = document.getElementById('prop-overlay');
    if (propOverlay?.classList.contains('open')) { if (typeof closeProps === 'function') closeProps(); }
    const leadModal = document.getElementById('lead-modal');
    if (leadModal?.classList.contains('open')) { if (typeof closeLead === 'function') closeLead(); }
  }
});

// ==========================================
// FOCUS TRAP UTILITY
// ==========================================
function trapFocus(modal, e) {
  const focusable = modal.querySelectorAll('input:not([tabindex="-1"]),select,textarea,button:not([disabled]),[tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const leadModal = document.getElementById('lead-modal');
  if (leadModal?.classList.contains('open')) { trapFocus(leadModal, e); return; }
  const mortModal = document.getElementById('mortgage-modal');
  if (mortModal?.classList.contains('open')) { trapFocus(mortModal, e); }
});

// ==========================================
// INIT
// ==========================================
async function init() {
  const slug = getAgentSlug();
  if (!slug) { showPage('error'); return; }

  // Show skeleton shimmer immediately
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('skeleton').classList.remove('hidden');

  // Timeout guard — show error if fetch takes > 10s
  const timeout = setTimeout(() => { showPage('error'); }, 10000);

  try {
    const { data: agent, error } = await supabase // await-ok: single primary fetch, nothing to parallelize
      .from('agents')
      .select('id,slug,name,photo_url,background_image_url,verification_status,tagline,phone,dld_broker_number,broker_number,dld_total_deals,dld_total_volume_aed,dld_verified,agency_name,agency_logo_url,whatsapp,email,calendly_url,custom_link_1_url,custom_link_1_label,custom_link_2_url,custom_link_2_label,instagram_url,youtube_url,tiktok_url,linkedin_url,facebook_pixel_id,ga4_measurement_id,show_golden_visa,show_preapproval,tier,referral_code,stripe_subscription_status,stripe_current_period_end')
      .eq('slug', slug)
      .single();

    clearTimeout(timeout);

    if (error || !agent) { showPage('error'); return; }

    // Check ownership once — used both for the pending-profile gate and the edit button.
    const ownerToken = localStorage.getItem('sd_edit_token');
    let isOwner = false;
    if (ownerToken) {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-magic-link`, { // await-ok: conditional on ownerToken, depends on agent.id from prior query
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: ownerToken })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.agent && data.agent.id === agent.id) isOwner = true;
        }
      } catch (_e) { /* silently fail — not critical */ }
    }

    if (agent.verification_status !== 'verified') {
      if (!isOwner) {
        document.getElementById('pending-agent-name').textContent = agent.name || 'This agent';
        showPage('pending');
        return;
      }
      // Owner viewing their own pending profile — show banner, continue to render
      document.getElementById('verification-pending-banner').classList.remove('hidden');
    }

    renderAgent(agent);

    // Non-critical enhancements — failures here don't break the profile
    try { injectSchemaOrg(agent); } catch (e) { console.error('[schema-org]', e); }
    try { hydrateOgMeta(agent); } catch (e) { console.error('[og-meta]', e); }
    try { trackPageView(agent.id); } catch (e) { console.error('[analytics]', e); }
    // Pass pre-resolved isOwner to avoid a second verify-magic-link network call.
    // showEditButtonIfOwner falls back to its own fetch only if called without the second argument.
    try { showEditButtonIfOwner(agent, ownerToken ? isOwner : undefined); } catch (e) { console.error('[owner-check]', e); }

    // Detect /[agent-slug]/project/[project-slug] sub-path
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    // pathParts: ['agent-slug', 'project', 'project-slug']
    if (pathParts[1] === 'project' && pathParts[2]) {
      const projectSlug = decodeURIComponent(pathParts[2]);
      setTimeout(() => import('./project-detail.js').then(m => m.openProjectDetail(projectSlug)).catch(e => {
        console.error('[project-detail] sub-path load failed:', e);
        showFeatureError('project-detail');
      }), 100);
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('open') === 'lead') {
      setTimeout(() => window.openLead(), 500);
    }
  } catch (e) {
    clearTimeout(timeout);
    console.error('Init error:', e);
    if (window.__sdTrackError) window.__sdTrackError(`Agent init failed: ${e.message}`, { slug: slug, stack: e.stack });
    showPage('error');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ==========================================
// SERVICE WORKER REGISTRATION
// ==========================================
// if ('serviceWorker' in navigator) {
//   window.addEventListener('load', () => {
//     navigator.serviceWorker.register('/sw.js').catch(() => {});
//   });
// }

// ==========================================
// OFFLINE DETECTION
// ==========================================
function showOfflineBanner(show) {
  let banner = document.getElementById('offline-banner');
  if (show && !banner) {
    banner = document.createElement('div');
    banner.id = 'offline-banner';
    banner.setAttribute('role', 'alert');
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#1127d2;color:#fff;text-align:center;padding:8px 16px;font-family:Inter,sans-serif;font-size:13px;font-weight:600;transition:transform 0.3s;';
    banner.textContent = 'You are offline. Some features may not work.';
    document.body.prepend(banner);
  } else if (!show && banner) {
    banner.remove();
  }
}
window.addEventListener('offline', () => showOfflineBanner(true));
window.addEventListener('online', () => showOfflineBanner(false));
if (!navigator.onLine) showOfflineBanner(true);
