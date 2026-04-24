// ==========================================
// AGENT PAGE RENDERING
// ==========================================

import { logEvent } from './analytics';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';
import { ICONS } from './icons';
import { loadProperties, optimizeImg } from './properties';
import type { Agent } from './state';
import { currentAgent, setCurrentAgent } from './state';
import { escAttr, escHtml, safeTrackingId, safeUrl } from './utils';

// ==========================================
// VCARD GENERATOR
// ==========================================
window.saveContact = () => {
  if (!currentAgent) return;
  const a = currentAgent;
  const nameParts = (a.name ?? '').split(' ');
  const firstName = nameParts[0] ?? '';
  const lastName = nameParts.slice(1).join(' ') || '';
  const waNum = (a.whatsapp || '').replace(/[^0-9+]/g, '');
  const profileUrl = `https://sellingdubai.ae/a/${a.slug}`;

  const vcard: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${lastName};${firstName};;;`,
    `FN:${a.name ?? ''}`,
  ];
  if (a.agency_name) vcard.push(`ORG:${a.agency_name}`);
  if (a.tagline) vcard.push(`TITLE:${a.tagline}`);
  if (waNum) vcard.push(`TEL;TYPE=CELL:${waNum}`);
  if (a.email) vcard.push(`EMAIL;TYPE=WORK:${a.email}`);
  vcard.push(`URL:${profileUrl}`);
  if (a.instagram_url) vcard.push(`X-SOCIALPROFILE;TYPE=instagram:${a.instagram_url}`);
  if (a.linkedin_url) vcard.push(`X-SOCIALPROFILE;TYPE=linkedin:${a.linkedin_url}`);
  if (a.photo_url) vcard.push(`PHOTO;VALUE=URI:${a.photo_url}`);
  vcard.push(`NOTE:Dubai Real Estate Agent | SellingDubai.ae`);
  vcard.push('END:VCARD');

  const vcardStr = vcard.join('\r\n');
  const blob = new Blob([vcardStr], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${a.slug}.vcf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  logEvent('link_click', { link_type: 'save_contact' });
};

// ==========================================
// RENDER AGENT PAGE
// ==========================================
export function showPage(id: string): void {
  document.getElementById('loading')?.classList.add('hidden');
  document.getElementById('skeleton')?.classList.add('hidden');
  document.getElementById('error')?.classList.add('hidden');
  document.getElementById('pending')?.classList.add('hidden');
  document.getElementById('agent-page')?.classList.add('hidden');
  // Hide SSR hero injected by og-injector edge function
  const ssrHero = document.getElementById('ssr-hero');
  if (ssrHero) ssrHero.style.display = 'none';
  document.getElementById(id)?.classList.remove('hidden');
}

// Returns true if the agent's paid tier is still active (handles 7-day grace on past_due).
function isPaidTier(agent: Agent): boolean {
  if (!agent.tier || agent.tier === 'free') return false;
  if (agent.stripe_subscription_status === 'canceled') return false;
  if (agent.stripe_subscription_status === 'past_due' && agent.stripe_current_period_end) {
    const graceEnd = new Date(agent.stripe_current_period_end);
    graceEnd.setDate(graceEnd.getDate() + 7);
    if (new Date() > graceEnd) return false;
  }
  return true;
}

const DEFAULT_BG = 'https://sellingdubai.ae/.netlify/images?url=https%3A%2F%2Fpjyorgedaxevxophpfib.supabase.co%2Fstorage%2Fv1%2Fobject%2Fpublic%2Fagent-images%2Fdubai-skyline.jpg&w=1200&fm=webp&q=80';
const DEFAULT_BG_RAW = 'https://pjyorgedaxevxophpfib.supabase.co/storage/v1/object/public/agent-images/dubai-skyline.jpg';

export async function renderAgent(agent: Agent): Promise<void> {
  setCurrentAgent(agent);
  const bg = document.getElementById('bg');
  // Custom background is a Pro/Premium feature
  const bgUrl = (isPaidTier(agent) && safeUrl(agent.background_image_url ?? null)) || DEFAULT_BG;
  // Double-check the URL doesn't contain CSS-breaking characters
  if (bg && bgUrl && /^https?:\/\//.test(bgUrl)) {
    const applyBg = (url: string) => {
      bg.style.backgroundImage = `url('${url.replace(/'/g, "\\'")}')`;
      bg.classList.remove('bg-fallback');
    };
    const probe = new Image();
    let triedRaw = false;
    probe.onload = () => { applyBg(probe.src); };
    probe.onerror = () => {
      if (!triedRaw && bgUrl === DEFAULT_BG) {
        triedRaw = true;
        probe.src = DEFAULT_BG_RAW;
        return;
      }
      bg.style.backgroundImage = '';
    };
    probe.src = bgUrl;
  }

  // Avatar with error fallback
  const avatarContainer = document.getElementById('avatar-container');
  const safeInitials = escHtml((agent.name || '').split(' ').map(n => (n[0] ?? '')).join('').slice(0, 2));
  const isVerified = agent.verification_status === 'verified' || agent.dld_verified;
  const SAFE_CDN_DOMAINS = ['supabase.co', 'netlify.app', 'sellingdubai.ae'];
  if (agent.photo_url && avatarContainer) {
    const img = document.createElement('img');
    img.className = `avatar${isVerified ? ' avatar-verified' : ''}`;
    const canOptimize = SAFE_CDN_DOMAINS.some(d => agent.photo_url!.includes(d));
    img.src = canOptimize ? optimizeImg(agent.photo_url, 200) : agent.photo_url;
    if (canOptimize) {
      img.srcset = `${optimizeImg(agent.photo_url, 80)} 80w, ${optimizeImg(agent.photo_url, 160)} 160w`;
      img.sizes = '80px';
    }
    img.width = 80;
    img.height = 80;
    img.alt = agent.name ?? '';
    let triedRaw = false;
    img.onerror = () => {
      if (canOptimize && !triedRaw) {
        triedRaw = true;
        img.removeAttribute('srcset');
        img.src = agent.photo_url!;
        return;
      }
      if (avatarContainer) avatarContainer.innerHTML = `<div class="avatar-fallback${isVerified ? ' avatar-verified' : ''}">${safeInitials}</div>`;
    };
    avatarContainer.innerHTML = '';
    avatarContainer.appendChild(img);
  } else if (avatarContainer) {
    avatarContainer.innerHTML = `<div class="avatar-fallback${isVerified ? ' avatar-verified' : ''}">${safeInitials}</div>`;
  }

  const agentNameEl = document.getElementById('agent-name');
  if (agentNameEl) agentNameEl.textContent = agent.name ?? '';
  if (agent.verification_status === 'verified') {
    document.getElementById('verified-badge')?.classList.remove('hidden');
  }

  const agentBioEl = document.getElementById('agent-bio');
  if (agentBioEl) agentBioEl.textContent = agent.tagline || '';

  // Trust bar — single consolidated verification line
  const trustBar = document.getElementById('trust-bar');
  const trustChips: string[] = [];
  if (agent.dld_broker_number || agent.broker_number) {
    trustChips.push(`<span class="trust-chip">BRN ${escHtml(String(agent.dld_broker_number ?? agent.broker_number ?? ''))}</span>`);
  }
  if (agent.dld_verified || agent.verification_status === 'verified') {
    trustChips.push(`<span class="trust-chip trust-chip-active"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg> RERA Licensed</span>`);
  }
  if (trustBar && trustChips.length) {
    trustBar.innerHTML = trustChips.join('');
    trustBar.classList.remove('hidden');
  }

  // DLD transaction stats — only show if agent has actual deal data (> 0)
  const dldStatsEl = document.getElementById('dld-stats');
  const hasDldDeals = agent.dld_total_deals && agent.dld_total_deals > 0;
  const hasDldVolume = agent.dld_total_volume_aed && agent.dld_total_volume_aed > 0;
  if (dldStatsEl && (hasDldDeals || hasDldVolume)) {
    let statsHtml = '<div class="dld-stats-row">';
    if (hasDldDeals) {
      statsHtml += `<div class="dld-stat"><span class="dld-stat-value">${agent.dld_total_deals}</span><span class="dld-stat-label">DLD Transactions</span></div>`;
    }
    if (hasDldVolume) {
      const vol = (agent.dld_total_volume_aed ?? 0) >= 1000000
        ? `AED ${((agent.dld_total_volume_aed ?? 0) / 1000000).toFixed(1).replace(/\.0$/, '')}M`
        : `AED ${(agent.dld_total_volume_aed ?? 0).toLocaleString()}`;
      statsHtml += `<div class="dld-stat"><span class="dld-stat-value">${vol}</span><span class="dld-stat-label">Total Volume</span></div>`;
    }
    statsHtml += '</div>';
    dldStatsEl.innerHTML = statsHtml;
    dldStatsEl.classList.remove('hidden');
  }

  // Agency badge — Pro/Premium feature (logo requires paid tier; name alone shows for all)
  const agencyEl = document.getElementById('agency-badge');
  if (agencyEl && (agent.agency_name || (isPaidTier(agent) && agent.agency_logo_url))) {
    let badgeHTML = '';
    if (isPaidTier(agent) && agent.agency_logo_url) {
      const canOptimizeLogo = SAFE_CDN_DOMAINS.some(d => agent.agency_logo_url!.includes(d));
      const logoSrc = canOptimizeLogo ? optimizeImg(agent.agency_logo_url, 120) : agent.agency_logo_url;
      badgeHTML += `<img class="agency-logo" src="${escAttr(logoSrc)}" alt="" data-managed data-onerror="hide">`;
    }
    if (agent.agency_name) badgeHTML += `<span class="agency-name">${escHtml(agent.agency_name)}</span>`;
    agencyEl.innerHTML = badgeHTML;
    agencyEl.classList.remove('hidden');
  }

  // SEO — upsert meta tags (prevents duplicates on re-render)
  document.title = `${agent.name} | SellingDubai`;

  function upsertMeta(attr: string, key: string, content: string): void {
    let tag = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
    if (!tag) { tag = document.createElement('meta'); tag.setAttribute(attr, key); document.head.appendChild(tag); }
    tag.content = content;
  }

  upsertMeta('name', 'description', `${agent.name} — ${agent.tagline || 'Dubai Real Estate Agent'} | SellingDubai`);

  const ogTags: Record<string, string> = {
    'og:title': `${agent.name} | SellingDubai`,
    'og:description': agent.tagline || 'Dubai Real Estate Agent',
    'og:image': agent.photo_url ? optimizeImg(agent.photo_url, 1200) : DEFAULT_BG,
    'og:type': 'profile',
    'og:url': window.location.href,
    'og:site_name': 'SellingDubai'
  };
  Object.entries(ogTags).forEach(([prop, content]) => {
    if (content) upsertMeta('property', prop, content);
  });

  // === BUTTONS ===
  const linksEl = document.getElementById('links');
  let buttonsHTML = '';

  if (agent.whatsapp) {
    const waNum = agent.whatsapp.replace(/[^0-9]/g, '');
    const waMsg = encodeURIComponent(`Hi ${agent.name}, I found your profile on SellingDubai and I'm interested in Dubai properties.`);
    const waUrl = `https://wa.me/${waNum}?text=${waMsg}`;
    const firstName = (agent.name || '').split(' ')[0] || 'Me';
    buttonsHTML += `<a href="${escAttr(waUrl)}" target="_blank" rel="noopener noreferrer" class="link-btn link-btn-wa" data-track="whatsapp" data-url="${escAttr(waUrl)}">
      <span class="btn-icon">${ICONS.whatsapp}</span> WhatsApp ${escHtml(firstName)}
    </a>`;
  }

  // Portfolio in the primary secondary slot (replaces Enquiry/Calendly)
  buttonsHTML += `<button class="link-btn link-btn-glass" data-action="openProps" data-track="listings" style="width:100%">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="opacity:0.7"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
    Portfolio
  </button>`;

  const showPreapproval = agent.show_preapproval !== false;
  if (showPreapproval) {
    buttonsHTML += `<button class="link-btn link-btn-glass" data-action="openMortgage" data-track="mortgage" style="width:100%;border:none;cursor:pointer;">
      <span class="btn-icon" style="width:16px;height:16px;">${ICONS.shield}</span>
      Get Pre-Approved
    </button>`;
  }



  if (linksEl) linksEl.innerHTML = buttonsHTML;

  void loadProperties(agent.id);
  // Off-plan section hidden for core flow — re-enable when off-plan UX is ready
  // void loadRemProjects(agent.slug ?? '', agent.id);

  // === SOCIAL ICONS ===
  const socialsEl = document.getElementById('socials');
  type SocialLink = { url: string; icon: string; type: string; label: string };
  const socialLinks: SocialLink[] = [];
  const instagramUrl = safeUrl(agent.instagram_url ?? null);
  const youtubeUrl = safeUrl(agent.youtube_url ?? null);
  const tiktokUrl = safeUrl(agent.tiktok_url ?? null);
  const linkedinUrl = safeUrl(agent.linkedin_url ?? null);
  if (instagramUrl) socialLinks.push({ url: instagramUrl, icon: ICONS.instagram ?? '', type: 'instagram', label: 'Instagram' });
  if (youtubeUrl) socialLinks.push({ url: youtubeUrl, icon: ICONS.youtube ?? '', type: 'youtube', label: 'YouTube' });
  if (tiktokUrl) socialLinks.push({ url: tiktokUrl, icon: ICONS.tiktok ?? '', type: 'tiktok', label: 'TikTok' });
  if (linkedinUrl) socialLinks.push({ url: linkedinUrl, icon: ICONS.linkedin ?? '', type: 'linkedin', label: 'LinkedIn' });

  if (socialsEl) {
    socialsEl.innerHTML = socialLinks.map(s =>
      `<a href="${escAttr(s.url)}" target="_blank" rel="noopener noreferrer" aria-label="${s.label}" data-track="${s.type}" data-url="${escAttr(s.url)}">${s.icon}</a>`
    ).join('');
  }

  // === TRACKING SCRIPTS (Pro/Premium only) ===
  // Respect cookie consent — skip tracking if the visitor rejected analytics
  const _cookieConsent = (() => { try { return localStorage.getItem('sd_cookie_consent'); } catch(_e) { return null; } })();
  const _trackingAllowed = _cookieConsent !== 'reject';

  const safeFbPixel = isPaidTier(agent) && _trackingAllowed ? safeTrackingId(agent.facebook_pixel_id ?? null) : null;
  if (safeFbPixel) {
    // Facebook Pixel init (inline IIFE pattern — approved third-party per CLAUDE.md)
    ((f: Window & typeof globalThis, b: Document, e: string, v: string) => {
      type FbqFn = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue: unknown[]; push: (...args: unknown[]) => void; loaded: boolean; version: string; _fbq?: FbqFn };
      const w = f as Window & { fbq?: FbqFn; _fbq?: FbqFn };
      if (w.fbq) return;
      const n: FbqFn = ((...args: unknown[]) => {
        if (n.callMethod) n.callMethod(...args); else n.queue.push(args);
      }) as FbqFn;
      n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
      if (!w._fbq) w._fbq = n;
      w.fbq = n;
      const t = b.createElement(e) as HTMLScriptElement;
      t.async = true; t.src = v;
      const s = b.getElementsByTagName(e)[0];
      if (s) s.parentNode?.insertBefore(t, s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    const fbq = (window as Window & { fbq?: (...args: unknown[]) => void }).fbq;
    if (fbq) { fbq('init', safeFbPixel); fbq('track', 'PageView'); }
  }
  const safeGaId = isPaidTier(agent) && _trackingAllowed ? safeTrackingId(agent.ga4_measurement_id ?? null) : null;
  if (safeGaId) {
    window.__sd_ga_id = safeGaId; // expose so cookie consent opt-out can disable the correct property
    const gaScript = document.createElement('script');
    gaScript.async = true;
    gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${safeGaId}`;
    document.head.appendChild(gaScript);
    (window as Window & { dataLayer?: unknown[] }).dataLayer = (window as Window & { dataLayer?: unknown[] }).dataLayer || [];
    function gtag(...args: unknown[]) { ((window as Window & { dataLayer?: unknown[] }).dataLayer!).push(args); }
    (window as Window & { gtag?: (...args: unknown[]) => void }).gtag = gtag;
    gtag('js', new Date());
    gtag('config', safeGaId);
  }

  showPage('agent-page');

  // === INTENT SECTION ===
  const intentSection = document.getElementById('intent-section') as HTMLElement | null;
  if (intentSection) intentSection.classList.remove('hidden');

  // === TESTIMONIALS (non-blocking) ===
  void loadProfileTestimonials(agent.id);

  // === STICKY BOTTOM CTA BAR ===
  const stickyCta = document.getElementById('sticky-cta') as HTMLElement | null;
  const stickyWaBtn = document.getElementById('sticky-wa-btn') as HTMLElement | null;
  if (stickyCta) {
    // Wire WhatsApp button — only show if agent has WhatsApp
    if (agent.whatsapp && stickyWaBtn) {
      const waNum = agent.whatsapp.replace(/[^0-9]/g, '');
      const waMsg = encodeURIComponent(`Hi ${agent.name}, I found your profile on SellingDubai and I'm interested in Dubai properties.`);
      stickyWaBtn.style.display = 'flex';
      stickyWaBtn.onclick = () => {
        window.open(`https://wa.me/${waNum}?text=${waMsg}`, '_blank');
        logEvent('whatsapp_tap', { source: 'sticky_cta' });
      };
    }
    // Show/hide on scroll — appears after scrolling past link buttons
    const linksSection = document.getElementById('links');
    let stickyVisible = false;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const isVisible = entry.isIntersecting;
      if (!isVisible && !stickyVisible) {
        stickyCta.style.display = 'block';
        requestAnimationFrame(() => { stickyCta.classList.add('visible'); });
        stickyVisible = true;
      } else if (isVisible && stickyVisible) {
        stickyCta.classList.remove('visible');
        setTimeout(() => { if (!stickyCta.classList.contains('visible')) stickyCta.style.display = 'none'; }, 300);
        stickyVisible = false;
      }
    }, { threshold: 0 });
    if (linksSection) observer.observe(linksSection);
  }
}

