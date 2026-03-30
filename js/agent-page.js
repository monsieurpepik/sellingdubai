// ==========================================
// AGENT PAGE RENDERING
// ==========================================
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from './config.js';
import { escHtml, escAttr, safeUrl, safeTrackingId } from './utils.js';
import { ICONS } from './icons.js';
import { logEvent } from './analytics.js';
import { currentAgent, setCurrentAgent } from './state.js';
import { loadProperties, loadRemProjects, optimizeImg } from './properties.js';

// ==========================================
// VCARD GENERATOR
// ==========================================
window.saveContact = function() {
  if (!currentAgent) return;
  const a = currentAgent;
  const nameParts = a.name.split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';
  const waNum = (a.whatsapp || '').replace(/[^0-9+]/g, '');
  const profileUrl = `https://sellingdubai.ae/a/${a.slug}`;

  let vcard = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${lastName};${firstName};;;`,
    `FN:${a.name}`,
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
export function showPage(id) {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('skeleton').classList.add('hidden');
  document.getElementById('error').classList.add('hidden');
  document.getElementById('pending').classList.add('hidden');
  document.getElementById('agent-page').classList.add('hidden');
  document.getElementById(id).classList.remove('hidden');
}

// Returns true if the agent's paid tier is still active (handles 7-day grace on past_due).
function isPaidTier(agent) {
  if (!agent.tier || agent.tier === 'free') return false;
  if (agent.stripe_subscription_status === 'canceled') return false;
  if (agent.stripe_subscription_status === 'past_due' && agent.stripe_current_period_end) {
    const graceEnd = new Date(agent.stripe_current_period_end);
    graceEnd.setDate(graceEnd.getDate() + 7);
    if (new Date() > graceEnd) return false;
  }
  return true;
}

export async function renderAgent(agent) {
  setCurrentAgent(agent);

  const DEFAULT_BG = 'https://pjyorgedaxevxophpfib.supabase.co/storage/v1/object/public/agent-images/dubai-skyline.jpg';
  const bg = document.getElementById('bg');
  // Custom background is a Pro/Premium feature
  const bgUrl = (isPaidTier(agent) && safeUrl(agent.background_image_url)) || DEFAULT_BG;
  // Double-check the URL doesn't contain CSS-breaking characters
  if (bgUrl && /^https?:\/\//.test(bgUrl)) {
    bg.style.backgroundImage = `url('${bgUrl.replace(/'/g, "\\'")}')`;
    bg.classList.remove('bg-fallback');
  }

  // Avatar with error fallback
  const avatarContainer = document.getElementById('avatar-container');
  const safeInitials = escHtml((agent.name || '').split(' ').map(n => (n[0] || '')).join('').slice(0, 2));
  const isVerified = agent.verification_status === 'verified' || agent.dld_verified;
  const SAFE_CDN_DOMAINS = ['supabase.co', 'netlify.app', 'sellingdubai.ae', 'googleusercontent.com'];
  if (agent.photo_url) {
    const img = document.createElement('img');
    img.className = 'avatar' + (isVerified ? ' avatar-verified' : '');
    const canOptimize = SAFE_CDN_DOMAINS.some(d => agent.photo_url.includes(d));
    img.src = canOptimize ? optimizeImg(agent.photo_url, 200) : agent.photo_url;
    img.alt = agent.name || '';
    img.onerror = function() { avatarContainer.innerHTML = `<div class="avatar-fallback${isVerified ? ' avatar-verified' : ''}">${safeInitials}</div>`; };
    avatarContainer.innerHTML = '';
    avatarContainer.appendChild(img);
  } else {
    avatarContainer.innerHTML = `<div class="avatar-fallback${isVerified ? ' avatar-verified' : ''}">${safeInitials}</div>`;
  }

  document.getElementById('agent-name').textContent = agent.name;
  if (agent.verification_status === 'verified') {
    document.getElementById('verified-badge').classList.remove('hidden');
  }

  document.getElementById('agent-bio').textContent = agent.tagline || '';

  // Trust bar — single consolidated verification line
  const trustBar = document.getElementById('trust-bar');
  let trustChips = [];
  if (agent.dld_broker_number || agent.broker_number) {
    trustChips.push(`<span class="trust-chip">BRN ${escHtml(agent.dld_broker_number || agent.broker_number)}</span>`);
  }
  if (agent.dld_verified) {
    trustChips.push(`<span class="trust-chip trust-chip-active"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg> DLD Verified</span>`);
  } else if (agent.verification_status === 'verified') {
    trustChips.push(`<span class="trust-chip trust-chip-active"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg> RERA Licensed</span>`);
  }
  if (trustChips.length) {
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
      const vol = agent.dld_total_volume_aed >= 1000000
        ? 'AED ' + (agent.dld_total_volume_aed / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
        : 'AED ' + agent.dld_total_volume_aed.toLocaleString();
      statsHtml += `<div class="dld-stat"><span class="dld-stat-value">${vol}</span><span class="dld-stat-label">Total Volume</span></div>`;
    }
    statsHtml += '</div>';
    dldStatsEl.innerHTML = statsHtml;
    dldStatsEl.classList.remove('hidden');
  }

  // Agency badge — Pro/Premium feature (logo requires paid tier; name alone shows for all)
  const agencyEl = document.getElementById('agency-badge');
  if (agent.agency_name || (isPaidTier(agent) && agent.agency_logo_url)) {
    let badgeHTML = '';
    if (isPaidTier(agent) && agent.agency_logo_url) {
      const canOptimizeLogo = SAFE_CDN_DOMAINS.some(d => agent.agency_logo_url.includes(d));
      const logoSrc = canOptimizeLogo ? optimizeImg(agent.agency_logo_url, 120) : agent.agency_logo_url;
      badgeHTML += `<img class="agency-logo" src="${escAttr(logoSrc)}" alt="" onerror="this.style.display='none'">`;
    }
    if (agent.agency_name) badgeHTML += `<span class="agency-name">${escHtml(agent.agency_name)}</span>`;
    agencyEl.innerHTML = badgeHTML;
    agencyEl.classList.remove('hidden');
  }

  // SEO — upsert meta tags (prevents duplicates on re-render)
  document.title = `${agent.name} | SellingDubai`;

  function upsertMeta(attr, key, content) {
    let tag = document.querySelector(`meta[${attr}="${key}"]`);
    if (!tag) { tag = document.createElement('meta'); tag.setAttribute(attr, key); document.head.appendChild(tag); }
    tag.content = content;
  }

  upsertMeta('name', 'description', `${agent.name} — ${agent.tagline || 'Dubai Real Estate Agent'} | SellingDubai`);

  const ogTags = {
    'og:title': `${agent.name} | SellingDubai`,
    'og:description': agent.tagline || 'Dubai Real Estate Agent',
    'og:image': agent.photo_url || DEFAULT_BG,
    'og:type': 'profile',
    'og:url': window.location.href,
    'og:site_name': 'SellingDubai'
  };
  Object.entries(ogTags).forEach(([prop, content]) => {
    if (content) upsertMeta('property', prop, content);
  });

  // === JSON-LD STRUCTURED DATA ===
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    'name': agent.name,
    'url': window.location.href,
    'description': agent.tagline || 'Dubai Real Estate Agent',
  };
  if (agent.photo_url) jsonLd.image = agent.photo_url;
  if (agent.agency_name) jsonLd.worksFor = { '@type': 'Organization', 'name': agent.agency_name };
  if (agent.whatsapp) jsonLd.telephone = agent.whatsapp;
  if (agent.email) jsonLd.email = agent.email;
  jsonLd.address = { '@type': 'PostalAddress', 'addressLocality': 'Dubai', 'addressCountry': 'AE' };
  // Remove any existing JSON-LD before inserting
  const existingLd = document.querySelector('script[type="application/ld+json"]');
  if (existingLd) existingLd.remove();
  const ldScript = document.createElement('script');
  ldScript.type = 'application/ld+json';
  ldScript.textContent = JSON.stringify(jsonLd);
  document.head.appendChild(ldScript);

  // === BUTTONS ===
  const linksEl = document.getElementById('links');
  let buttonsHTML = '';

  if (agent.whatsapp) {
    const waNum = agent.whatsapp.replace(/[^0-9]/g, '');
    const waMsg = encodeURIComponent(`Hi ${agent.name}, I found your profile on SellingDubai and I'm interested in Dubai properties.`);
    const waUrl = `https://wa.me/${waNum}?text=${waMsg}`;
    buttonsHTML += `<a href="${escAttr(waUrl)}" target="_blank" rel="noopener noreferrer" class="link-btn link-btn-wa" data-track="whatsapp" data-url="${escAttr(waUrl)}">
      <span class="btn-icon">${ICONS.whatsapp}</span> WhatsApp Me
    </a>`;
  }

  // Calendly booking link is a Pro/Premium feature
  const safeCalendly = isPaidTier(agent) ? safeUrl(agent.calendly_url) : null;
  if (safeCalendly) {
    buttonsHTML += `<a href="${escAttr(safeCalendly)}" target="_blank" rel="noopener noreferrer" class="link-btn" data-track="consultation" data-url="${escAttr(safeCalendly)}">
      <span class="btn-icon">${ICONS.calendar}</span> Get Free Consultation
    </a>`;
  } else {
    buttonsHTML += `<button class="link-btn" onclick="openLead()" data-track="consultation">
      <span class="btn-icon">${ICONS.calendar}</span> Send an Enquiry
    </button>`;
  }

  const showPreapproval = agent.show_preapproval !== false;
  if (showPreapproval) {
    buttonsHTML += `<div class="btn-grid">
      <button class="link-btn link-btn-glass" onclick="openProps()" data-track="listings">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="opacity:0.7"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
        Portfolio
      </button>
      <button class="link-btn link-btn-glass" onclick="openMortgage()" data-track="mortgage" style="border:none;cursor:pointer;">
        <span class="btn-icon" style="width:16px;height:16px;">${ICONS.shield}</span>
        Get Pre-Approved
      </button>
    </div>`;
  } else {
    buttonsHTML += `<button class="link-btn link-btn-glass" onclick="openProps()" data-track="listings" style="width:100%">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="opacity:0.7"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
      Portfolio
    </button>`;
  }

  const safeCustom1 = safeUrl(agent.custom_link_1_url);
  if (safeCustom1 && agent.custom_link_1_label) {
    buttonsHTML += `<a href="${escAttr(safeCustom1)}" target="_blank" rel="noopener noreferrer" class="link-btn link-btn-glass" data-track="custom" data-url="${escAttr(safeCustom1)}">
      ${escHtml(agent.custom_link_1_label)}
    </a>`;
  }
  // Second custom link is a Pro/Premium feature
  const safeCustom2 = isPaidTier(agent) ? safeUrl(agent.custom_link_2_url) : null;
  if (safeCustom2 && agent.custom_link_2_label) {
    buttonsHTML += `<a href="${escAttr(safeCustom2)}" target="_blank" rel="noopener noreferrer" class="link-btn link-btn-glass" data-track="custom" data-url="${escAttr(safeCustom2)}">
      ${escHtml(agent.custom_link_2_label)}
    </a>`;
  }

  buttonsHTML += `<button class="link-btn link-btn-ghost" onclick="saveContact()" data-track="save_contact">
    <span class="btn-icon" style="width:16px;height:16px;opacity:0.6">${ICONS.contact}</span> Save My Contact
  </button>`;

  linksEl.innerHTML = buttonsHTML;

  if (agent.show_golden_visa !== false) {
    document.getElementById('gv-widget').classList.remove('hidden');
  }

  loadProperties(agent.id);
  loadRemProjects(agent.slug, agent.id);

  // === SOCIAL ICONS ===
  const socialsEl = document.getElementById('socials');
  const socialLinks = [];
  if (safeUrl(agent.instagram_url)) socialLinks.push({ url: safeUrl(agent.instagram_url), icon: ICONS.instagram, type: 'instagram', label: 'Instagram' });
  if (safeUrl(agent.youtube_url)) socialLinks.push({ url: safeUrl(agent.youtube_url), icon: ICONS.youtube, type: 'youtube', label: 'YouTube' });
  if (safeUrl(agent.tiktok_url)) socialLinks.push({ url: safeUrl(agent.tiktok_url), icon: ICONS.tiktok, type: 'tiktok', label: 'TikTok' });
  if (safeUrl(agent.linkedin_url)) socialLinks.push({ url: safeUrl(agent.linkedin_url), icon: ICONS.linkedin, type: 'linkedin', label: 'LinkedIn' });

  socialsEl.innerHTML = socialLinks.map(s =>
    `<a href="${escAttr(s.url)}" target="_blank" rel="noopener noreferrer" aria-label="${s.label}" data-track="${s.type}" data-url="${escAttr(s.url)}">${s.icon}</a>`
  ).join('');

  // === TRACKING SCRIPTS (Pro/Premium only) ===
  const safeFbPixel = isPaidTier(agent) ? safeTrackingId(agent.facebook_pixel_id) : null;
  if (safeFbPixel) {
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', safeFbPixel);
    fbq('track', 'PageView');
  }
  const safeGaId = isPaidTier(agent) ? safeTrackingId(agent.ga4_measurement_id) : null;
  if (safeGaId) {
    const gaScript = document.createElement('script');
    gaScript.async = true;
    gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${safeGaId}`;
    document.head.appendChild(gaScript);
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', safeGaId);
  }

  showPage('agent-page');

  // Referral CTA intentionally suppressed on public profiles — not the right context for acquisition.

  // === STICKY BOTTOM CTA BAR ===
  const stickyCta = document.getElementById('sticky-cta');
  const stickyWaBtn = document.getElementById('sticky-wa-btn');
  if (stickyCta) {
    // Wire WhatsApp button
    if (agent.whatsapp) {
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
      const isVisible = entries[0].isIntersecting;
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
window.nativeShare = async function() {
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
      if (navigator.clipboard && navigator.clipboard.writeText) {
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
    if (currentAgent) logEvent('share', { method: navigator.share ? 'native' : 'clipboard' });
  } catch (e) { /* user cancelled share sheet */ }
};

// ==========================================
// OWNER DETECTION — show Edit button if logged in
// ==========================================
export async function showEditButtonIfOwner(agent) {
  const token = localStorage.getItem('sd_edit_token');
  if (!token) return;
  try {
    const res = await fetch(SUPABASE_URL + '/functions/v1/verify-magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.agent && data.agent.id === agent.id) {
      const editBtn = document.getElementById('nav-edit-btn');
      if (editBtn) {
        editBtn.href = '/edit';
        editBtn.classList.remove('hidden');
      }
      // Hide "Get Your Page" since they already have one
      const claimBtn = document.getElementById('nav-claim-btn');
      if (claimBtn) claimBtn.style.display = 'none';
    }
  } catch (e) { /* silently fail — not critical */ }
}

// ==========================================
// SEO HELPERS
// ==========================================
export function injectSchemaOrg(agent) {
  try {
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'RealEstateAgent',
      'name': agent.name || '',
      'description': agent.tagline || '',
      'url': window.location.href,
      'image': agent.photo_url || '',
      'address': { '@type': 'PostalAddress', 'addressLocality': 'Dubai', 'addressCountry': 'AE' }
    };
    if (agent.email) schema.email = agent.email;
    if (agent.whatsapp) schema.telephone = '+' + agent.whatsapp;
    if (agent.agency_name) schema.worksFor = { '@type': 'Organization', 'name': agent.agency_name };
    const el = document.getElementById('schema-agent');
    if (el) el.textContent = JSON.stringify(schema);
  } catch (e) { /* non-critical */ }
}

export function hydrateOgMeta(agent) {
  try {
    const url = window.location.href;
    const title = agent.name ? `${agent.name} — Dubai Real Estate Agent | SellingDubai` : 'SellingDubai';
    const desc = agent.tagline || 'Dubai real estate agent profile — verified listings, off-plan projects, and direct contact.';
    document.title = title;
    const setMeta = (id, val) => { const el = document.getElementById(id); if (el) el.setAttribute('content', val); };
    setMeta('og-title', title);
    setMeta('og-desc', desc);
    setMeta('og-url', url);
    if (agent.photo_url) setMeta('og-image', NETLIFY_IMG_REM(agent.photo_url, 1200));
    // Update Twitter meta tags
    setMeta('twitter-title', title);
    setMeta('twitter-description', desc);
    if (agent.photo_url) setMeta('twitter-image', NETLIFY_IMG_REM(agent.photo_url, 1200));
    const canon = document.getElementById('canonical-url');
    if (canon) canon.setAttribute('href', url);
    // Update meta description
    const descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) descMeta.setAttribute('content', desc);
  } catch (e) { /* non-critical */ }
}

// === AGENT SEARCH (error page) ===
window.searchAgent = async function() {
  const { supabase } = await import('./config.js');
  const query = document.getElementById('agent-search').value.trim();
  if (!query || query.length < 2) return;

  const { data: agents } = await supabase
    .from('agents')
    .select('name, slug')
    .eq('verification_status', 'verified')
    .ilike('name', `%${query}%`)
    .limit(5);

  const resultsEl = document.getElementById('search-results');
  if (agents && agents.length > 0) {
    resultsEl.style.display = 'block';
    resultsEl.innerHTML = agents.map(a =>
      `<a href="/a/${escAttr(a.slug)}" style="display:block;padding:12px 16px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#fff;text-decoration:none;font-size:14px;font-weight:600;margin-bottom:6px;transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.12)'" onmouseout="this.style.background='rgba(255,255,255,0.06)'">${escHtml(a.name)}</a>`
    ).join('');
  } else {
    resultsEl.style.display = 'block';
    resultsEl.innerHTML = '<p style="color:rgba(255,255,255,0.55);font-size:13px;text-align:center;padding:8px;">No agents found — try another name</p>';
  }
};

// === REM OFF-PLAN PROJECTS (boban-pepic test environment only) ===
const NETLIFY_IMG_REM = (url, w) =>
  url ? `/.netlify/images?url=${encodeURIComponent(url)}&w=${w}&fm=webp&q=80` : '';

async function loadRemOffplanProjects() {
  const { data: projects, error } = await supabase
    .from('projects')
    .select('slug, name, cover_image_url, location, district_name, min_price, max_price, property_types, completion_date, status, developers!projects_developer_id_fkey(name)')
    .order('synced_at', { ascending: false })
    .limit(20);

  if (error) { console.error('[REM off-plan] Supabase error:', error); return; }
  if (!projects || projects.length === 0) { console.warn('[REM off-plan] No projects returned'); return; }

  const statusLabel = (s) => s === 'under_construction' ? 'Under Construction' : 'Off Plan';
  const fmtPrice = (n) => n ? 'AED\u00a0' + Number(n).toLocaleString('en-AE', { maximumFractionDigits: 0 }) : null;

  const cards = projects.map(p => {
    const devName = escHtml(p.developers?.name || '');
    const loc = escHtml(p.district_name || p.location || '');
    const minP = fmtPrice(p.min_price);
    const maxP = fmtPrice(p.max_price);
    const priceStr = minP && maxP ? `${minP} \u2013 ${maxP}` : (minP || maxP || '');
    const types = Array.isArray(p.property_types) && p.property_types.length
      ? escHtml(p.property_types.join(', '))
      : '';
    const completion = p.completion_date ? escHtml(p.completion_date) : '';
    const badge = statusLabel(p.status);
    const imgSrc = p.cover_image_url ? escAttr(NETLIFY_IMG_REM(p.cover_image_url, 600)) : '';
    return `<a href="/a/boban-pepic/project/${encodeURIComponent(p.slug)}" class="rem-project-card" style="display:block;text-decoration:none;color:inherit;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;transition:border-color 0.15s;">
      ${imgSrc ? `<div style="height:160px;overflow:hidden;"><img src="${imgSrc}" alt="${escAttr(p.name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;" onerror="handleImgError(this)"></div>` : `<div style="height:160px;background:rgba(255,255,255,0.06);"></div>`}
      <div style="padding:14px 16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);">${escHtml(badge)}</span>
        </div>
        <div style="font-weight:700;font-size:15px;margin-bottom:3px;">${escHtml(p.name)}</div>
        ${devName ? `<div style="font-size:12px;color:rgba(255,255,255,0.55);margin-bottom:4px;">${devName}</div>` : ''}
        ${loc ? `<div style="font-size:12px;color:rgba(255,255,255,0.55);margin-bottom:6px;">📍 ${loc}</div>` : ''}
        ${priceStr ? `<div style="font-size:13px;font-weight:600;margin-bottom:4px;">${priceStr}</div>` : ''}
        ${types ? `<div style="font-size:11px;color:rgba(255,255,255,0.55);">${types}</div>` : ''}
        ${completion ? `<div style="font-size:11px;color:rgba(255,255,255,0.55);margin-top:4px;">Completion: ${completion}</div>` : ''}
      </div>
    </a>`;
  }).join('');

  const section = document.createElement('section');
  section.style.cssText = 'margin-top:40px;';
  section.innerHTML = `
    <div style="background:rgba(255,165,0,0.08);border:1px solid rgba(255,165,0,0.2);border-radius:10px;padding:12px 16px;margin-bottom:20px;font-size:12px;color:rgba(255,255,255,0.55);line-height:1.5;">
      Off-plan projects shown for demonstration purposes. Data sourced from REM CRM. Individual project advertising requires a valid Trakheesi permit issued by DLD. Beta environment.
    </div>
    <h2 style="font-family:'Manrope',sans-serif;font-size:20px;font-weight:700;margin-bottom:16px;">Off-Plan Projects</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;">
      ${cards}
    </div>`;

  const footer = document.querySelector('.sd-footer');
  if (footer) {
    footer.parentNode.insertBefore(section, footer);
  } else {
    const agentPage = document.getElementById('agent-page');
    if (agentPage) agentPage.appendChild(section);
  }
}
