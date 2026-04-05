// ==========================================
// APP INITIALIZATION
// ==========================================
import { supabase, SUPABASE_URL } from './config';
import { getAgentSlug } from './utils';
import { trackPageView } from './analytics';
import { showPage, renderAgent, injectSchemaOrg, hydrateOgMeta, showEditButtonIfOwner } from './agent-page';
import './event-delegation';
import type { Agent } from './state';

// closeDetail stub — available immediately, before property-detail.ts lazy-loads.
// property-detail.ts replaces this with its full implementation when it loads.
window.closeDetail = function() {
  document.getElementById('detail-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
};

// Lazy-load helpers — modules load on first user interaction, not on init
let _gallery: Promise<unknown> | null = null;
let _propDetail: Promise<unknown> | null = null;
let _leadModal: Promise<unknown> | null = null;
let _filters: Promise<unknown> | null = null;
let _projectDetail: Promise<unknown> | null = null;

function lazyLoad(promise: Promise<unknown>, name: string): Promise<unknown> {
  return promise.catch((e: unknown) => {
    console.error(`[${name}] failed to load:`, e);
    showFeatureError(name);
  });
}

type ToastEl = HTMLDivElement & { _hideTimer?: ReturnType<typeof setTimeout> };

function showFeatureError(featureName: string): void {
  let toast = document.getElementById('feature-error-toast') as ToastEl | null;
  if (!toast) {
    const newToast = document.createElement('div') as ToastEl;
    newToast.id = 'feature-error-toast';
    newToast.setAttribute('role', 'alert');
    newToast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;background:#1d1d1f;color:#fff;border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:12px 20px;font-family:Inter,sans-serif;font-size:13px;font-weight:500;box-shadow:0 4px 24px rgba(0,0,0,0.4);pointer-events:none;opacity:0;transition:opacity 0.2s;';
    document.body.appendChild(newToast);
    toast = newToast;
  }
  toast.textContent = `${featureName} couldn't load — please refresh the page.`;
  toast.style.opacity = '1';
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => { (toast as ToastEl).style.opacity = '0'; }, 4000);
}

// gallery.ts — loaded on first photo/gallery open
window.openFullGallery = async function openFullGalleryLazy() {
  if (!_gallery) _gallery = lazyLoad(import('./gallery'), 'gallery');
  await _gallery;
  if (window.openFullGallery !== openFullGalleryLazy) window.openFullGallery?.();
};
window.openPhotoViewer = async function openPhotoViewerLazy(idx: number) {
  if (!_gallery) _gallery = lazyLoad(import('./gallery'), 'gallery');
  await _gallery;
  if (window.openPhotoViewer !== openPhotoViewerLazy) window.openPhotoViewer?.(idx);
};

// property-detail.ts — loaded on first property card open
window.openPropertyDetail = async function openPropertyDetailLazy(propIndex: number) {
  if (!_propDetail) _propDetail = lazyLoad(import('./property-detail'), 'property-detail');
  await _propDetail;
  if (window.openPropertyDetail !== openPropertyDetailLazy) window.openPropertyDetail?.(propIndex);
};
window.openPropertyById = async function openPropertyByIdLazy(propId: string) {
  if (!_propDetail) _propDetail = lazyLoad(import('./property-detail'), 'property-detail');
  await _propDetail;
  if (window.openPropertyById !== openPropertyByIdLazy) window.openPropertyById?.(propId);
};

// lead-modal.ts — loaded on first contact/lead open
window.openLead = async function openLeadLazy() {
  if (!_leadModal) _leadModal = lazyLoad(import('./lead-modal'), 'lead-modal');
  await _leadModal;
  if (window.openLead !== openLeadLazy) window.openLead?.();
};
window.openLeadForBrochure = async function openLeadForBrochureLazy(projectName: string, brochureUrl: string) {
  if (!_leadModal) _leadModal = lazyLoad(import('./lead-modal'), 'lead-modal');
  await _leadModal;
  if (window.openLeadForBrochure !== openLeadForBrochureLazy) window.openLeadForBrochure?.(projectName, brochureUrl);
};
window.openLeadForProperty = async function openLeadForPropertyLazy(propertyTitle: string) {
  if (!_leadModal) _leadModal = lazyLoad(import('./lead-modal'), 'lead-modal');
  await _leadModal;
  if (window.openLeadForProperty !== openLeadForPropertyLazy) window.openLeadForProperty?.(propertyTitle);
};

// filters.ts — loaded on first filters/properties panel open
window.openFilters = async function openFiltersLazy() {
  if (!_filters) _filters = lazyLoad(import('./filters'), 'filters');
  await _filters;
  if (window.openFilters !== openFiltersLazy) window.openFilters?.();
};
window.openProps = async function openPropsLazy() {
  if (!_filters) _filters = lazyLoad(import('./filters'), 'filters');
  await _filters;
  if (window.openProps !== openPropsLazy) window.openProps?.();
};

// mortgage.ts is lazy-loaded on first openMortgage() call
// Named so the guard below can detect whether the module replaced it
window.openMortgage = async function openMortgageLazy() {
  try {
    await import('./mortgage');
    // mortgage.ts sets window.openMortgage to the real impl as a side-effect.
    // Only call it if the replacement happened — prevents infinite recursion if
    // the module ever fails to overwrite the global.
    if (window.openMortgage !== openMortgageLazy) window.openMortgage?.();
  } catch (e) {
    console.error('[mortgage] failed to load:', e);
    showFeatureError('Mortgage calculator');
  }
};

