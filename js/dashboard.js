// @ts-check
(() => {
  // Credentials loaded from js/sd-config.js — update that file when rotating keys
  /** @type {string} */
  let SUPABASE_URL;
  /** @type {string} */
  let SUPABASE_ANON_KEY;
  /** @type {string} */
  let MAGIC_LINK_URL;
  /** @type {string} */
  let VERIFY_TOKEN_URL;
  /** @type {string} */
  let ANALYTICS_URL;
  /** @type {string} */
  let PROPS_URL;
  /** @type {string} */
  let ROTATE_SIRI_URL;
  /** @type {string} */
  let CONTACTS_URL;

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

  // ── Config ──
  function resolveConfig() {
    const cfg = window.SD_CONFIG;
    SUPABASE_URL = cfg.SUPABASE_URL;
    SUPABASE_ANON_KEY = cfg.SUPABASE_ANON_KEY;
    MAGIC_LINK_URL = `${SUPABASE_URL}/functions/v1/send-magic-link`;
    VERIFY_TOKEN_URL = `${SUPABASE_URL}/functions/v1/verify-magic-link`;
    ANALYTICS_URL = `${SUPABASE_URL}/functions/v1/get-analytics`;
    PROPS_URL = `${SUPABASE_URL}/functions/v1/manage-properties`;
    ROTATE_SIRI_URL = `${SUPABASE_URL}/functions/v1/rotate-siri-token`;
    CONTACTS_URL = `${SUPABASE_URL}/functions/v1/contact-timeline`;
  }

  // ── Init ──
  function init() {
    // sd-config.js is defer — same as us, so it should always be ready, but guard anyway.
    if (!window.SD_CONFIG) {
      let attempts = 0;
      const poll = setInterval(() => {
        attempts++;
        if (window.SD_CONFIG) {
          clearInterval(poll);
          resolveConfig();
          init();
        } else if (attempts >= 20) {
          clearInterval(poll);
          console.error('[dashboard] SD_CONFIG not available after 2s');
        }
      }, 100);
      return;
    }
    resolveConfig();

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
    initCobrokeSection();
    renderSecretarySection(currentAgent);
    loadContacts();
    renderQrSection();
    loadTestimonials();
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
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-portal-session`, {
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
    const hasPhoto    = !!a.photo_url;
    const hasBio      = !!(a.tagline && a.tagline.trim().length > 0);
    const hasWhatsapp = !!(a.whatsapp && String(a.whatsapp).replace(/\D/g, '').length >= 8);
    const hasProperty = (a.property_count || 0) > 0;
    const hasRera     = a.verification_status === 'verified';

    const steps = [
      { id: 'ob-photo',    check: 'ob-photo-check',    done: hasPhoto },
      { id: 'ob-bio',      check: 'ob-bio-check',      done: hasBio },
      { id: 'ob-whatsapp', check: 'ob-whatsapp-check', done: hasWhatsapp },
      { id: 'ob-property', check: 'ob-property-check', done: hasProperty },
      { id: 'ob-rera',     check: 'ob-rera-check',     done: hasRera },
    ];

    const completed = steps.filter(s => s.done).length;
    const total = steps.length;
    const score = Math.round((completed / total) * 100);

    // Always show the card — agents can see their score even when complete
    document.getElementById('onboard-checklist').style.display = 'block';
    document.getElementById('onboard-bar').style.width = `${score}%`;

    const scoreEl = document.getElementById('onboard-score');
    if (scoreEl) scoreEl.textContent = `${score}%`;

    const subEl = document.getElementById('onboard-sub-text');
    if (subEl) {
      subEl.textContent = score === 100
        ? 'Your profile is complete. Keep your listings up to date to maximise lead flow.'
        : `${score}% complete — ${total - completed} step${total - completed !== 1 ? 's' : ''} remaining`;
    }

    steps.forEach(s => {
      const el  = document.getElementById(s.id);
      const chk = document.getElementById(s.check);
      if (!el || !chk) return;
      if (s.done) {
        el.classList.add('done');
        chk.innerHTML = '✓';
      } else {
        el.classList.remove('done');
        chk.innerHTML = '';
      }
    });

    // Update RERA action label based on status
    const reraAction = document.getElementById('ob-rera-action');
    if (reraAction) {
      if (hasRera) {
        reraAction.textContent = 'Verified ✓';
      } else if (a.verification_status === 'pending') {
        reraAction.textContent = 'Under review';
      } else {
        reraAction.textContent = 'Join to verify';
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
        renderOnboarding();
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
    // Show date labels for first, mid, and last bars
    const labelIndices = new Set([0, Math.floor(chart.length / 2), chart.length - 1]);
    const fmtDate = (s) => { try { const d = new Date(s); return d.toLocaleDateString('en-AE', { month: 'short', day: 'numeric' }); } catch (_) { return s; } };

    container.innerHTML = chart.map((d, i) => {
      const h = Math.max(2, (d.views / max) * 80);
      const cls = d.views > 0 ? 'chart-bar chart-bar-fill' : 'chart-bar';
      const label = labelIndices.has(i) ? `<span style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);font-size:10px;color:rgba(255,255,255,0.3);white-space:nowrap;">${fmtDate(d.date)}</span>` : '';
      const tooltip = `<span class="chart-tooltip" style="display:none;position:absolute;top:-28px;left:50%;transform:translateX(-50%);background:rgba(255,255,255,0.95);color:#0a0a0a;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600;white-space:nowrap;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,0.2);">${d.views}</span>`;
      return `<div class="${cls}" style="height:${h}px;position:relative;" onmouseenter="this.querySelector('.chart-tooltip').style.display='block'" onmouseleave="this.querySelector('.chart-tooltip').style.display='none'">${tooltip}${label}</div>`;
    }).join('');
    // Add bottom margin for date labels
    container.style.marginBottom = '20px';
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
      container.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 14l2 2 4-4"/></svg></div><div class="empty-title">No leads yet</div><div class="empty-sub">Post your link on Instagram or WhatsApp — leads will appear here</div></div>';
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
        const intentCtx = l.intent === 'seller'
          ? `I saw you want to sell your property — I'd love to help with a free valuation.`
          : l.intent === 'buyer'
          ? `I saw you're looking for a property — let me find the best options for you.`
          : `Thanks for reaching out! How can I help you with Dubai properties?`;
        const waMsg = encodeURIComponent(`Hi ${l.name || ''}, ${intentCtx}`);
        actions += `<a class="lead-btn lead-btn-wa" href="https://wa.me/${waPhone}?text=${waMsg}" target="_blank" rel="noopener noreferrer">WhatsApp</a>`;
      }
      if (phone) actions += `<a class="lead-btn lead-btn-call" href="tel:${esc(phone)}">Call</a>`;
      if (email) actions += `<a class="lead-btn lead-btn-email" href="mailto:${esc(email)}">Email</a>`;

      let pills = '';
      if (l.intent === 'seller') pills += `<span class="lead-pill lead-pill-seller">🏠 Seller</span>`;
      else if (l.intent === 'buyer') pills += `<span class="lead-pill lead-pill-buyer">🔍 Buyer</span>`;
      if (l.budget_range) pills += `<span class="lead-pill">${esc(l.budget_range)}</span>`;
      if (l.property_type) pills += `<span class="lead-pill">${esc(l.property_type)}</span>`;
      if (l.preferred_area) pills += `<span class="lead-pill">${esc(l.preferred_area)}</span>`;
      if (l.source && l.source !== 'sell_qualifier' && l.source !== 'buy_qualifier') pills += `<span class="lead-pill">${esc(l.source)}</span>`;

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
    // Update onboarding checklist
    renderOnboarding();
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

  // ── Cobroke Discovery ──────────────────────────────────────────────────────
  let _cobrokeOffset = 0;
  const _COBROKE_LIMIT = 20;
  let _cobrokeTotal = 0;
  let _cobrokeLoading = false;
  let _cobrokeInitialised = false;

  function getSessionToken() {
    return authToken;
  }

  function formatAED(n) {
    if (!n && n !== 0) return '—';
    if (n >= 1_000_000) return `AED ${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
    if (n >= 1_000) return `AED ${(n / 1_000).toFixed(0)}K`;
    return `AED ${n.toLocaleString()}`;
  }

  function renderCobrokeSkeleton() {
    const grid = document.getElementById('cobroke-grid');
    if (!grid) return;
    grid.innerHTML = Array.from({ length: 6 }).map(() =>
      '<div class="cobroke-skel-card">' +
        '<div class="cobroke-skel-thumb skel"></div>' +
        '<div class="cobroke-skel-body">' +
          '<div class="cobroke-skel-line skel" style="width:40%"></div>' +
          '<div class="cobroke-skel-line skel" style="width:60%"></div>' +
          '<div class="cobroke-skel-line skel" style="width:50%"></div>' +
        '</div>' +
      '</div>'
    ).join('');
  }

  function renderCobrokeCards(listings, append) {
    const grid = document.getElementById('cobroke-grid');
    if (!grid) return;
    if (!append) grid.innerHTML = '';

    if (!listings.length && !append) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🤝</div><div class="empty-title">No cobroke listings found</div><div class="empty-sub">Try different filters or check back later</div></div>';
      return;
    }

    const fragment = listings.map(l => {
      const thumb = l.thumbnail_url
        ? `<img class="cobroke-card-thumb" src="${esc(l.thumbnail_url)}" alt="${esc(l.area || '')}" data-managed loading="lazy">`
        : `<div class="cobroke-card-thumb-placeholder">🏠</div>`;
      const beds = l.bedrooms != null ? `${Number(l.bedrooms)} bed · ` : '';
      const agentName = esc(l.requesting_agent_name || 'Agent');
      const agencyName = l.requesting_agency_name ? ` · ${esc(l.requesting_agency_name)}` : '';
      return '<div class="cobroke-card" data-prop-id="' + esc(l.property_id) + '">' +
        thumb +
        '<div class="cobroke-card-body">' +
          '<div class="cobroke-card-area">' + esc(l.area || '—') + '</div>' +
          '<div class="cobroke-card-price">' + formatAED(l.price) + '</div>' +
          '<div class="cobroke-card-type">' + beds + esc(l.property_type || '—') + '</div>' +
          '<div class="cobroke-card-agent">By <strong>' + agentName + '</strong>' + agencyName + '</div>' +
        '</div>' +
        '<div class="cobroke-card-footer">' +
          '<button class="cobroke-req-btn" data-action="cobrokeRequest" data-prop-id="' + esc(l.property_id) + '">Request Cobroke</button>' +
        '</div>' +
      '</div>';
    }).join('');

    grid.insertAdjacentHTML('beforeend', fragment);
  }

  async function fetchCobrokeListings(append) {
    if (_cobrokeLoading) return;
    _cobrokeLoading = true;

    const token = getSessionToken();
    if (!token) { _cobrokeLoading = false; return; }

    const area = (document.getElementById('cb-filter-area')?.value || '').trim() || undefined;
    const propertyType = (document.getElementById('cb-filter-type')?.value || '') || undefined;
    const priceMaxRaw = document.getElementById('cb-filter-price')?.value;
    const priceMax = priceMaxRaw ? Number(priceMaxRaw) : undefined;

    const filterBtn = document.getElementById('cb-filter-btn');
    if (filterBtn) filterBtn.disabled = true;

    if (!append) {
      renderCobrokeSkeleton();
      document.getElementById('cobroke-load-more').style.display = 'none';
    }

    const body = { limit: _COBROKE_LIMIT, offset: _cobrokeOffset };
    if (area) body.area = area;
    if (propertyType) body.property_type = propertyType;
    if (priceMax) body.price_max = priceMax;

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/cobroke-discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const d = await res.json().then(null, () => ({}));
        if (!append) {
          const grid = document.getElementById('cobroke-grid');
          if (grid) grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-title">Could not load listings</div><div class="empty-sub">${esc(d.error || 'Please try again')}</div></div>`;
        }
        return;
      }

      const data = await res.json();
      const listings = data.listings || [];
      _cobrokeTotal = data.total || 0;
      _cobrokeOffset += listings.length;

      renderCobrokeCards(listings, append);

      // Show/hide load more
      const loadMoreEl = document.getElementById('cobroke-load-more');
      if (loadMoreEl) {
        loadMoreEl.style.display = _cobrokeOffset < _cobrokeTotal ? 'block' : 'none';
      }
    } catch (e) {
      if (typeof window.reportError === 'function') window.reportError('dashboard/fetchCobrokeListings', e);
      else console.error('[dashboard/fetchCobrokeListings]', e);
      if (!append) {
        const grid = document.getElementById('cobroke-grid');
        if (grid) grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-title">Connection error</div><div class="empty-sub">Please try again</div></div>';
      }
    } finally {
      _cobrokeLoading = false;
      if (filterBtn) filterBtn.disabled = false;
    }
  }

  async function fetchMyCobrokeRequests() {
    const container = document.getElementById('cobroke-mine-list');
    if (!container) return;

    const token = getSessionToken();
    if (!token) return;

    container.innerHTML = '<div class="empty-state"><div class="empty-sub">Loading…</div></div>';

    try {
      // Query co_broke_deals via Supabase REST with anon key + agent auth via token
      // Use cobroke-discover pattern: POST to cobroke-listings won't work for "mine"
      // Instead query REST API directly for deals the current agent made
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/co_broke_deals?select=id,status,created_at,property:property_id(id,title,location)&order=created_at.desc&limit=50`,
        { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` } }
      );

      if (!res.ok) {
        container.innerHTML = '<div class="empty-state"><div class="empty-title">Could not load requests</div></div>';
        return;
      }

      const deals = await res.json();
      if (!Array.isArray(deals) || !deals.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">🤝</div><div class="empty-title">No cobroke requests yet</div><div class="empty-sub">Browse listings and send your first request</div></div>';
        return;
      }

      const rows = deals.map(d => {
        const prop = Array.isArray(d.property) ? d.property[0] : d.property;
        const title = prop?.title || prop?.location || '—';
        const statusCls = `cobroke-status-${(d.status || 'requested').replace(/[^a-z0-9-]/gi, '')}`;
        const statusLabel = (d.status || 'requested').charAt(0).toUpperCase() + (d.status || 'requested').slice(1);
        const date = d.created_at ? new Date(d.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
        const propLink = prop?.id ? `<a href="/property/${esc(prop.id)}" style="color:#818cf8;text-decoration:none;font-size:12px;">View</a>` : '—';
        return '<tr>' +
          '<td style="color:#fff;font-weight:500;">' + esc(title) + '</td>' +
          '<td><span class="cobroke-status-badge ' + statusCls + '">' + esc(statusLabel) + '</span></td>' +
          '<td>' + date + '</td>' +
          '<td>' + propLink + '</td>' +
        '</tr>';
      }).join('');

      container.innerHTML =
        '<div class="cobroke-table-wrap">' +
          '<table class="cobroke-table">' +
            '<thead><tr>' +
              '<th>Property</th>' +
              '<th>Status</th>' +
              '<th>Date</th>' +
              '<th></th>' +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>';
    } catch (e) {
      if (typeof window.reportError === 'function') window.reportError('dashboard/fetchMyCobrokeRequests', e);
      else console.error('[dashboard/fetchMyCobrokeRequests]', e);
      container.innerHTML = '<div class="empty-state"><div class="empty-title">Connection error</div></div>';
    }
  }

  window.cobrokeTab = (tab) => {
    const browsePanel = document.getElementById('cobroke-panel-browse');
    const minePanel = document.getElementById('cobroke-panel-mine');
    const browseTabEl = document.getElementById('cobroke-tab-browse');
    const mineTabEl = document.getElementById('cobroke-tab-mine');
    if (!browsePanel || !minePanel) return;

    if (tab === 'browse') {
      browsePanel.style.display = 'block';
      minePanel.style.display = 'none';
      browseTabEl.classList.add('active');
      browseTabEl.setAttribute('aria-selected', 'true');
      mineTabEl.classList.remove('active');
      mineTabEl.setAttribute('aria-selected', 'false');
      // Lazy-init on first browse
      if (!_cobrokeInitialised) {
        _cobrokeInitialised = true;
        _cobrokeOffset = 0;
        fetchCobrokeListings(false);
      }
    } else {
      browsePanel.style.display = 'none';
      minePanel.style.display = 'block';
      browseTabEl.classList.remove('active');
      browseTabEl.setAttribute('aria-selected', 'false');
      mineTabEl.classList.add('active');
      mineTabEl.setAttribute('aria-selected', 'true');
      fetchMyCobrokeRequests();
    }
  };

  window.cobrokeApplyFilters = () => {
    _cobrokeOffset = 0;
    fetchCobrokeListings(false);
  };

  window.cobrokeLoadMore = () => {
    fetchCobrokeListings(true);
  };

  window.cobrokeRequest = async (propId) => {
    if (!propId) return;
    const token = getSessionToken();
    if (!token) { showToast('Please log in first'); return; }

    // Find the button in the card
    const card = document.querySelector(`.cobroke-card[data-prop-id="${CSS.escape(propId)}"]`);
    const btn = card?.querySelector('.cobroke-req-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Requesting…'; }

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/cobroke-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ property_id: propId })
      });

      const data = await res.json().then(null, () => ({}));

      if (!res.ok) {
        showToast(data.error || 'Request failed');
        if (btn) { btn.disabled = false; btn.textContent = 'Request Cobroke'; }
        return;
      }

      showToast('Cobroke request sent!');
      if (btn) {
        btn.textContent = 'Requested!';
        btn.classList.add('requested');
        btn.disabled = true;
      }
    } catch (e) {
      if (typeof window.reportError === 'function') window.reportError('dashboard/cobrokeRequest', e);
      else console.error('[dashboard/cobrokeRequest]', e);
      showToast('Connection error');
      if (btn) { btn.disabled = false; btn.textContent = 'Request Cobroke'; }
    }
  };

  // Initialise cobroke browse on first load (lazy — only loads when section is visible)
  // We trigger it when the dashboard loads so it pre-fetches in background
  // but do NOT block paint. The section renders empty until data arrives.
  function initCobrokeSection() {
    _cobrokeInitialised = true;
    _cobrokeOffset = 0;
    fetchCobrokeListings(false);
  }

  // ── End Cobroke ────────────────────────────────────────────────────────────

  // ── Testimonials ──
  let _testimonialRating = 5;

  async function loadTestimonials() {
    if (!authToken) return;
    const TESTIMONIALS_URL = `${SUPABASE_URL}/functions/v1/manage-testimonials`;
    const res = await fetch(TESTIMONIALS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: authToken, action: 'list' })
    }).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json();
    renderTestimonials(data.testimonials || []);
  }

  function renderTestimonials(items) {
    const countEl = document.getElementById('testimonials-count');
    const listEl = document.getElementById('testimonials-list');
    if (countEl) countEl.textContent = `${items.length} / 10`;
    if (!listEl) return;
    if (!items.length) {
      listEl.innerHTML = '<div class="empty-state" style="padding:20px 0"><div class="empty-title" style="font-size:14px">No testimonials yet</div><div class="empty-sub">Add your first client quote — it shows on your public profile</div></div>';
      return;
    }
    listEl.innerHTML = items.map(t => `
      <div class="testimonial-card" data-id="${esc(t.id)}">
        <div class="testimonial-top">
          <div>
            <span class="testimonial-client">${esc(t.client_name)}</span>
            ${t.client_role ? `<span class="testimonial-role">${esc(t.client_role)}</span>` : ''}
          </div>
          <div class="testimonial-stars">${'★'.repeat(t.rating || 5)}</div>
        </div>
        <div class="testimonial-text">"${esc(t.content)}"</div>
        <button class="testimonial-delete" data-action="deleteTestimonial" data-id="${esc(t.id)}" aria-label="Delete testimonial">Delete</button>
      </div>
    `).join('');
  }

  // Star picker
  document.getElementById('star-picker')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.star');
    if (!btn) return;
    _testimonialRating = Number(btn.dataset.val) || 5;
    document.querySelectorAll('#star-picker .star').forEach((s, i) => {
      s.classList.toggle('active', i < _testimonialRating);
    });
  });

  window.addTestimonial = async function () {
    if (!authToken) return;
    const name = document.getElementById('t-client-name')?.value.trim();
    const role = document.getElementById('t-client-role')?.value.trim();
    const content = document.getElementById('t-content')?.value.trim();
    const errEl = document.getElementById('t-error');
    const btn = document.getElementById('t-add-btn');
    if (errEl) errEl.textContent = '';
    if (!name) { if (errEl) errEl.textContent = 'Client name is required.'; return; }
    if (!content || content.length < 10) { if (errEl) errEl.textContent = 'Testimonial must be at least 10 characters.'; return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Adding...'; }
    const res = await fetch(`${SUPABASE_URL}/functions/v1/manage-testimonials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: authToken, action: 'add', client_name: name, client_role: role || null, content, rating: _testimonialRating })
    }).catch(() => null);
    if (btn) { btn.disabled = false; btn.textContent = 'Add Testimonial'; }
    if (!res?.ok) {
      const d = await res?.json().catch(() => ({}));
      if (errEl) errEl.textContent = d?.error || 'Failed to add — try again.';
      return;
    }
    document.getElementById('t-client-name').value = '';
    document.getElementById('t-client-role').value = '';
    document.getElementById('t-content').value = '';
    _testimonialRating = 5;
    document.querySelectorAll('#star-picker .star').forEach((s, i) => s.classList.toggle('active', i === 4));
    showToast('Testimonial added!');
    loadTestimonials();
  };

  window.deleteTestimonial = async function (id) {
    if (!authToken || !id) return;
    if (!confirm('Delete this testimonial?')) return;
    await fetch(`${SUPABASE_URL}/functions/v1/manage-testimonials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: authToken, action: 'delete', id })
    }).catch(() => null);
    showToast('Deleted');
    loadTestimonials();
  };

  // ── AI Secretary Section ──
  let _secretaryHistory = [];

  function renderSecretarySection(agent) {
    const section = document.getElementById('secretary-section');
    if (!section || !agent) return;
    // Section is always visible — no display:none needed
  }

  function appendSecretaryMessage(role, text) {
    const container = document.getElementById('secretary-messages');
    if (!container) return;
    const div = document.createElement('div');
    div.className = `secretary-msg secretary-msg-${role === 'user' ? 'user' : 'ai'}`;
    const bubble = document.createElement('div');
    bubble.className = 'secretary-msg-bubble';
    bubble.textContent = text;
    div.appendChild(bubble);
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  async function sendToSecretary(message) {
    if (!authToken || !message.trim()) return;
    const input = document.getElementById('secretary-input');
    const sendBtn = document.getElementById('secretary-send-btn');
    if (input) input.value = '';
    if (sendBtn) sendBtn.disabled = true;
    appendSecretaryMessage('user', message);

    // Thinking indicator
    const thinkingEl = document.createElement('div');
    thinkingEl.className = 'secretary-msg secretary-msg-ai secretary-thinking';
    thinkingEl.innerHTML = '<div class="secretary-msg-bubble"><span class="thinking-dots"><span></span><span></span><span></span></span></div>';
    document.getElementById('secretary-messages')?.appendChild(thinkingEl);
    document.getElementById('secretary-messages').scrollTop = 999999;

    try {
      _secretaryHistory.push({ role: 'user', content: message });
      if (_secretaryHistory.length > 10) _secretaryHistory = _secretaryHistory.slice(-10);

      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-secretary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ message, channel: 'dashboard', token: authToken, history: _secretaryHistory.slice(0, -1) })
      });
      thinkingEl.remove();
      if (!res.ok) { appendSecretaryMessage('ai', 'Sorry, I had trouble connecting. Try again in a moment.'); }
      else {
        const data = await res.json();
        const reply = data.reply || 'I didn\'t get a response — please try again.';
        _secretaryHistory.push({ role: 'assistant', content: reply });
        appendSecretaryMessage('ai', reply);
      }
    } catch (e) {
      thinkingEl.remove();
      appendSecretaryMessage('ai', 'Connection error. Please check your connection and try again.');
    }
    if (sendBtn) sendBtn.disabled = false;
  }

  window.sendSecretaryMessage = function () {
    const input = document.getElementById('secretary-input');
    if (input?.value.trim()) sendToSecretary(input.value.trim());
  };

  window.secretaryPrompt = function (el) {
    const msg = el?.dataset?.msg;
    if (msg) sendToSecretary(msg);
  };

  document.getElementById('secretary-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.sendSecretaryMessage(); }
  });

  window.copySecretaryPhone = function () {
    const phone = document.getElementById('secretary-phone')?.textContent || '';
    const btn = document.querySelector('[data-action="copySecretaryPhone"]');
    navigator.clipboard.writeText(phone).then(() => {
      if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 1500); }
    }, (err) => {
      window.reportError?.('copySecretaryPhone', err);
    });
  };

  window.copySecretaryToken = function () {
    const token = document.getElementById('secretary-token')?.textContent || '';
    const btn = document.querySelector('[data-action="copySecretaryToken"]');
    navigator.clipboard.writeText(token).then(() => {
      if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 1500); }
    }, (err) => {
      window.reportError?.('copySecretaryToken', err);
    });
  };

  window.rotateSiriToken = async function () {
    if (!authToken) return;
    const btn = document.querySelector('[data-action="rotateSiriToken"]');
    try {
      const res = await fetch(ROTATE_SIRI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: authToken }),
      });
      if (!res.ok) throw new Error('Failed to rotate token');
      const data = await res.json();
      const tokenEl = document.getElementById('secretary-token');
      if (tokenEl) tokenEl.textContent = data.siri_token;
      if (btn) { btn.textContent = 'Rotated!'; setTimeout(() => { btn.textContent = 'Rotate'; }, 1500); }
    } catch (err) {
      window.reportError?.('rotateSiriToken', err);
      if (btn) { btn.textContent = 'Failed — refresh'; setTimeout(() => { btn.textContent = 'Rotate'; }, 3000); }
    }
  };

  // Handle Enter key on email input
  document.getElementById('auth-email').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMagicLink();
  });

  // ── Contacts / Timeline ──
  let _timelinePhone = null;
  let _timelineName = null;

  const INTERACTION_LABELS = {
    lead_captured: 'Lead captured',
    whatsapp_message: 'WhatsApp message',
    mortgage_inquiry: 'Mortgage inquiry',
    property_view: 'Property view',
    manual_note: 'Note',
    reconnect_sent: 'Reconnect sent',
  };

  const REMINDER_LABELS = {
    follow_up: 'Follow-up',
    reconnect: 'Reconnect',
    anniversary: 'Anniversary',
    market_update: 'Market update',
    refinance_check: 'Refinance check',
  };

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  window.scrollToContacts = function () {
    document.querySelectorAll('.dashboard-section').forEach(s => { s.style.display = 'none'; });
    const section = document.getElementById('contacts-section');
    if (section) section.style.display = '';
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector('[data-action="scrollToContacts"]')?.classList.add('active');
    loadContacts();
  };

  async function loadContacts() {
    if (!authToken || !CONTACTS_URL) return;
    const listEl = document.getElementById('contacts-list');
    if (!listEl) return;
    listEl.innerHTML = '<p class="contacts-loading">Loading…</p>';
    try {
      const [contactsRes, dueRes] = await Promise.allSettled([
        fetch(CONTACTS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get_contacts', token: authToken }) }).then(r => r.json()),
        fetch(CONTACTS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get_reminders_due', token: authToken }) }).then(r => r.json()),
      ]);
      const contacts = contactsRes.status === 'fulfilled' ? (contactsRes.value.contacts ?? []) : [];
      const due = dueRes.status === 'fulfilled' ? (dueRes.value.reminders ?? []) : [];
      renderDueRemindersBanner(due);
      renderContactsList(contacts);
    } catch (err) {
      listEl.innerHTML = '<p class="contacts-error">Failed to load contacts.</p>';
      window.reportError?.('loadContacts', err);
    }
  }

  function renderContactsList(contacts) {
    const listEl = document.getElementById('contacts-list');
    if (!listEl) return;
    if (!contacts.length) {
      listEl.innerHTML = '<p class="contacts-empty">No contacts yet. Contacts appear when leads are captured.</p>';
      return;
    }
    listEl.innerHTML = contacts.map(c => {
      const overdue = c.is_overdue ? ' overdue' : '';
      const reminderHtml = c.next_reminder_at
        ? `<span class="contact-reminder${overdue}">${esc(REMINDER_LABELS[c.next_reminder_type] || c.next_reminder_type)} · ${fmtDate(c.next_reminder_at)}</span>`
        : '';
      return `<div class="contact-row" data-action="openContactTimeline" data-phone="${esc(c.contact_phone)}" data-name="${esc(c.contact_name || c.contact_phone)}">
        <div class="contact-info">
          <span class="contact-name">${esc(c.contact_name || c.contact_phone)}</span>
          <span class="contact-phone">${esc(c.contact_phone)}</span>
        </div>
        <div class="contact-meta">
          <span class="contact-last">${esc(INTERACTION_LABELS[c.last_interaction_type] || c.last_interaction_type)} · ${fmtDate(c.last_interaction_at)}</span>
          ${reminderHtml}
        </div>
        <span class="contact-arrow">›</span>
      </div>`;
    }).join('');
  }

  function renderDueRemindersBanner(reminders) {
    const banner = document.getElementById('due-reminders-banner');
    if (!banner) return;
    if (!reminders.length) { banner.style.display = 'none'; return; }
    banner.style.display = '';
    const badgeEl = document.getElementById('nav-reminders-badge');
    if (badgeEl) { badgeEl.textContent = reminders.length; badgeEl.style.display = ''; }
    banner.innerHTML = `<p class="due-banner-title"><strong>${reminders.length} reminder${reminders.length > 1 ? 's' : ''} due</strong></p>` +
      reminders.map(r => {
        const phone = encodeURIComponent((r.contact_phone || '').replace(/\D/g, ''));
        const msg = encodeURIComponent(r.message_draft || '');
        const waUrl = `https://wa.me/${phone}?text=${msg}`;
        return `<div class="due-reminder-row">
          <div class="due-reminder-info">
            <span class="due-name">${esc(r.contact_name || r.contact_phone)}</span>
            <span class="due-type">${esc(REMINDER_LABELS[r.reminder_type] || r.reminder_type)}</span>
          </div>
          <div class="due-reminder-actions">
            <a href="${esc(waUrl)}" target="_blank" rel="noopener" class="btn-wa">WhatsApp</a>
            <button data-action="dismissReminder" data-reminder-id="${esc(r.id)}" class="btn-dismiss">Dismiss</button>
            <button data-action="snoozeReminder" data-reminder-id="${esc(r.id)}" data-days="7" class="btn-snooze">Snooze 7d</button>
          </div>
        </div>`;
      }).join('');
  }

  window.openContactTimeline = async function (phone, name) {
    _timelinePhone = phone;
    _timelineName = name;
    const modal = document.getElementById('timeline-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    document.getElementById('timeline-contact-name').textContent = name || phone;
    document.getElementById('timeline-content').innerHTML = '<p class="timeline-loading">Loading…</p>';
    try {
      const res = await fetch(CONTACTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_contact', token: authToken, contact_phone: phone }),
      });
      const data = await res.json();
      renderTimelineContent(data.interactions ?? [], data.reminders ?? [], phone);
    } catch (err) {
      document.getElementById('timeline-content').innerHTML = '<p class="timeline-error">Failed to load timeline.</p>';
      window.reportError?.('openContactTimeline', err);
    }
  };

  function renderTimelineContent(interactions, reminders, phone) {
    const el = document.getElementById('timeline-content');
    if (!el) return;
    const items = [
      ...interactions.map(i => ({ ...i, _kind: 'interaction', _ts: i.created_at })),
      ...reminders.map(r => ({ ...r, _kind: 'reminder', _ts: r.scheduled_for })),
    ].sort((a, b) => new Date(a._ts).getTime() - new Date(b._ts).getTime());

    if (!items.length) {
      el.innerHTML = '<p class="timeline-empty">No history yet.</p>';
      return;
    }

    el.innerHTML = items.map(item => {
      if (item._kind === 'interaction') {
        return `<div class="timeline-item interaction">
          <span class="ti-icon">💬</span>
          <div class="ti-body">
            <span class="ti-label">${esc(INTERACTION_LABELS[item.interaction_type] || item.interaction_type)}</span>
            <span class="ti-date">${fmtDate(item.created_at)}</span>
            ${item.notes ? `<p class="ti-notes">${esc(item.notes)}</p>` : ''}
          </div>
        </div>`;
      }
      const isDue = !item.sent_at && !item.dismissed_at && new Date(item.scheduled_for) < new Date();
      const status = item.dismissed_at ? 'dismissed' : item.sent_at ? 'sent' : isDue ? 'overdue' : 'pending';
      const phoneClean = encodeURIComponent((phone || '').replace(/\D/g, ''));
      const msg = encodeURIComponent(item.message_draft || '');
      const waUrl = `https://wa.me/${phoneClean}?text=${msg}`;
      const actionBtns = (status === 'pending' || status === 'overdue')
        ? `<div class="ti-actions">
            <a href="${esc(waUrl)}" target="_blank" rel="noopener" class="btn-wa btn-wa-sm" data-action="markReminderSent" data-reminder-id="${esc(item.id)}">WhatsApp</a>
            <button data-action="snoozeReminder" data-reminder-id="${esc(item.id)}" data-days="7" class="btn-snooze btn-snooze-sm">+7d</button>
            <button data-action="snoozeReminder" data-reminder-id="${esc(item.id)}" data-days="30" class="btn-snooze btn-snooze-sm">+30d</button>
            <button data-action="dismissReminder" data-reminder-id="${esc(item.id)}" class="btn-dismiss btn-dismiss-sm">Dismiss</button>
           </div>`
        : '';
      return `<div class="timeline-item reminder ${status}">
        <span class="ti-icon">🔔</span>
        <div class="ti-body">
          <span class="ti-label">${esc(REMINDER_LABELS[item.reminder_type] || item.reminder_type)}</span>
          <span class="ti-date">${fmtDate(item.scheduled_for)} · <em class="ti-status">${status}</em></span>
          ${item.message_draft ? `<p class="ti-notes ti-draft">${esc(item.message_draft)}</p>` : ''}
          ${actionBtns}
        </div>
      </div>`;
    }).join('');
  }

  window.closeTimelineModal = function () {
    const modal = document.getElementById('timeline-modal');
    if (modal) modal.style.display = 'none';
    _timelinePhone = null;
    _timelineName = null;
  };

  window.closeTimelineModalIfBackdrop = function (e) {
    if (e.target === document.getElementById('timeline-modal')) window.closeTimelineModal();
  };

  window.dismissReminder = async function (reminderId) {
    if (!reminderId || !authToken) return;
    try {
      await fetch(CONTACTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss_reminder', token: authToken, reminder_id: reminderId }),
      });
    } catch (err) { window.reportError?.('dismissReminder', err); }
    if (_timelinePhone) window.openContactTimeline(_timelinePhone, _timelineName);
    else loadContacts();
  };

  window.snoozeReminder = async function (reminderId, days) {
    if (!reminderId || !authToken) return;
    try {
      await fetch(CONTACTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'snooze_reminder', token: authToken, reminder_id: reminderId, snooze_days: days }),
      });
    } catch (err) { window.reportError?.('snoozeReminder', err); }
    if (_timelinePhone) window.openContactTimeline(_timelinePhone, _timelineName);
    else loadContacts();
  };

  window.markReminderSent = async function (reminderId) {
    if (!reminderId || !authToken) return;
    try {
      await fetch(CONTACTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss_reminder', token: authToken, reminder_id: reminderId }),
      });
    } catch (err) { window.reportError?.('markReminderSent', err); }
    if (_timelinePhone) window.openContactTimeline(_timelinePhone, _timelineName);
  };

  window.addNoteOpen = function () {
    const modal = document.getElementById('note-modal');
    if (modal) modal.style.display = 'flex';
    const textarea = document.getElementById('note-text');
    if (textarea) { textarea.value = ''; textarea.focus(); }
  };

  window.closeNoteModal = function () {
    const modal = document.getElementById('note-modal');
    if (modal) modal.style.display = 'none';
  };

  window.closeNoteModalIfBackdrop = function (e) {
    if (e.target === document.getElementById('note-modal')) window.closeNoteModal();
  };

  window.saveNote = async function () {
    const textarea = document.getElementById('note-text');
    const note = textarea?.value?.trim();
    if (!note || !_timelinePhone || !authToken) return;
    const btn = document.querySelector('[data-action="saveNote"]');
    if (btn) btn.disabled = true;
    try {
      const res = await fetch(CONTACTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_note', token: authToken, contact_phone: _timelinePhone, note }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed');
      window.closeNoteModal();
      window.openContactTimeline(_timelinePhone, _timelineName);
    } catch (err) {
      window.reportError?.('saveNote', err);
      if (btn) { btn.disabled = false; btn.textContent = 'Error — retry'; setTimeout(() => { btn.textContent = 'Save Note'; }, 2000); }
    }
  };

  // ── QR Code ──
  function renderQrSection() {
    const a = currentAgent;
    if (!a?.slug) return;
    const profileUrl = `https://sellingdubai.ae/a/${a.slug}`;
    const qrBase = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(profileUrl)}`;

    const img = document.getElementById('qr-img');
    if (img) img.src = `${qrBase}&size=300x300`;

    const dlPng = document.getElementById('qr-dl-png');
    if (dlPng) {
      dlPng.addEventListener('click', () => {
        dlPng.disabled = true;
        dlPng.textContent = 'Downloading…';
        fetch(`${qrBase}&size=1000x1000`)
          .then(r => r.blob())
          .then(blob => {
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `sellingdubai-${a.slug}-qr.png`;
            anchor.click();
            URL.revokeObjectURL(url);
          })
          .catch(() => showToast('Download failed — check your connection'))
          .finally(() => { dlPng.disabled = false; dlPng.textContent = 'Download for business card'; });
      });
    }

    const dlSvg = document.getElementById('qr-dl-svg');
    if (dlSvg) {
      dlSvg.addEventListener('click', () => {
        dlSvg.disabled = true;
        dlSvg.textContent = 'Downloading…';
        fetch(`${qrBase}&size=1000x1000&format=svg`)
          .then(r => r.blob())
          .then(blob => {
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `sellingdubai-${a.slug}-qr.svg`;
            anchor.click();
            URL.revokeObjectURL(url);
          })
          .catch(() => showToast('Download failed — check your connection'))
          .finally(() => { dlSvg.disabled = false; dlSvg.textContent = 'Download for print (SVG)'; });
      });
    }
  }

  init();
})();