// ==========================================
// SHARE (Native)
// ==========================================
window.nativeShare = async () => {
  const url = window.location.href;
  const name = currentAgent ? currentAgent.name : 'this agent';
  const shareData = {
    title: `${name} — SellingDubai`,
    text: `Check out ${name}'s verified agent profile on SellingDubai`,
    url: url
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      const btn = document.getElementById('nav-share-btn');
      if (btn) {
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#25d366" stroke-width="2.5" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>';
        setTimeout(() => { btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>'; }, 2000);
      }
    }
    if (currentAgent) logEvent('share', { method: 'share' in navigator ? 'native' : 'clipboard' });
  } catch (_e) { /* user cancelled share sheet */ }
};

// ==========================================
// TESTIMONIALS — fetch and render on profile
// ==========================================
export async function loadProfileTestimonials(agentId: string): Promise<void> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/testimonials?agent_id=eq.${encodeURIComponent(agentId)}&select=client_name,client_role,content,rating&order=created_at.desc&limit=6`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (!res.ok) return;
    const items = await res.json() as Array<{ client_name: string; client_role?: string; content: string; rating: number }>;
    if (!items?.length) return;

    const section = document.getElementById('profile-testimonials');
    if (!section) return;

    section.innerHTML = `
      <div class="testimonials-heading">What clients say</div>
      <div class="testimonials-grid">
        ${items.map(t => `
          <div class="profile-testimonial">
            <div class="profile-testimonial-stars">${'★'.repeat(Math.min(5, t.rating || 5))}</div>
            <div class="profile-testimonial-text">"${escHtml(t.content)}"</div>
            <div class="profile-testimonial-client">
              <span class="profile-testimonial-name">${escHtml(t.client_name)}</span>
              ${t.client_role ? `<span class="profile-testimonial-role">${escHtml(t.client_role)}</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
    section.classList.remove('hidden');
  } catch (_e) { /* non-critical */ }
}

// ==========================================
// OWNER DETECTION — show Edit button if logged in
// ==========================================
export async function showEditButtonIfOwner(agent: Agent, preResolvedIsOwner?: boolean): Promise<void> {
  // If the caller already verified ownership (e.g. init.ts for pending profiles),
  // skip the network call and use the pre-resolved result directly.
  if (preResolvedIsOwner !== undefined) {
    if (preResolvedIsOwner) {
      const editBtn = document.getElementById('nav-edit-btn') as HTMLAnchorElement | null;
      if (editBtn) {
        editBtn.href = '/edit';
        editBtn.classList.remove('hidden');
      }
      // Hide "Get Your Page" since they already have one
    }
    return;
  }

  // Fallback: make the network call when no pre-resolved result is available.
  const token = localStorage.getItem('sd_edit_token');
  if (!token) return;
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: ctrl.signal
    });
    clearTimeout(tid);
    if (!res.ok) return;
    const data = await res.json() as { agent?: { id: string } };
    if (data.agent && data.agent.id === agent.id) {
      const editBtn = document.getElementById('nav-edit-btn') as HTMLAnchorElement | null;
      if (editBtn) {
        editBtn.href = '/edit';
        editBtn.classList.remove('hidden');
      }
    }
  } catch (_e) { /* silently fail — not critical */ }
}

