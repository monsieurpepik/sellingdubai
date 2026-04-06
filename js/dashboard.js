// @ts-check
(() => {
  // Credentials loaded from js/sd-config.js — update that file when rotating keys
  /** @type {{ SUPABASE_URL: string; SUPABASE_ANON_KEY: string }} */
  const cfg = window.SD_CONFIG;
  const SUPABASE_URL = cfg.SUPABASE_URL;
  const SUPABASE_ANON_KEY = cfg.SUPABASE_ANON_KEY;
  const MAGIC_LINK_URL = `${SUPABASE_URL}/functions/v1/send-magic-link`;
  const VERIFY_TOKEN_URL = `${SUPABASE_URL}/functions/v1/verify-magic-link`;
  const ANALYTICS_URL = `${SUPABASE_URL}/functions/v1/get-analytics`;
  const PROPS_URL = `${SUPABASE_URL}/functions/v1/manage-properties`;

  /** @type {string | null} */
  let currentAgent = null;
  /** @type {string | null} */
  let authToken = null;
  /** @type {unknown[]} */
  let propertiesCache = [];
  let propLimitReached = false;
  /** @type {string | null} */
  let _pendingDeleteId = null;
  /** @type {string[]} */
  let propPhotos = [];

  // ── Init ──
  function init() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const saved = localStorage.getItem('sd_edit_token');

    if (token) {
      verifyToken(token);
    } else if (saved) {
      verifyToken(saved);
    } else {
      showAuthOverlay();
    }
  }

  function showAuthOverlay() {
    document.getElementById('auth-overlay').classList.remove('hidden');
    document.getElementById('app-shell').style.display = 'none';
    document.getElementById('auth-form').classList.remove('hidden');
    document.getElementById('auth-sent').classList.add('hidden');
    document.getElementById('auth-loading').classList.add('hidden');
  }

  window.showAuthForm = () => {
    document.getElementById('auth-form').classList.remove('hidden');
    document.getElementById('auth-sent').classList.add('hidden');
  };

  // ── Send Magic Link ──
  async function sendMagicLink() {
    const errEl = document.getElementById('auth-error');
    const succEl = document.getElementById('auth-success');
    errEl.className = 'auth-msg'; succEl.className = 'auth-msg';

    const email = document.getElementById('auth-email').value.trim();
    if (!email) { errEl.textContent = 'Enter your email.'; errEl.className = 'auth-msg error'; return; }

    const btn = document.getElementById('btn-magic');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner spinner-dark"></span>';

    try {
      const res = await fetch(MAGIC_LINK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, destination: '/dashboard' })
      });
      btn.disabled = false;
      btn.textContent = 'Send Magic Link';

      if (!res.ok) {
        const data = await res.json();
        errEl.textContent = data.error || 'Something went wrong.';
        errEl.className = 'auth-msg error';
        return;
      }

      document.getElementById('sent-email').textContent = email;
      document.getElementById('auth-form').classList.add('hidden');
      document.getElementById('auth-sent').classList.remove('hidden');
    } catch (e) {
      if (typeof window.reportError === 'function') window.reportError('dashboard/sendMagicLink', e);
      else console.error('[dashboard/sendMagicLink]', e);
      btn.disabled = false; btn.textContent = 'Send Magic Link';
      errEl.textContent = 'Connection error.'; errEl.className = 'auth-msg error';
    }
  }
  window.sendMagicLink = sendMagicLink;

  // ── Verify Token ──
  async function verifyToken(token) {
    document.getElementById('auth-form').classList.add('hidden');
    document.getElementById('auth-sent').classList.add('hidden');
    document.getElementById('auth-loading').classList.remove('hidden');

    try {
      const res = await fetch(VERIFY_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await res.json();

      if (!res.ok || !data.agent) {
        localStorage.removeItem('sd_edit_token');
        window.history.replaceState({}, '', '/dashboard');
        showAuthOverlay();
        const errEl = document.getElementById('auth-error');
        errEl.textContent = data.error || 'Session expired. Request a new magic link.';
        errEl.className = 'auth-msg error';
        return;
      }

      authToken = token;
      localStorage.setItem('sd_edit_token', token);
      window.history.replaceState({}, '', '/dashboard');
      currentAgent = data.agent;
      loadDashboard();
    } catch (e) {
      if (typeof window.reportError === 'function') window.reportError('dashboard/verifyToken', e);
      else console.error('[dashboard/verifyToken]', e);
      localStorage.removeItem('sd_edit_token');
      showAuthOverlay();
      const errEl = document.getElementById('auth-error');
      errEl.textContent = 'Connection error.'; errEl.className = 'auth-msg error';
    }
  }

  // ── Load Dashboard ──
  function loadDashboard() {
    document.getElementById('auth-overlay').classList.add('hidden');
    document.getElementById('app-shell').style.display = 'flex';

    // Set agent info
    const a = currentAgent;
    document.getElementById('sidebar-name').textContent = a.name || '—';
    document.getElementById('sidebar-tier').textContent = `${(a.tier || 'free').charAt(0).toUpperCase() + (a.tier || 'free').slice(1)} plan`;
    document.getElementById('nav-view-profile').href = `/a/${a.slug || ''}`;
    document.getElementById('mobile-view-profile').href = `/a/${a.slug || ''}`;

    const avatarEl = document.getElementById('sidebar-avatar');
    if (a.photo_url) {
      avatarEl.innerHTML = `<img src="${cdnImg(a.photo_url, 80)}" srcset="${cdnImg(a.photo_url, 80)} 80w, ${cdnImg(a.photo_url, 160)} 160w" sizes="80px" width="80" height="80" alt="">`;
    } else {
      avatarEl.textContent = (a.name || '?').charAt(0).toUpperCase();
    }

    fetchAnalytics();
    renderOnboarding();
    renderBillingCard();
    loadProperties();
  }

  // ── Billing Card ──
  function renderBillingCard() {
    const a = currentAgent;
    if (!a?.tier || a.tier === 'free') return;

    const card = document.getElementById('billing-card');
    const badge = document.getElementById('billing-plan-badge');
    const planLabel = document.getElementById('billing-plan-label');
    const periodLabel = document.getElementById('billing-period-label');
    const statusBanner = document.getElementById('billing-status-banner');

    const tierName = a.tier.charAt(0).toUpperCase() + a.tier.slice(1);
    const planInterval = a.stripe_plan?.includes('yearly') ? 'Yearly' : 'Monthly';
    badge.textContent = tierName;
    badge.dataset.tier = a.tier;
    planLabel.textContent = `${tierName} Plan · ${planInterval}`;

    if (a.stripe_current_period_end) {
      const periodEnd = new Date(a.stripe_current_period_end);
      const fmt = periodEnd.toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' });

      if (a.stripe_subscription_status === 'past_due') {
        const graceEnd = new Date(a.stripe_current_period_end);
        graceEnd.setDate(graceEnd.getDate() + 7);
        const now = new Date();
        if (now <= graceEnd) {
          periodLabel.textContent = `Renews ${fmt}`;
          statusBanner.textContent = `⚠ Payment failed — update your card to keep ${tierName} features`;
          statusBanner.style.display = 'block';
          statusBanner.className = 'billing-status-banner billing-status-past-due';
        } else {
          // Grace period expired — show as if free in the nav label
          document.getElementById('sidebar-tier').textContent = 'Free plan';
          return; // Don't show the billing card
        }
      } else if (a.stripe_subscription_status === 'canceled') {
        return; // Downgraded — don't show card
      } else {
        periodLabel.textContent = `Renews ${fmt}`;
      }
    }

    card.style.display = 'flex';
  }

  async function openBillingPortal() {
    const btn = document.getElementById('btn-manage-billing');
    btn.disabled = true;
    btn.textContent = 'Opening…';
    const res = await fetch('https://pjyorgedaxevxophpfib.supabase.co/functions/v1/create-portal-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: authToken }),
    }).then(null, (e) => {
      if (typeof window.reportError === 'function') window.reportError('dashboard/openBillingPortal', e);
      else console.error('[dashboard/openBillingPortal]', e);
      return null;
    });
    if (!res) { showToast('Connection error. Please try again.'); btn.disabled = false; btn.textContent = 'Manage billing'; return; }
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      showToast(data.error || 'Could not open billing portal.');
      btn.disabled = false;
      btn.textContent = 'Manage billing';
    }
  }
  window.openBillingPortal = openBillingPortal;

  // ── Onboarding Checklist ──
  function renderOnboarding() {
    if (!currentAgent) return;
    // Don't show if user previously dismissed
    if (localStorage.getItem(`sd_onboard_dismissed_${currentAgent.id}`)) return;

    const a = currentAgent;
    const hasPhoto = !!a.photo_url;
    const hasBio = !!(a.tagline && a.tagline.trim().length > 10);
    const hasWhatsapp = !!(a.whatsapp && String(a.whatsapp).replace(/\D/g, '').length >= 8);
    // Property count will be checked after analytics load — for now mark as pending
    const hasProperty = (a.property_count || 0) > 0;
    const hasShared = !!localStorage.getItem(`sd_shared_${a.id}`);

    const steps = [
      { id: 'ob-photo', done: hasPhoto },
      { id: 'ob-bio', done: hasBio },
      { id: 'ob-whatsapp', done: hasWhatsapp },
      { id: 'ob-property', done: hasProperty },
      { id: 'ob-share', done: hasShared },
    ];

    const completed = steps.filter(s => s.done).length;
    const total = steps.length;

    // All done? Don't show
    if (completed >= total) return;

    // Show checklist
    document.getElementById('onboard-checklist').style.display = 'block';
    document.getElementById('onboard-bar').style.width = `${(completed / total) * 100}%`;

    steps.forEach(s => {
      const el = document.getElementById(s.id);
      const check = document.getElementById(`${s.id}-check`);
      if (s.done) {
        el.classList.add('done');
        check.innerHTML = '✓';
      } else {
        el.classList.remove('done');
        check.innerHTML = '';
      }
    });
  }

  // Update property step after analytics loads
  function updateOnboardPropertyStep(propertyCount) {
    if (!currentAgent) return;
    if (propertyCount > 0) {
      const el = document.getElementById('ob-property');
      const check = document.getElementById('ob-property-check');
      if (el && !el.classList.contains('done')) {
        el.classList.add('done');
        check.innerHTML = '✓';
        // Recalculate progress
        const doneCount = document.querySelectorAll('.onboard-step.done').length;
        document.getElementById('onboard-bar').style.width = `${(doneCount / 5) * 100}%`;
        if (doneCount >= 5) document.getElementById('onboard-checklist').style.display = 'none';
      }
    }
  }

  window.dismissOnboarding = () => {
    if (currentAgent) localStorage.setItem(`sd_onboard_dismissed_${currentAgent.id}`, '1');
    document.getElementById('onboard-checklist').style.display = 'none';
  };

  // ── Fetch Analytics ──
  async function fetchAnalytics() {
    const analyticsRes = await fetch(ANALYTICS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: authToken })
    }).then(null, (e) => {
      if (typeof window.reportError === 'function') window.reportError('dashboard/fetchAnalytics', e);
      else console.error('[dashboard/fetchAnalytics]', e);
      return null;
    });
    if (analyticsRes?.ok) {
      const data = await analyticsRes.json();
      renderMetrics(data);
      renderChart(data.chart || []);
      renderReferrers(data.top_referrers || []);
      renderLeads(data.recent_leads || []);
      loadReferralSection(data.referral_stats || null);
    }

    // Check property count for onboarding step (lightweight HEAD-style query — non-critical)
    if (currentAgent?.id) {
      const pRes = await fetch(
        `${SUPABASE_URL}/rest/v1/properties?agent_id=eq.${currentAgent.id}&select=id&limit=1`,
        { headers: { 'apikey': SUPABASE_ANON_KEY } }
      ).then(null, () => null);
      if (pRes?.ok) {
        const props = await pRes.json();
        updateOnboardPropertyStep(props.length);
      }
    }
  }

  // ── Render Metrics ──
  function renderMetrics(data) {
    const tm = data.this_month || {};
    const lm = data.last_month || {};

    setMetric('m-views', tm.views || 0, 'm-views-change', lm.views || 0);
    setMetric('m-leads', tm.lead_submits || 0, 'm-leads-change', lm.lead_submits || 0);
    setMetric('m-wa', tm.whatsapp_taps || 0, 'm-wa-change', lm.whatsapp_taps || 0);

    // Conversion = leads / views
    const views = tm.views || 0;
    const leads = tm.lead_submits || 0;
    const conv = views > 0 ? ((leads / views) * 100).toFixed(1) : '0.0';
    document.getElementById('m-conv').textContent = `${conv}%`;
    document.getElementById('m-conv-label').textContent = 'leads / views';
    document.getElementById('m-conv-label').className = 'metric-change metric-flat';
  }

  function setMetric(valueId, current, changeId, previous) {
    document.getElementById(valueId).textContent = current.toLocaleString();
    const changeEl = document.getElementById(changeId);
    if (previous === 0 && current === 0) {
      changeEl.textContent = 'No data yet';
      changeEl.className = 'metric-change metric-flat';
    } else if (previous === 0) {
      changeEl.textContent = '↑ New';
      changeEl.className = 'metric-change metric-up';
    } else {
      const pct = Math.round(((current - previous) / previous) * 100);
      if (pct > 0) { changeEl.textContent = `↑ ${pct}% vs last month`; changeEl.className = 'metric-change metric-up'; }
      else if (pct < 0) { changeEl.textContent = `↓ ${Math.abs(pct)}% vs last month`; changeEl.className = 'metric-change metric-down'; }
      else { changeEl.textContent = '→ Same as last month'; changeEl.className = 'metric-change metric-flat'; }
    }
  }

  // ── Render Chart ──
  function renderChart(chart) {
    const container = document.getElementById('chart-bars');
    if (!chart.length) { container.innerHTML = '<div style="color:rgba(255,255,255,0.2);font-size:13px;">No data</div>'; return; }

    const max = Math.max(...chart.map(d => d.views), 1);
    container.innerHTML = chart.map(d => {
      const h = Math.max(2, (d.views / max) * 80);
      const cls = d.views > 0 ? 'chart-bar chart-bar-fill' : 'chart-bar';
      return `<div class="${cls}" style="height:${h}px" title="${esc(d.date)}: ${d.views} views"></div>`;
    }).join('');
  }

  // ── Render Referrers ──
  const REF_COLORS = { instagram: '#E1306C', tiktok: '#00f2ea', linkedin: '#0A66C2', youtube: '#FF0000', facebook: '#1877F2', direct: '#6366f1', google: '#34A853', twitter: '#1DA1F2', other: '#71717a' };
  function renderReferrers(refs) {
    const el = document.getElementById('ref-list');
    if (!refs.length) return;
    el.innerHTML = refs.map(r => {
      const color = REF_COLORS[r.source.toLowerCase()] || REF_COLORS.other;
      return `<div class="ref-row"><span class="ref-source"><span class="ref-dot" style="background:${color}"></span>${esc(r.source)}</span><span class="ref-count">${r.count}</span></div>`;
    }).join('');
  }

  // ── Render Leads ──
  function renderLeads(leads) {
    const container = document.getElementById('leads-list');
    document.getElementById('leads-count').textContent = `${leads.length} lead${leads.length !== 1 ? 's' : ''} (30 days)`;

    if (!leads.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No leads yet</div><div class="empty-sub">Post your link on Instagram or WhatsApp — leads will appear here</div></div>';
      return;
    }

    // Lead source breakdown
    const sources = {};
    leads.forEach(l => { const s = l.source || 'direct'; sources[s] = (sources[s] || 0) + 1; });
    const srcEl = document.getElementById('lead-source-list');
    const srcColors = { profile: '#4d65ff', full_profile: '#6366f1', landing: '#8b5cf6', qr: 'rgba(255,255,255,0.4)', direct: '#71717a' };
    srcEl.innerHTML = Object.entries(sources).sort((a,b) => b[1]-a[1]).map(([s,c]) => {
      const color = srcColors[s] || '#71717a';
      return `<div class="ref-row"><span class="ref-source"><span class="ref-dot" style="background:${color}"></span>${esc(s)}</span><span class="ref-count">${c}</span></div>`;
    }).join('');

    container.innerHTML = leads.map(l => {
      const status = l.status || 'new';
      const statusCls = `status-${status}`;
      const phone = l.phone || '';
      const email = l.email || '';
      const waPhone = phone.replace(/[^0-9]/g, '');
      const timeAgo = getTimeAgo(l.created_at);

      let actions = '';
      if (waPhone) {
        const waMsg = encodeURIComponent(`Hi ${l.name || ''}, thanks for reaching out! How can I help you with Dubai properties?`);
        actions += `<a class="lead-btn lead-btn-wa" href="https://wa.me/${waPhone}?text=${waMsg}" target="_blank" rel="noopener noreferrer">WhatsApp</a>`;
      }
      if (phone) actions += `<a class="lead-btn lead-btn-call" href="tel:${esc(phone)}">Call</a>`;
      if (email) actions += `<a class="lead-btn lead-btn-email" href="mailto:${esc(email)}">Email</a>`;

      let pills = '';
      if (l.budget_range) pills += `<span class="lead-pill">${esc(l.budget_range)}</span>`;
      if (l.property_type) pills += `<span class="lead-pill">${esc(l.property_type)}</span>`;
      if (l.preferred_area) pills += `<span class="lead-pill">${esc(l.preferred_area)}</span>`;
      if (l.source) pills += `<span class="lead-pill">${esc(l.source)}</span>`;

      return '<div class="lead-card">' +
        '<div class="lead-top">' +
          '<span class="lead-name">' + esc(l.name) + '</span>' +
          '<span class="lead-time">' + timeAgo + '</span>' +
        '</div>' +
        (pills ? `<div class="lead-details">${pills}</div>` : '') +
        (l.message ? `<div class="lead-msg">"${esc(l.message)}"</div>` : '') +
        '<div class="lead-actions">' + actions +
          '<select class="status-select ' + statusCls + '" data-action-change="updateLeadStatus" data-lead-id="\'' + l.id + '\'">' +
            '<option value="new"' + (status==='new'?' selected':'') + '>New</option>' +
            '<option value="contacted"' + (status==='contacted'?' selected':'') + '>Contacted</option>' +
            '<option value="qualified"' + (status==='qualified'?' selected':'') + '>Qualified</option>' +
            '<option value="converted"' + (status==='converted'?' selected':'') + '>Converted</option>' +
            '<option value="lost"' + (status==='lost'?' selected':'') + '>Lost</option>' +
          '</select>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // ── Update Lead Status ──
  window.updateLeadStatus = async (leadId, status, selectEl) => {
    selectEl.className = `status-select status-${status}`;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/update-lead-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: authToken, lead_id: leadId, status: status })
    }).then(null, (e) => {
      if (typeof window.reportError === 'function') window.reportError('dashboard/updateLeadStatus', e);
      else console.error('[dashboard/updateLeadStatus]', e);
      return null;
    });
    if (!res) { showToast('Connection error'); return; }
    if (res.ok) {
      showToast(`Status updated to ${status}`);
    } else {
      const data = await res.json().then(null, () => ({}));
      showToast(data.error || 'Failed to update status');
    }
  };

  // ── Helpers ──
  function esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
  function cdnImg(url, w) {
    if (!url) return '';
    if (url.startsWith('https://pjyorgedaxevxophpfib.supabase.co/')) {
      return esc(`/.netlify/images?url=${encodeURIComponent(url)}&w=${w}&fm=webp&q=80`);
    }
    return esc(url);
  }

  function getTimeAgo(dateStr) {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = now - then;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
  }

  window.copyProfileLink = () => {
    if (!currentAgent) return;
    const url = `https://sellingdubai.ae/a/${currentAgent.slug}`;
    // Track share step for onboarding checklist
    localStorage.setItem(`sd_shared_${currentAgent.id}`, '1');
    const obShare = document.getElementById('ob-share');
    const obShareCheck = document.getElementById('ob-share-check');
    if (obShare && !obShare.classList.contains('done')) {
      obShare.classList.add('done');
      if (obShareCheck) obShareCheck.innerHTML = '✓';
      const doneCount = document.querySelectorAll('.onboard-step.done').length;
      document.getElementById('onboard-bar').style.width = `${(doneCount / 5) * 100}%`;
      if (doneCount >= 5) document.getElementById('onboard-checklist').style.display = 'none';
    }

    navigator.clipboard.writeText(url).then(() => {
      const btn = document.getElementById('btn-share');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Share Link'; }, 1500);
    }, () => {
      // Fallback for older browsers / insecure contexts
      const tmp = document.createElement('textarea');
      tmp.value = url;
      tmp.style.position = 'fixed';
      tmp.style.opacity = '0';
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand('copy');
      document.body.removeChild(tmp);
      const btn = document.getElementById('btn-share');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Share Link'; }, 1500);
    });
  };

  // ── Referral Section ──
  function loadReferralSection(referralStats) {
    if (!currentAgent) return;
    const code = currentAgent.referral_code || currentAgent.slug;
    const link = `https://sellingdubai.ae/join?ref=${encodeURIComponent(code)}`;
    document.getElementById('referral-link').value = link;

    // Use referral stats from analytics response (authenticated, bypasses RLS)
    if (!referralStats?.invited) {
      document.getElementById('referral-count').textContent = '0 invited';
      return;
    }
    const bonus = currentAgent.bonus_listing_slots || 0;
    document.getElementById('referral-count').textContent = `${referralStats.invited} invited`;
    document.getElementById('ref-invited').textContent = referralStats.invited;
    document.getElementById('ref-verified').textContent = referralStats.verified || 0;
    document.getElementById('ref-bonus').textContent = bonus;
    document.getElementById('referral-stats').style.display = 'block';
  }

  window.copyReferralLink = () => {
    const input = document.getElementById('referral-link');
    if (!input.value) return;
    navigator.clipboard.writeText(input.value).then(() => {
      const btn = document.getElementById('referral-copy-btn');
      btn.textContent = 'Copied!';
      btn.style.background = '#22c55e';
      setTimeout(() => { btn.textContent = 'Copy'; btn.style.background = ''; }, 1500);
    }, () => {
      // Fallback for older browsers
      input.select();
      document.execCommand('copy');
      const btn = document.getElementById('referral-copy-btn');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    });
  };

  // ── Properties ──
  const PROP_STATUS_LABELS = {
    just_listed: 'Just Listed',
    available: 'Available',
    under_offer: 'Under Offer',
    sold: 'Sold',
    rented: 'Rented',
  };

  window.scrollToProperties = () => {
    const el = document.getElementById('props-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  async function loadProperties() {
    const res = await fetch(PROPS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: authToken, action: 'list' })
    }).then(null, (e) => {
      if (typeof window.reportError === 'function') window.reportError('dashboard/loadProperties', e);
      else console.error('[dashboard/loadProperties]', e);
      return null;
    });
    if (!res?.ok) return;
    const data = await res.json();
    propertiesCache = data.properties || [];
    propLimitReached = data.limit !== null && propertiesCache.length >= data.limit;
    renderPropertyCards(data.properties || [], data.limit, data.tier);
    // Update onboarding property step
    updateOnboardPropertyStep(propertiesCache.length);
    // Update add button state
    const addBtn = document.getElementById('btn-add-prop');
    if (addBtn) addBtn.disabled = propLimitReached;
  }

  function renderPropertyCards(props, limit, _tier) {
    const badge = document.getElementById('props-count-badge');
    const limitNote = document.getElementById('props-limit-note');
    const limitLabel = limit === null ? '∞' : limit;
    badge.textContent = `${props.length} / ${limitLabel}`;

    if (propLimitReached) {
      limitNote.innerHTML = `Listing limit reached (${limit}). <a href="/pricing" style="color:#fff;font-weight:600;text-decoration:underline;">Upgrade to Pro or Premium</a> to add more.`;
      limitNote.style.display = 'block';
    } else {
      limitNote.style.display = 'none';
    }

    const container = document.getElementById('props-list');
    if (!props.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">🏠</div><div class="empty-title">No listings yet</div><div class="empty-sub">Add a property \u2014 it\'s the #1 reason clients tap WhatsApp</div></div>';
      return;
    }

    if (typeof window.renderAdminCard !== 'function') {
      console.error('[dashboard] renderAdminCard bridge not ready — components.js may not have loaded');
      return;
    }
    container.innerHTML = props.map((p, idx) => window.renderAdminCard(p, idx, props.length, PROP_STATUS_LABELS)).join('');
  }

  window.openPropModal = (propId) => {
    const modal = document.getElementById('prop-modal');
    const titleEl = document.getElementById('prop-modal-title');
    const saveBtn = document.getElementById('btn-save-prop');

    // Reset form
    document.getElementById('prop-title').value = '';
    document.getElementById('prop-price').value = '';
    document.getElementById('prop-location').value = '';
    document.getElementById('prop-bedrooms').value = '';
    document.getElementById('prop-area').value = '';
    document.getElementById('prop-type').value = '';
    document.getElementById('prop-dld-permit').value = '';
    document.getElementById('prop-external-url').value = '';
    document.getElementById('prop-photo-input').value = '';
    propPhotos = [];
    renderPhotoGrid();

    // Default status
    const radios = document.querySelectorAll('input[name="prop-status"]');
    radios.forEach(r => { r.checked = r.value === 'available'; });

    if (propId) {
      const p = propertiesCache.find(x => x.id === propId);
      if (!p) return;
      titleEl.textContent = 'Edit Listing';
      saveBtn.dataset.editId = propId;
      document.getElementById('prop-title').value = p.title || '';
      document.getElementById('prop-price').value = p.price || '';
      document.getElementById('prop-location').value = p.location || '';
      document.getElementById('prop-bedrooms').value = p.bedrooms != null ? p.bedrooms : '';
      document.getElementById('prop-area').value = p.area_sqft != null ? p.area_sqft : '';
      document.getElementById('prop-type').value = p.property_type || '';
      document.getElementById('prop-dld-permit').value = p.dld_permit || '';
      document.getElementById('prop-external-url').value = p.external_url || '';
      radios.forEach(r => { r.checked = r.value === (p.status || 'available'); });
      propPhotos = [];
      if (p.image_url) propPhotos.push({ url: p.image_url });
      if (Array.isArray(p.additional_photos)) {
        p.additional_photos.forEach((u) => { if (u) propPhotos.push({ url: u }); });
      }
      renderPhotoGrid();
    } else {
      titleEl.textContent = 'Add Listing';
      delete saveBtn.dataset.editId;
    }

    modal.classList.add('open');
  };

  window.closePropModal = () => {
    propPhotos = [];
    document.getElementById('prop-modal').classList.remove('open');
  };

  function renderPhotoGrid() {
    const grid = document.getElementById('prop-photo-grid');
    if (!grid) return;
    let html = '';
    propPhotos.forEach((photo, idx) => {
      const imgSrc = photo.url ? cdnImg(photo.url, 200) : photo.base64;
      html += '<div class="photo-grid-item">' +
        '<img src="' + imgSrc + '" alt="">' +
        '<button type="button" class="photo-remove" data-action="removePropPhoto" data-prop-id="' + idx + '" aria-label="Remove photo">\u00d7</button>' +
        (idx === 0 ? '<span class="photo-cover-badge">Cover</span>' : '') +
        '</div>';
    });
    if (propPhotos.length < 15) {
      html += '<button type="button" class="photo-add-btn" data-action="triggerPhotoInput" aria-label="Add photo">+</button>';
    }
    grid.innerHTML = html;
  }

  window.removePropPhoto = (idx) => {
    propPhotos.splice(idx, 1);
    renderPhotoGrid();
  };

  window.onPropPhotoPick = (input) => {
    const files = Array.from(input.files || []);
    input.value = '';
    const remaining = 15 - propPhotos.length;
    if (remaining <= 0) { showToast('Maximum 15 photos reached'); return; }
    const toAdd = files.slice(0, remaining);
    if (files.length > remaining) showToast(`Only ${remaining} photo(s) added — limit reached`);
    toAdd.forEach((file) => {
      if (file.size > 5 * 1024 * 1024) { showToast('Photo must be under 5 MB'); return; }
      const reader = new FileReader();
      reader.onload = (e) => {
        propPhotos.push({ base64: e.target.result });
        renderPhotoGrid();
      };
      reader.readAsDataURL(file);
    });
  };

  window.savePropModal = async () => {
    const title = document.getElementById('prop-title').value.trim();
    if (!title) { showToast('Title is required'); return; }

    const saveBtn = document.getElementById('btn-save-prop');
    const editId = saveBtn.dataset.editId;
    const status = document.querySelector('input[name="prop-status"]:checked')?.value || 'available';

    const propData = {
      title,
      price: document.getElementById('prop-price').value.trim() || null,
      location: document.getElementById('prop-location').value.trim() || null,
      bedrooms: document.getElementById('prop-bedrooms').value !== '' ? parseInt(document.getElementById('prop-bedrooms').value, 10) : null,
      area_sqft: document.getElementById('prop-area').value !== '' ? parseInt(document.getElementById('prop-area').value, 10) : null,
      property_type: document.getElementById('prop-type').value || null,
      status,
      dld_permit: document.getElementById('prop-dld-permit').value.trim() || null,
      external_url: document.getElementById('prop-external-url').value.trim() || null,
    };

    // Cover photo (first in propPhotos)
    const coverPhoto = propPhotos[0] || null;
    if (coverPhoto) {
      if (coverPhoto.base64) propData.image_base64 = coverPhoto.base64;
      else if (coverPhoto.url) propData.keep_cover_url = coverPhoto.url;
    } else if (editId) {
      propData.keep_cover_url = null;
    }

    // Additional photos (indices 1+)
    const additionalBase64 = [];
    const retainedAdditional = [];
    propPhotos.slice(1).forEach((photo) => {
      if (photo.base64) additionalBase64.push(photo.base64);
      else if (photo.url) retainedAdditional.push(photo.url);
    });
    if (additionalBase64.length > 0) propData.additional_photos = additionalBase64;
    if (editId) propData.retained_additional_photos = retainedAdditional;

    if (editId) propData.id = editId;

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
      const payload = { token: authToken, action: editId ? 'update' : 'add', property: propData };
      const res = await fetch(PROPS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Failed to save listing');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Listing';
        return;
      }

      closePropModal();
      showToast(editId ? 'Listing updated' : 'Listing added');
      await loadProperties();
    } catch (e) {
      if (typeof window.reportError === 'function') window.reportError('dashboard/saveProp', e);
      else console.error('[dashboard/saveProp]', e);
      showToast('Connection error');
    }

    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Listing';
  };

  window.deletePropertyConfirm = (propId) => {
    _pendingDeleteId = propId;
    const p = propertiesCache.find(x => x.id === propId);
    document.getElementById('delete-prop-name').textContent = p ? p.title : 'this listing';
    document.getElementById('delete-prop-modal').classList.add('open');
  };

  window.closeDeletePropModal = () => {
    _pendingDeleteId = null;
    document.getElementById('delete-prop-modal').classList.remove('open');
  };

  window.confirmDeleteProp = async () => {
    if (!_pendingDeleteId) return;
    const propId = _pendingDeleteId;
    const btn = document.getElementById('btn-confirm-delete');
    btn.disabled = true;
    btn.textContent = 'Deleting…';

    try {
      const res = await fetch(PROPS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: authToken, action: 'delete', property: { id: propId } })
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Failed to delete'); btn.disabled = false; btn.textContent = 'Delete'; return; }
      closeDeletePropModal();
      showToast('Listing deleted');
      await loadProperties();
    } catch (e) {
      if (typeof window.reportError === 'function') window.reportError('dashboard/confirmDeleteProp', e);
      else console.error('[dashboard/confirmDeleteProp]', e);
      showToast('Connection error');
    }

    btn.disabled = false;
    btn.textContent = 'Delete';
  };

  window.updatePropStatus = async (propId, status, selectEl) => {
    selectEl.className = `prop-status-select prop-status-${status}`;
    // Update badge in same card
    const card = selectEl.closest('.prop-card');
    if (card) {
      const badge = card.querySelector('.prop-badge');
      if (badge) {
        badge.className = `prop-badge prop-badge-${status}`;
        badge.textContent = PROP_STATUS_LABELS[status] || status;
      }
    }
    try {
      const res = await fetch(PROPS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: authToken, action: 'update', property: { id: propId, status } })
      });
      if (res.ok) {
        const p = propertiesCache.find(x => x.id === propId);
        if (p) p.status = status;
        showToast('Status updated');
      } else {
        const data = await res.json().then(null, () => ({}));
        showToast(data.error || 'Failed to update status');
      }
    } catch (e) {
      if (typeof window.reportError === 'function') window.reportError('dashboard/updatePropStatus', e);
      else console.error('[dashboard/updatePropStatus]', e);
      showToast('Connection error');
    }
  };

  window.reorderProp = async (propId, direction) => {
    const idx = propertiesCache.findIndex(x => x.id === propId);
    if (idx === -1) return;
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= propertiesCache.length) return;

    // Swap in local cache and re-render immediately for responsiveness
    const tmp = propertiesCache[idx];
    propertiesCache[idx] = propertiesCache[swapIdx];
    propertiesCache[swapIdx] = tmp;

    const limit = parseInt(document.getElementById('props-count-badge').textContent.split('/')[1], 10) || null;
    renderPropertyCards(propertiesCache, limit === null || Number.isNaN(limit) ? null : limit, null);

    const ids = propertiesCache.map(p => p.id);
    fetch(PROPS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: authToken, action: 'reorder', ids })
    }).then(null, () => {
      // Non-critical — re-render from server on next load
    });
  };

  window.shareProperty = (propId) => {
    if (!currentAgent) return;
    const url = `https://sellingdubai.ae/a/${currentAgent.slug}?open=property&id=${propId}`;
    navigator.clipboard.writeText(url).then(() => {
      showToast('Link copied!');
    }, () => {
      const tmp = document.createElement('textarea');
      tmp.value = url;
      tmp.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand('copy');
      document.body.removeChild(tmp);
      showToast('Link copied!');
    });
  };

  window.logout = () => {
    const token = authToken || localStorage.getItem('sd_edit_token');
    localStorage.removeItem('sd_edit_token');
    authToken = null;
    currentAgent = null;
    // Revoke the token server-side so it cannot be re-used from another device
    if (token) {
      fetch(`${SUPABASE_URL}/functions/v1/revoke-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify({ token }),
      }).then(null, (err) => { console.warn('[dashboard] revoke-session fire-and-forget failed:', err); });
    }
    showAuthOverlay();
  };

  // Handle Enter key on email input
  document.getElementById('auth-email').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMagicLink();
  });

  init();
})();