// initMortModal — off-plan mode entry point; shares same lazy load as openMortgage
window.initMortModal = async function initMortModalLazy(opts?: Record<string, unknown>) {
  try {
    await import('./mortgage');
    // mortgage.ts registers window.initMortModal as a side-effect.
    if (window.initMortModal !== initMortModalLazy) window.initMortModal?.(opts);
  } catch (e) {
    console.error('[mortgage] failed to load:', e);
    showFeatureError('Mortgage calculator');
  }
};

// project-detail.ts is lazy-loaded on first openProjectDetail() call
window.openProjectDetail = async function openProjectDetailLazy(slug: string) {
  if (!_projectDetail) _projectDetail = lazyLoad(import('./project-detail'), 'project-detail');
  await _projectDetail;
  if (window.openProjectDetail !== openProjectDetailLazy) window.openProjectDetail?.(slug);
};

// ==========================================
// KEYBOARD NAVIGATION
// ==========================================
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const mortModal = document.getElementById('mortgage-modal');
    if (mortModal && mortModal.classList.contains('open')) { window.closeMortgage?.(); return; }
    const photoViewer = document.getElementById('photo-viewer');
    if (photoViewer?.classList.contains('open')) { window.closePhotoViewer?.(); return; }
    const galleryOverlay = document.getElementById('gallery-overlay');
    if (galleryOverlay?.classList.contains('open')) { window.closeFullGallery?.(); return; }
    const detailOverlay = document.getElementById('detail-overlay');
    if (detailOverlay?.classList.contains('open')) { window.closeDetail?.(); return; }
    const filtersOverlay = document.getElementById('filters-overlay');
    if (filtersOverlay?.classList.contains('open')) { window.closeFilters?.(); return; }
    const propOverlay = document.getElementById('prop-overlay');
    if (propOverlay?.classList.contains('open')) { window.closeProps?.(); }
    const leadModal = document.getElementById('lead-modal');
    if (leadModal?.classList.contains('open')) { window.closeLead?.(); }
  }
});

// ==========================================
// FOCUS TRAP UTILITY
// ==========================================
function trapFocus(modal: HTMLElement, e: KeyboardEvent): void {
  const focusable = modal.querySelectorAll<HTMLElement>('input:not([tabindex="-1"]),select,textarea,button:not([disabled]),[tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const leadModal = document.getElementById('lead-modal');
  if (leadModal && leadModal.classList.contains('open')) { trapFocus(leadModal, e); return; }
  const mortModal = document.getElementById('mortgage-modal');
  if (mortModal && mortModal.classList.contains('open')) { trapFocus(mortModal, e); }
});

// ==========================================
// INIT
// ==========================================
async function init(): Promise<void> {
  const slug = getAgentSlug();
  if (!slug) { showPage('error'); return; }

  // Show skeleton shimmer immediately
  document.getElementById('loading')?.classList.add('hidden');
  document.getElementById('skeleton')?.classList.remove('hidden');

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
    // The select query fetches a partial column set; cast to Agent for downstream functions
    // that expect the full row type. All referenced fields are present in the select list.
    const agentData = agent as unknown as Agent;

    // Check ownership once — used both for the pending-profile gate and the edit button.
    const ownerToken = localStorage.getItem('sd_edit_token');
    let isOwner = false;
    if (ownerToken) {
      try {
        const res = await fetch(SUPABASE_URL + '/functions/v1/verify-magic-link', { // await-ok: conditional on ownerToken, depends on agent.id from prior query
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: ownerToken })
        });
        if (res.ok) {
          const data = await res.json() as { agent?: { id: string } };
          if (data.agent && data.agent.id === agentData.id) isOwner = true;
        }
      } catch (_e) { /* silently fail — not critical */ }
    }

    if (agentData.verification_status !== 'verified') {
      if (!isOwner) {
        const pendingNameEl = document.getElementById('pending-agent-name');
        if (pendingNameEl) pendingNameEl.textContent = agentData.name || 'This agent';
        showPage('pending');
        return;
      }
      // Owner viewing their own pending profile — show banner, continue to render
      document.getElementById('verification-pending-banner')?.classList.remove('hidden');
    }

    renderAgent(agentData);

    // Non-critical enhancements — failures here don't break the profile
    try { injectSchemaOrg(agentData); } catch (e) { console.error('[schema-org]', e); }
    try { hydrateOgMeta(agentData); } catch (e) { console.error('[og-meta]', e); }
    try { trackPageView(agentData.id); } catch (e) { console.error('[analytics]', e); }
    // Pass pre-resolved isOwner to avoid a second verify-magic-link network call.
    // showEditButtonIfOwner falls back to its own fetch only if called without the second argument.
    try { void showEditButtonIfOwner(agentData, ownerToken ? isOwner : undefined); } catch (e) { console.error('[owner-check]', e); }

    // Detect /a/[agent-slug]/project/[project-slug] sub-path
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    // pathParts: ['a', 'agent-slug', 'project', 'project-slug']
    const projectSlugPart = pathParts[3];
    if (pathParts[2] === 'project' && projectSlugPart) {
      const projectSlug = decodeURIComponent(projectSlugPart);
      setTimeout(() => void import('./project-detail').then(m => m.openProjectDetail(projectSlug)).catch((e: unknown) => {
        console.error('[project-detail] sub-path load failed:', e);
        showFeatureError('project-detail');
      }), 100);
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('open') === 'lead') {
      setTimeout(() => window.openLead?.(), 500);
    }
  } catch (e) {
    clearTimeout(timeout);
    console.error('Init error:', e);
    const errMsg = e instanceof Error ? e.message : String(e);
    const errStack = e instanceof Error ? e.stack : undefined;
    window.__sdTrackError?.('Agent init failed: ' + errMsg, { slug, stack: errStack });
    showPage('error');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void init());
} else {
  void init();
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
function showOfflineBanner(show: boolean): void {
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