// ==========================================
// SEO HELPERS
// ==========================================
export function injectSchemaOrg(agent: Agent): void {
  try {
    const schema: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'RealEstateAgent',
      'name': agent.name || '',
      'description': agent.tagline || '',
      'url': window.location.href,
      'image': agent.photo_url || '',
      'address': { '@type': 'PostalAddress', 'addressLocality': 'Dubai', 'addressCountry': 'AE' }
    };
    if (agent.email) schema.email = agent.email;
    if (agent.whatsapp) schema.telephone = `+${agent.whatsapp}`;
    if (agent.agency_name) schema.worksFor = { '@type': 'Organization', 'name': agent.agency_name };
    const el = document.getElementById('schema-agent');
    if (el) el.textContent = JSON.stringify(schema);
  } catch (_e) { /* non-critical */ }
}

export function hydrateOgMeta(agent: Agent): void {
  try {
    const url = window.location.href;
    const title = agent.name ? `${agent.name} — Dubai Real Estate Agent | SellingDubai` : 'SellingDubai';
    const desc = agent.tagline || 'Dubai real estate agent profile — verified listings, off-plan projects, and direct contact.';
    document.title = title;
    const setMeta = (id: string, val: string) => { const el = document.getElementById(id); if (el) el.setAttribute('content', val); };
    setMeta('og-title', title);
    setMeta('og-desc', desc);
    setMeta('og-url', url);
    const ogImage = agent.photo_url ? optimizeImg(agent.photo_url, 1200) : DEFAULT_BG;
    setMeta('og-image', ogImage);
    // Update Twitter meta tags
    setMeta('twitter-title', title);
    setMeta('twitter-description', desc);
    setMeta('twitter-image', ogImage);
    const canon = document.getElementById('canonical-url');
    if (canon) canon.setAttribute('href', url);
    // Update meta description
    const descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) descMeta.setAttribute('content', desc);
  } catch (_e) { /* non-critical */ }
}

// === AGENT SEARCH (error page) ===
window.searchAgent = async () => {
  const { supabase: sb } = await import('./config');
  const query = (document.getElementById('agent-search') as HTMLInputElement | null)?.value.trim() ?? '';
  if (!query || query.length < 2) return;

  const { data: agents } = await sb
    .from('agents')
    .select('name, slug')
    .eq('verification_status', 'verified')
    .ilike('name', `%${query}%`)
    .limit(5);

  const resultsEl = document.getElementById('search-results') as HTMLElement | null;
  if (!resultsEl) return;
  if (agents && agents.length > 0) {
    resultsEl.style.display = 'block';
    resultsEl.innerHTML = agents.map(a =>
      `<a href="/a/${escAttr(a.slug ?? '')}" style="display:block;padding:12px 16px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#fff;text-decoration:none;font-size:14px;font-weight:600;margin-bottom:6px;transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.12)'" onmouseout="this.style.background='rgba(255,255,255,0.06)'">${escHtml(a.name ?? '')}</a>`
    ).join('');
  } else {
    resultsEl.style.display = 'block';
    resultsEl.innerHTML = '<p style="color:rgba(255,255,255,0.55);font-size:13px;text-align:center;padding:8px;">No agents found — try another name</p>';
  }
};
