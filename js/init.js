// ==========================================
// APP INITIALIZATION
// ==========================================
import { supabase } from './config.js';
import { getAgentSlug } from './utils.js';
import { trackPageView } from './analytics.js';
import { showPage, renderAgent, injectSchemaOrg, hydrateOgMeta, showEditButtonIfOwner } from './agent-page.js';

// Side-effect imports — each wrapped so one failure doesn't kill the app
async function loadModules() {
  const modules = [
    ['gallery',         () => import('./gallery.js')],
    ['property-detail', () => import('./property-detail.js')],
    ['lead-modal',      () => import('./lead-modal.js')],
    ['filters',         () => import('./filters.js')],
  ];
  await Promise.all(modules.map(async ([name, load]) => {
    try { await load(); }
    catch (e) { console.error(`[${name}] failed to load:`, e); }
  }));
}
loadModules();

// mortgage.js is lazy-loaded on first openMortgage() call
window.openMortgage = async function() {
  try {
    await import('./mortgage.js');
    window.openMortgage();
  } catch (e) {
    console.error('[mortgage] failed to load:', e);
  }
};

// ==========================================
// KEYBOARD NAVIGATION
// ==========================================
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const mortModal = document.getElementById('mortgage-modal');
    if (mortModal && mortModal.classList.contains('open')) { closeMortgage(); return; }
    if (document.getElementById('photo-viewer').classList.contains('open')) { closePhotoViewer(); return; }
    if (document.getElementById('gallery-overlay').classList.contains('open')) { closeFullGallery(); return; }
    if (document.getElementById('detail-overlay').classList.contains('open')) { closeDetail(); return; }
    if (document.getElementById('filters-overlay').classList.contains('open')) { closeFilters(); return; }
    if (document.getElementById('prop-overlay').classList.contains('open')) closeProps();
    if (document.getElementById('lead-modal').classList.contains('open')) closeLead();
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
  if (leadModal && leadModal.classList.contains('open')) { trapFocus(leadModal, e); return; }
  const mortModal = document.getElementById('mortgage-modal');
  if (mortModal && mortModal.classList.contains('open')) { trapFocus(mortModal, e); }
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
    const { data: agent, error } = await supabase
      .from('agents')
      .select('id,slug,name,photo_url,background_image_url,verification_status,tagline,bio,phone,dld_broker_number,broker_number,dld_total_deals,dld_total_volume_aed,dld_verified,agency_name,agency_logo_url,whatsapp,email,calendly_url,custom_link_1_url,custom_link_1_label,custom_link_2_url,custom_link_2_label,instagram_url,youtube_url,tiktok_url,linkedin_url,facebook_pixel_id,ga4_measurement_id,show_golden_visa,show_preapproval,tier,referral_code,stripe_subscription_status,stripe_current_period_end')
      .eq('slug', slug)
      .single();

    clearTimeout(timeout);

    if (error || !agent) { showPage('error'); return; }

    if (agent.verification_status !== 'verified') {
      document.getElementById('pending-agent-name').textContent = agent.name || 'This agent';
      showPage('pending');
      return;
    }

    renderAgent(agent);

    // Non-critical enhancements — failures here don't break the profile
    try { injectSchemaOrg(agent); } catch (e) { console.error('[schema-org]', e); }
    try { hydrateOgMeta(agent); } catch (e) { console.error('[og-meta]', e); }
    try { trackPageView(agent.id); } catch (e) { console.error('[analytics]', e); }
    try { showEditButtonIfOwner(agent); } catch (e) { console.error('[owner-check]', e); }

    // Detect /a/[agent-slug]/project/[project-slug] sub-path
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    // pathParts: ['a', 'agent-slug', 'project', 'project-slug']
    if (pathParts[2] === 'project' && pathParts[3]) {
      const projectSlug = decodeURIComponent(pathParts[3]);
      setTimeout(() => import('./project-detail.js').then(m => m.openProjectDetail(projectSlug)), 100);
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('open') === 'lead') {
      setTimeout(() => window.openLead(), 500);
    }
  } catch (e) {
    clearTimeout(timeout);
    console.error('Init error:', e);
    if (window.__sdTrackError) window.__sdTrackError('Agent init failed: ' + e.message, { slug: slug, stack: e.stack });
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
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#f59e0b;color:#000;text-align:center;padding:8px 16px;font-family:Inter,sans-serif;font-size:13px;font-weight:600;transition:transform 0.3s;';
    banner.textContent = 'You are offline. Some features may not work.';
    document.body.prepend(banner);
  } else if (!show && banner) {
    banner.remove();
  }
}
window.addEventListener('offline', () => showOfflineBanner(true));
window.addEventListener('online', () => showOfflineBanner(false));
if (!navigator.onLine) showOfflineBanner(true);
