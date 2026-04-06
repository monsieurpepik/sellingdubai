// @ts-check
(() => {
  const SUPABASE_URL = 'https://pjyorgedaxevxophpfib.supabase.co';
  const MAGIC_LINK_URL = `${SUPABASE_URL}/functions/v1/send-magic-link`;
  const VERIFY_TOKEN_URL = `${SUPABASE_URL}/functions/v1/verify-magic-link`;
  const UPDATE_URL = `${SUPABASE_URL}/functions/v1/update-agent`;
  const UPLOAD_URL = `${SUPABASE_URL}/functions/v1/upload-image`;
  const _ANALYTICS_URL = `${SUPABASE_URL}/functions/v1/get-analytics`;

  /** @type {string | null} */
  let currentAgent = null;
  /** @type {string | null} */
  let authToken = null;

  function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function stripSocialPrefix(url, prefixes) {
    for (const p of prefixes) {
      if (url.toLowerCase().startsWith(p.toLowerCase())) return url.slice(p.length);
    }
    return url;
  }

  // === CHECK FOR TOKEN IN URL ===
  function init() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    // Also check localStorage for existing session
    const saved = localStorage.getItem('sd_edit_token');

    if (token) {
      // Fresh magic link click — verify it
      verifyToken(token);
    } else if (saved) {
      // Existing session — re-verify
      verifyToken(saved);
    } else {
      showAuth();
    }
  }

  function showAuth() {
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('sent-screen').classList.add('hidden');
    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('edit-screen').classList.add('hidden');
  }
  window.showAuth = showAuth;

  // === SEND MAGIC LINK ===
  window.sendMagicLink = async () => {
    const errEl = document.getElementById('auth-error');
    const succEl = document.getElementById('auth-success');
    errEl.classList.remove('show');
    succEl.classList.remove('show');

    const email = document.getElementById('auth-email').value.trim();
    if (!email) { errEl.textContent = 'Please enter your email.'; errEl.classList.add('show'); return; }

    const btn = document.getElementById('btn-magic');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Sending...';

    try {
      const res = await fetch(MAGIC_LINK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();

      btn.disabled = false;
      btn.innerHTML = '<span class="btn-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg></span> Send Magic Link';

      if (!res.ok) {
        errEl.textContent = data.error || 'Something went wrong.';
        errEl.classList.add('show');
        return;
      }

      // Show "check email" screen
      document.getElementById('sent-email').textContent = email;
      document.getElementById('auth-screen').classList.add('hidden');
      document.getElementById('sent-screen').classList.remove('hidden');
    } catch (e) {
      if (typeof window.reportError === 'function') window.reportError('edit/sendMagicLink', e);
      else console.error('[edit/sendMagicLink]', e);
      btn.disabled = false;
      btn.textContent = 'Send Magic Link';
      errEl.textContent = 'Connection error. Try again.';
      errEl.classList.add('show');
    }
  };

  // === VERIFY TOKEN ===
  async function verifyToken(token) {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('sent-screen').classList.add('hidden');
    document.getElementById('loading-screen').classList.remove('hidden');
    document.getElementById('edit-screen').classList.add('hidden');

    try {
      const res = await fetch(VERIFY_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await res.json();

      if (!res.ok || !data.agent) {
        localStorage.removeItem('sd_edit_token');
        // Clean URL
        window.history.replaceState({}, '', '/edit');
        showAuth();
        const errEl = document.getElementById('auth-error');
        errEl.textContent = data.error || 'Magic link expired or invalid. Request a new one.';
        errEl.classList.add('show');
        return;
      }

      // Success — store token
      authToken = token;
      localStorage.setItem('sd_edit_token', token);
      currentAgent = data.agent;

      // If we were sent here from another page (e.g. pricing), return there now
      const returnTo = new URLSearchParams(window.location.search).get('return');
      if (returnTo?.startsWith('/')) {
        window.location.href = returnTo;
        return;
      }

      window.history.replaceState({}, '', '/edit');
      loadEditor();
    } catch (e) {
      if (typeof window.reportError === 'function') window.reportError('edit/verifyToken', e);
      else console.error('[edit/verifyToken]', e);
      localStorage.removeItem('sd_edit_token');
      showAuth();
      const errEl = document.getElementById('auth-error');
      errEl.textContent = 'Connection error verifying token.';
      errEl.classList.add('show');
    }
  }

  // === LOAD EDITOR ===
  function loadEditor() {
    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('edit-screen').classList.remove('hidden');

    const a = currentAgent;

    // Header
    if (a.photo_url) {
      document.getElementById('edit-avatar').innerHTML = `<img src="${esc(a.photo_url)}" srcset="${esc(`/.netlify/images?url=${encodeURIComponent(a.photo_url)}&w=80&fm=webp&q=80`)} 80w, ${esc(`/.netlify/images?url=${encodeURIComponent(a.photo_url)}&w=160&fm=webp&q=80`)} 160w" sizes="80px" width="80" height="80" alt="${esc(a.name)}">`;
    } else {
      const initials = a.name.split(' ').map(n => n[0]).join('').slice(0, 2);
      document.getElementById('edit-avatar').textContent = initials;
    }
    document.getElementById('edit-name').textContent = a.name;
    document.getElementById('edit-slug').textContent = `sellingdubai.ae/a/${a.slug}`;
    document.getElementById('btn-view-profile').href = `/a/${a.slug}`;
    document.getElementById('share-row').classList.remove('hidden');

    // Load analytics dashboard
    loadAnalytics();
    window._profileUrl = `${window.location.origin}/a/${a.slug}`;

    // Populate fields
    document.getElementById('ed-name').value = a.name || '';
    document.getElementById('ed-tagline').value = a.tagline || '';
    document.getElementById('ed-email').value = a.email || '';
    document.getElementById('ed-whatsapp').value = a.whatsapp || '';
    document.getElementById('ed-photo').value = a.photo_url || '';
    document.getElementById('ed-bg').value = a.background_image_url || '';
    // Show image previews
    if (a.photo_url) {
      document.getElementById('preview-avatar').innerHTML = `<img src="${a.photo_url}" srcset="${esc(`/.netlify/images?url=${encodeURIComponent(a.photo_url)}&w=80&fm=webp&q=80`)} 80w, ${esc(`/.netlify/images?url=${encodeURIComponent(a.photo_url)}&w=160&fm=webp&q=80`)} 160w" sizes="80px" width="80" height="80" alt="Profile photo">`;
      document.getElementById('prompt-avatar').classList.add('hidden');
    }
    if (a.background_image_url) {
      document.getElementById('preview-bg').innerHTML = `<img src="${a.background_image_url}" alt="Background image">`;
      document.getElementById('prompt-bg').classList.add('hidden');
    }
    document.getElementById('ed-agency-name').value = a.agency_name || '';
    document.getElementById('ed-agency-logo').value = a.agency_logo_url || '';
    if (a.agency_logo_url) {
      document.getElementById('preview-logo').innerHTML = `<img src="${a.agency_logo_url}" alt="Agency logo">`;
      document.getElementById('prompt-logo').classList.add('hidden');
    }
    document.getElementById('ed-calendly').value = a.calendly_url || '';
    document.getElementById('ed-cl1-label').value = a.custom_link_1_label || '';
    document.getElementById('ed-cl1-url').value = a.custom_link_1_url || '';
    document.getElementById('ed-cl2-label').value = a.custom_link_2_label || '';
    document.getElementById('ed-cl2-url').value = a.custom_link_2_url || '';
    document.getElementById('ed-ig').value = a.instagram_url || '';
    document.getElementById('ed-yt').value = stripSocialPrefix(a.youtube_url || '', ['https://www.youtube.com/@', 'https://youtube.com/@', 'youtube.com/@']);
    document.getElementById('ed-tt').value = a.tiktok_url || '';
    document.getElementById('ed-li').value = stripSocialPrefix(a.linkedin_url || '', ['https://www.linkedin.com/in/', 'https://linkedin.com/in/', 'linkedin.com/in/']);
    document.getElementById('ed-webhook').value = a.webhook_url || '';
    document.getElementById('ed-fb-pixel').value = a.facebook_pixel_id || '';
    document.getElementById('ed-fb-capi-token').value = a.facebook_capi_token || '';
    document.getElementById('ed-ga4').value = a.ga4_measurement_id || '';
    document.getElementById('ed-show-preapproval').checked = a.show_preapproval !== false;
    document.getElementById('ed-show-golden-visa').checked = a.show_golden_visa !== false;

    // Verification status banner
    const vs = a.verification_status || 'pending';
    document.getElementById('verify-banner-pending').classList.toggle('hidden', vs !== 'pending');
    document.getElementById('verify-banner-verified').classList.toggle('hidden', vs !== 'verified');
    document.getElementById('verify-banner-rejected').classList.toggle('hidden', vs !== 'rejected');
    if (vs === 'rejected' && a.verification_notes) {
      document.getElementById('reject-reason').textContent = a.verification_notes;
    }
    // Show license upload section for unverified agents
    if (vs !== 'verified') {
      document.getElementById('verify-section').classList.remove('hidden');
    }
    document.getElementById('ed-broker-number').value = a.dld_broker_number || a.broker_number || '';
    document.getElementById('ed-license-img').value = a.license_image_url || '';
    if (a.license_image_url) {
      document.getElementById('preview-license').innerHTML = `<img src="${a.license_image_url}" alt="DLD license">`;
      document.getElementById('prompt-license').classList.add('hidden');
    }

    // Instagram connection state
    if (a.instagram_connected_at) {
      document.getElementById('ig-disconnected').style.display = 'none';
      document.getElementById('ig-connected').style.display = 'block';
      const igHandle = a.instagram_url ? `@${a.instagram_url.replace(/https?:\/\/(www\.)?instagram\.com\/?/, '').replace(/\/$/, '')}` : 'Connected';
      document.getElementById('ig-username').textContent = igHandle;
    }

    // TikTok connection state
    if (a.tiktok_connected_at) {
      document.getElementById('tt-disconnected').style.display = 'none';
      document.getElementById('tt-connected').style.display = 'block';
      const ttHandle = a.tiktok_url ? `@${a.tiktok_url.replace(/https?:\/\/(www\.)?tiktok\.com\/@?/, '').replace(/\/$/, '')}` : 'Connected';
      document.getElementById('tt-username').textContent = ttHandle;
    }

    // Handle OAuth callbacks (Instagram or TikTok)
    const params = new URLSearchParams(window.location.search);
    const oauthCode = params.get('code');
    const igCallback = params.get('ig_callback');
    const ttCallback = params.get('tt_callback');

    if (oauthCode && igCallback) {
      // Validate CSRF state
      const igReturnedState = params.get('state');
      const igStoredState = localStorage.getItem('sd_ig_csrf_state');
      if (!igStoredState || igReturnedState !== igStoredState) {
        showToast('Instagram authorization failed: state mismatch. Please try again.');
      } else {
        exchangeInstagramCode(oauthCode);
      }
      localStorage.removeItem('sd_ig_csrf_state');
      const cleanUrl = window.location.pathname + (window.location.search.replace(/[?&]code=[^&]+/, '').replace(/[?&]ig_callback=[^&]+/, '').replace(/[?&]state=[^&]+/, '').replace(/^\?$/, '') || '');
      window.history.replaceState({}, '', cleanUrl.replace(/\?&/, '?').replace(/\?$/, ''));
    } else if (oauthCode && ttCallback) {
      // Validate CSRF state
      const returnedState = params.get('state');
      const storedState = localStorage.getItem('sd_tt_csrf_state');
      if (!storedState || returnedState !== storedState) {
        showToast('TikTok authorization failed: state mismatch. Please try again.');
      } else {
        exchangeTikTokCode(oauthCode);
      }
      localStorage.removeItem('sd_tt_csrf_state');
      const cleanUrl = window.location.pathname + (window.location.search.replace(/[?&]code=[^&]+/, '').replace(/[?&]tt_callback=[^&]+/, '').replace(/[?&]state=[^&]+/, '').replace(/^\?$/, '') || '');
      window.history.replaceState({}, '', cleanUrl.replace(/\?&/, '?').replace(/\?$/, ''));
    }

    // Load properties
    loadProperties();
  }

  // === INSTAGRAM ===
  window.connectInstagram = () => {
    const btn = document.getElementById('btn-ig-connect');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="border-color:rgba(255,255,255,0.2);border-top-color:#fff;"></span> Connecting...';
    const igSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069z"/></svg> Connect Instagram`;
    fetch(`${SUPABASE_URL}/functions/v1/instagram-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_auth_url' }),
    }).then((res) => res.json()).then((data) => {
      if (data.url) {
        if (data.state) localStorage.setItem('sd_ig_csrf_state', data.state);
        window.location.href = data.url;
      } else {
        btn.disabled = false;
        btn.innerHTML = igSvg;
        showToast('Could not get Instagram authorization URL. Please try again.');
      }
    }).then(null, () => {
      btn.disabled = false;
      btn.innerHTML = igSvg;
      showToast('Connection failed. Please try again.');
    });
  };

  function exchangeInstagramCode(code) {
    if (!authToken) return;

    const btn = document.getElementById('btn-ig-connect');
    const igSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069z"/></svg> Connect Instagram`;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner" style="border-color:rgba(255,255,255,0.2);border-top-color:#fff;"></span> Finishing setup...'; }

    fetch(`${SUPABASE_URL}/functions/v1/instagram-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'exchange_code', code, token: authToken }),
    }).then((res) => res.json()).then((data) => {
      if (data.success) {
        document.getElementById('ig-disconnected').style.display = 'none';
        document.getElementById('ig-connected').style.display = 'block';
        document.getElementById('ig-username').textContent = data.username ? `@${data.username}` : 'Connected';
        if (data.username) document.getElementById('ed-ig').value = `https://instagram.com/${data.username}`;
        const succEl = document.getElementById('save-success');
        succEl.textContent = 'Instagram connected!';
        succEl.classList.add('show');
        setTimeout(() => succEl.classList.remove('show'), 4000);
      } else {
        showToast(`Instagram connection failed: ${data.error || 'Unknown error'}`);
        if (btn) { btn.disabled = false; btn.innerHTML = igSvg; }
      }
    }).then(null, () => {
      showToast('Instagram connection failed. Please try again.');
      if (btn) { btn.disabled = false; btn.innerHTML = igSvg; }
    });
  }

  window.disconnectInstagram = () => {
    if (!confirm('Disconnect Instagram?')) return;
    fetch(`${SUPABASE_URL}/functions/v1/instagram-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'disconnect', token: authToken }),
    }).then((res) => {
      if (!res.ok) {
        return res.json().then(null, () => ({})).then((data) => {
          showToast(`Failed to disconnect: ${data.error || 'Server error. Please try again.'}`);
        });
      }
      document.getElementById('ig-disconnected').style.display = 'block';
      document.getElementById('ig-connected').style.display = 'none';
      document.getElementById('ed-ig').value = '';
      document.getElementById('btn-ig-connect').disabled = false;
      document.getElementById('btn-ig-connect').innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069z"/></svg> Connect Instagram`;
    }).then(null, () => {
      showToast('Failed to disconnect. Please try again.');
    });
  };

  // === TIKTOK ===
  window.connectTikTok = () => {
    const btn = document.getElementById('btn-tt-connect');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="border-color:rgba(255,255,255,0.2);border-top-color:#fff;"></span> Connecting...';
    const ttSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.88-2.88 2.89 2.89 0 0 1 2.88-2.88c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.84a8.27 8.27 0 0 0 4.84 1.57V6.97a4.84 4.84 0 0 1-1.08-.28z"/></svg> Connect TikTok`;
    fetch(`${SUPABASE_URL}/functions/v1/tiktok-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_auth_url' }),
    }).then((res) => res.json()).then((data) => {
      if (data.url) {
        if (data.state) localStorage.setItem('sd_tt_csrf_state', data.state);
        window.location.href = data.url;
      } else {
        btn.disabled = false;
        btn.innerHTML = ttSvg;
        showToast('Could not get TikTok authorization URL. Please try again.');
      }
    }).then(null, () => {
      btn.disabled = false;
      btn.innerHTML = ttSvg;
      showToast('Connection failed. Please try again.');
    });
  };

  function exchangeTikTokCode(code) {
    if (!authToken) return;

    const btn = document.getElementById('btn-tt-connect');
    const ttSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.88-2.88 2.89 2.89 0 0 1 2.88-2.88c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.84a8.27 8.27 0 0 0 4.84 1.57V6.97a4.84 4.84 0 0 1-1.08-.28z"/></svg> Connect TikTok`;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner" style="border-color:rgba(255,255,255,0.2);border-top-color:#fff;"></span> Finishing setup...'; }

    fetch(`${SUPABASE_URL}/functions/v1/tiktok-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'exchange_code', code, token: authToken }),
    }).then((res) => res.json()).then((data) => {
      if (data.success) {
        document.getElementById('tt-disconnected').style.display = 'none';
        document.getElementById('tt-connected').style.display = 'block';
        document.getElementById('tt-username').textContent = data.username ? `@${data.username}` : 'Connected';
        if (data.url) document.getElementById('ed-tt').value = data.url;
        else if (data.username) document.getElementById('ed-tt').value = `https://tiktok.com/@${data.username}`;
        const succEl = document.getElementById('save-success');
        succEl.textContent = 'TikTok connected!';
        succEl.classList.add('show');
        setTimeout(() => succEl.classList.remove('show'), 4000);
      } else {
        showToast(`TikTok connection failed: ${data.error || 'Unknown error'}`);
        if (btn) { btn.disabled = false; btn.innerHTML = ttSvg; }
      }
    }).then(null, () => {
      showToast('TikTok connection failed. Please try again.');
      if (btn) { btn.disabled = false; btn.innerHTML = ttSvg; }
    });
  }

  window.disconnectTikTok = () => {
    if (!confirm('Disconnect TikTok?')) return;
    fetch(`${SUPABASE_URL}/functions/v1/tiktok-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'disconnect', token: authToken }),
    }).then((res) => {
      if (!res.ok) {
        return res.json().then(null, () => ({})).then((data) => {
          showToast(`Failed to disconnect: ${data.error || 'Server error. Please try again.'}`);
        });
      }
      document.getElementById('tt-disconnected').style.display = 'block';
      document.getElementById('tt-connected').style.display = 'none';
      document.getElementById('ed-tt').value = '';
      document.getElementById('btn-tt-connect').disabled = false;
      document.getElementById('btn-tt-connect').innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.88-2.88 2.89 2.89 0 0 1 2.88-2.88c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.84a8.27 8.27 0 0 0 4.84 1.57V6.97a4.84 4.84 0 0 1-1.08-.28z"/></svg> Connect TikTok`;
    }).then(null, () => {
      showToast('Failed to disconnect. Please try again.');
    });
  };

  // === SAVE PROFILE ===
  window.saveProfile = async () => {
    const errEl = document.getElementById('save-error');
    const succEl = document.getElementById('save-success');
    errEl.classList.remove('show');
    succEl.classList.remove('show');

    const name = document.getElementById('ed-name').value.trim();
    const whatsapp = document.getElementById('ed-whatsapp').value.trim();
    if (!name) { errEl.textContent = 'Display name is required.'; errEl.classList.add('show'); window.scrollTo({top:0,behavior:'smooth'}); return; }
    if (!whatsapp) { errEl.textContent = 'WhatsApp number is required.'; errEl.classList.add('show'); window.scrollTo({top:0,behavior:'smooth'}); return; }

    const btn = document.getElementById('btn-save');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving...';

    const updates = {
      name,
      tagline: document.getElementById('ed-tagline').value.trim() || null,
      email: document.getElementById('ed-email').value.trim() || null,
      whatsapp,
      photo_url: document.getElementById('ed-photo').value.trim() || null,
      background_image_url: document.getElementById('ed-bg').value.trim() || null,
      agency_name: document.getElementById('ed-agency-name').value.trim() || null,
      agency_logo_url: document.getElementById('ed-agency-logo').value.trim() || null,
      calendly_url: document.getElementById('ed-calendly').value.trim() || null,
      dld_broker_number: document.getElementById('ed-broker-number').value.trim() || null,
      license_image_url: document.getElementById('ed-license-img').value.trim() || null,
      custom_link_1_label: document.getElementById('ed-cl1-label').value.trim() || null,
      custom_link_1_url: document.getElementById('ed-cl1-url').value.trim() || null,
      custom_link_2_label: document.getElementById('ed-cl2-label').value.trim() || null,
      custom_link_2_url: document.getElementById('ed-cl2-url').value.trim() || null,
      instagram_url: document.getElementById('ed-ig').value.trim() || null,
      youtube_url: (() => { const v = document.getElementById('ed-yt').value.trim(); return v ? (v.startsWith('http') ? v : `https://www.youtube.com/@${v}`) : null; })(),
      tiktok_url: document.getElementById('ed-tt').value.trim() || null,
      linkedin_url: (() => { const v = document.getElementById('ed-li').value.trim(); return v ? (v.startsWith('http') ? v : `https://www.linkedin.com/in/${v}`) : null; })(),
      webhook_url: document.getElementById('ed-webhook').value.trim() || null,
      facebook_pixel_id: document.getElementById('ed-fb-pixel').value.trim() || null,
      facebook_capi_token: document.getElementById('ed-fb-capi-token').value.trim() || null,
      ga4_measurement_id: document.getElementById('ed-ga4').value.trim() || null,
      show_preapproval: document.getElementById('ed-show-preapproval').checked,
      show_golden_visa: document.getElementById('ed-show-golden-visa').checked,
    };

    try {
      const res = await fetch(UPDATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: authToken, updates })
      });
      const data = await res.json();

      btn.disabled = false;
      btn.textContent = 'Save Changes';

      if (!res.ok) {
        errEl.textContent = data.error || 'Failed to save.';
        errEl.classList.add('show');
        window.scrollTo({top:0,behavior:'smooth'});
        return;
      }

      // Update local state
      currentAgent = { ...currentAgent, ...updates };

      // Update header
      document.getElementById('edit-name').textContent = name;
      if (updates.photo_url) {
        document.getElementById('edit-avatar').innerHTML = `<img src="${updates.photo_url}" srcset="${esc(`/.netlify/images?url=${encodeURIComponent(updates.photo_url)}&w=80&fm=webp&q=80`)} 80w, ${esc(`/.netlify/images?url=${encodeURIComponent(updates.photo_url)}&w=160&fm=webp&q=80`)} 160w" sizes="80px" width="80" height="80" alt="${name}">`;
      } else {
        const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2);
        document.getElementById('edit-avatar').textContent = initials;
      }

      succEl.textContent = 'Profile saved. Changes are live instantly.';
      succEl.classList.add('show');
      window.scrollTo({top:0,behavior:'smooth'});
      setTimeout(() => { succEl.classList.remove('show'); }, 4000);
    } catch (e) {
      if (typeof window.reportError === 'function') window.reportError('edit/saveProfile', e);
      else console.error('[edit/saveProfile]', e);
      btn.disabled = false;
      btn.textContent = 'Save Changes';
      errEl.textContent = 'Connection error. Try again.';
      errEl.classList.add('show');
    }
  };

  // === CLIENT-SIDE IMAGE COMPRESSION ===
  function compressImage(file, maxSize, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let w = img.width, h = img.height;
          if (w > maxSize || h > maxSize) {
            if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
            else { w = Math.round(w * maxSize / h); h = maxSize; }
          }
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // === IMAGE UPLOAD ===
  window.uploadImage = async (fileInput, imageType) => {
    const file = fileInput.files[0];
    if (!file) return;

    // Map types to UI elements and hidden inputs
    const typeMap = {
      'avatar': { preview: 'preview-avatar', prompt: 'prompt-avatar', loading: 'loading-avatar', input: 'ed-photo', maxPx: 800 },
      'background': { preview: 'preview-bg', prompt: 'prompt-bg', loading: 'loading-bg', input: 'ed-bg', maxPx: 1600 },
      'agency_logo': { preview: 'preview-logo', prompt: 'prompt-logo', loading: 'loading-logo', input: 'ed-agency-logo', maxPx: 400 },
      'license': { preview: 'preview-license', prompt: 'prompt-license', loading: 'loading-license', input: 'ed-license-img', maxPx: 1200 },
    };
    const ui = typeMap[imageType];
    if (!ui) return;

    // File size check — max 10MB before compression
    if (file.size > 10 * 1024 * 1024) {
      showToast('File too large. Please use an image under 10MB.');
      fileInput.value = '';
      return;
    }

    // HEIC/HEIF check — iOS sometimes sends these, browsers can't process them
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.heic') || lowerName.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif') {
      showToast('HEIC format is not supported. Please use JPG, PNG, or WebP instead.');
      fileInput.value = '';
      return;
    }

    // Show loading
    document.getElementById(ui.prompt).classList.add('hidden');
    document.getElementById(ui.loading).classList.remove('hidden');

    (async () => {
      // Compress image client-side before upload
      const base64 = file.type.startsWith('image/')
        ? await compressImage(file, ui.maxPx, 0.8)
        : await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

      const res = await fetch(UPLOAD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: authToken,
          image_base64: base64,
          file_type: file.type || 'image/jpeg',
          image_type: imageType,
        })
      });
      const data = await res.json();

      document.getElementById(ui.loading).classList.add('hidden');

      if (!res.ok) {
        document.getElementById(ui.prompt).classList.remove('hidden');
        showToast(`Upload failed: ${data.error || 'Unknown error'}`);
        fileInput.value = '';
        return;
      }

      // Validate URL before using — must be a Supabase storage or Netlify CDN URL
      const allowedUrlPrefixes = [
        'https://pjyorgedaxevxophpfib.supabase.co/storage/',
        '/.netlify/images?',
      ];
      if (!data.url || !allowedUrlPrefixes.some(p => data.url.startsWith(p))) {
        document.getElementById(ui.prompt).classList.remove('hidden');
        showToast('Upload returned an unexpected URL. Please try again.');
        fileInput.value = '';
        return;
      }

      // Show preview
      document.getElementById(ui.preview).innerHTML = `<img src="${esc(data.url)}" alt="Uploaded image">`;
      // Update hidden input
      document.getElementById(ui.input).value = data.url;

      // Update header avatar if it was an avatar upload
      if (imageType === 'avatar') {
        const safeName = (currentAgent.name || '').replace(/[<>"'&]/g, '');
        document.getElementById('edit-avatar').innerHTML = `<img src="${esc(data.url)}" srcset="${esc(`/.netlify/images?url=${encodeURIComponent(data.url)}&w=80&fm=webp&q=80`)} 80w, ${esc(`/.netlify/images?url=${encodeURIComponent(data.url)}&w=160&fm=webp&q=80`)} 160w" sizes="80px" width="80" height="80" alt="${safeName}">`;
      }

      fileInput.value = '';
    })().then(null, () => {
      document.getElementById(ui.loading).classList.add('hidden');
      document.getElementById(ui.prompt).classList.remove('hidden');
      showToast('Upload failed. Check your connection and try again.');
      fileInput.value = '';
    });
  };

  // === PROPERTY STATUS HELPERS ===
  const statusColors = {
    'just_listed': 'background:rgba(77,101,255,0.12);color:#4d65ff;',
    'available': 'background:rgba(37,211,102,0.1);color:#25d366;',
    'open_house': 'background:rgba(168,85,247,0.12);color:#a855f7;',
    'under_offer': 'background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.55);',
    'just_sold': 'background:rgba(244,63,94,0.12);color:#f43f5e;',
    'sold': 'background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.35);',
    'rented': 'background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.35);',
  };
  const statusLabels = {
    'just_listed': 'Just Listed', 'available': 'Available', 'open_house': 'Open House',
    'under_offer': 'Under Offer', 'just_sold': 'Just Sold', 'sold': 'Sold', 'rented': 'Rented',
  };
  function statusStyle(s) { return statusColors[s] || statusColors.available; }
  function statusLabel(s) { return statusLabels[s] || 'Available'; }

  // === PROPERTY MANAGEMENT ===
  const PROPS_URL = `${SUPABASE_URL}/functions/v1/manage-properties`;

  window.showPropForm = () => {
    document.getElementById('prop-form').style.display = '';
    document.getElementById('btn-show-prop-form').style.display = 'none';
    document.getElementById('prop-title').focus();
  };

  window.cancelPropForm = () => {
    document.getElementById('prop-form').style.display = 'none';
    document.getElementById('btn-show-prop-form').style.display = '';
    // Reset form
    document.getElementById('prop-title').value = '';
    document.getElementById('prop-price').value = '';
    document.getElementById('prop-location').value = '';
    document.getElementById('prop-bedrooms').value = '';
    document.getElementById('prop-sqft').value = '';
    document.getElementById('prop-type').value = '';
    document.getElementById('prop-external-url').value = '';
    document.getElementById('prop-image-data').value = '';
    document.getElementById('preview-prop').innerHTML = '';
    document.getElementById('prompt-prop').classList.remove('hidden');
    document.querySelector('input[name="prop-status"][value="just_listed"]').checked = true;
  };

  window.previewPropPhoto = (input) => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('Photo must be under 5MB.'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById('prompt-prop').classList.add('hidden');
      document.getElementById('preview-prop').innerHTML = `<img src="${e.target.result}" alt="Property photo" style="width:100%;height:100%;object-fit:cover;">`;
      document.getElementById('prop-image-data').value = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  window.addProperty = async () => {
    const title = document.getElementById('prop-title').value.trim();
    if (!title) { showToast('Property title is required.'); return; }
    const trakheesi = document.getElementById('prop-trakheesi').value.trim();
    if (!trakheesi) { showToast('Trakheesi permit number is required by DLD for all property advertisements.'); return; }

    const btn = document.getElementById('btn-add-prop-submit');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Adding...';

    const status = document.querySelector('input[name="prop-status"]:checked').value;
    const imageData = document.getElementById('prop-image-data').value;

    try {
      const res = await fetch(PROPS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: authToken,
          action: 'add',
          property: {
            title,
            price: document.getElementById('prop-price').value.trim() || null,
            location: document.getElementById('prop-location').value.trim() || null,
            bedrooms: parseInt(document.getElementById('prop-bedrooms').value, 10) || null,
            area_sqft: parseInt(document.getElementById('prop-sqft').value, 10) || null,
            property_type: document.getElementById('prop-type').value || null,
            status,
            external_url: document.getElementById('prop-external-url').value.trim() || null,
            dld_permit: trakheesi,
            image_base64: imageData || null,
          }
        })
      });
      const data = await res.json();

      btn.disabled = false;
      btn.textContent = 'Add Property';

      if (!res.ok) {
        showToast(`Error: ${data.error || 'Failed to add property.'}`);
        return;
      }

      // Success — reset form & reload list
      cancelPropForm();
      loadProperties();

      const succEl = document.getElementById('save-success');
      succEl.textContent = 'Property added to your profile.';
      succEl.classList.add('show');
      setTimeout(() => succEl.classList.remove('show'), 3000);
    } catch (e) {
      if (typeof window.reportError === 'function') window.reportError('edit/addProperty', e);
      else console.error('[edit/addProperty]', e);
      btn.disabled = false;
      btn.textContent = 'Add Property';
      showToast('Connection error. Try again.');
    }
  };

  window.deleteProperty = (propId) => {
    if (!confirm('Remove this property from your profile?')) return;

    fetch(PROPS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: authToken, action: 'delete', property: { id: propId } })
    }).then((res) => {
      if (res.ok) {
        loadProperties();
      } else {
        return res.json().then((data) => {
          showToast(`Error: ${data.error || 'Failed to delete.'}`);
        });
      }
    }).then(null, () => {
      showToast('Connection error.');
    });
  };

  function loadProperties() {
    fetch(PROPS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: authToken, action: 'list' })
    }).then((res) => res.json()).then((data) => {
      const list = document.getElementById('props-list');
      if (!data.properties || data.properties.length === 0) {
        list.innerHTML = '<div style="text-align:center;padding:16px;color:rgba(255,255,255,0.2);font-size:13px;">No properties yet. Add your first listing.</div>';
        return;
      }

      list.innerHTML = data.properties.map(p => `
        <div style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);margin-bottom:10px;">
          <div style="width:64px;height:64px;border-radius:10px;overflow:hidden;flex-shrink:0;background:rgba(255,255,255,0.06);">
            ${p.image_url
              ? `<img src="${p.image_url}" alt="" style="width:100%;height:100%;object-fit:cover;">`
              : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;"><svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(255,255,255,0.15)"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></div>`
            }
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(p.title)}</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.35);">${[p.price, p.location].filter(Boolean).map(esc).join(' — ') || 'No details'}</div>
            <span style="display:inline-block;margin-top:4px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;padding:3px 7px;border-radius:5px;${statusStyle(p.status)}">${statusLabel(p.status)}</span>
          </div>
          <button data-action="deleteProperty" data-prop-id="${p.id}" style="background:none;border:none;cursor:pointer;padding:8px;color:rgba(255,255,255,0.2);flex-shrink:0;" title="Remove">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      `).join('');
    }).then(null, (e) => {
      console.error('loadProperties error:', e);
    });
  }

  // === LOGOUT ===
  window.logout = () => {
    localStorage.removeItem('sd_edit_token');
    authToken = null;
    currentAgent = null;
    window.location.href = '/edit';
  };

  // === ANALYTICS (moved to /dashboard) ===
  async function loadAnalytics() {
    if (!authToken) return;
    const section = document.getElementById('analytics-section');
    if (section) section.style.display = '';
  }

  // === ENTER KEY ===
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement.id === 'auth-email') {
      sendMagicLink();
    }
  });

  // Init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function copyProfileLink() {
    const url = window._profileUrl || window.location.origin;
    const copyFn = (navigator.clipboard?.writeText)
      ? () => navigator.clipboard.writeText(url)
      : () => new Promise((resolve, reject) => {
          const ta = document.createElement('textarea');
          ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
          document.body.appendChild(ta); ta.select();
          if (document.execCommand('copy')) { resolve(); } else { reject(new Error('execCommand failed')); }
          document.body.removeChild(ta);
        });
    copyFn().then(() => {
      const btn = document.getElementById('btn-copy-link');
      btn.classList.add('copied');
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg> Copied!`;
      setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy Link`; }, 2000);
    }, () => {});
  }
  window.copyProfileLink = copyProfileLink;

  // === PHOTO CROP ===
  let _cropFileInput = null, _cropImg = null;
  let _cropDisplaySize = 0, _cropScale = 1;
  let _cropOffsetX = 0, _cropOffsetY = 0;
  let _cropImgDisplayW = 0, _cropImgDisplayH = 0;
  let _cropDragging = false, _cropDragStartX = 0, _cropDragStartY = 0;

  window.cropThenUpload = (fileInput, imageType) => {
    if (imageType !== 'avatar') { uploadImage(fileInput, imageType); return; }
    const file = fileInput.files[0];
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.heic') || lowerName.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif') {
      showToast('HEIC format is not supported. Please use JPG, PNG, or WebP.');
      fileInput.value = ''; return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('File too large. Please use an image under 10MB.');
      fileInput.value = ''; return;
    }
    _cropFileInput = fileInput;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        _cropImg = img;
        const size = Math.min(320, window.innerWidth - 40);
        _cropDisplaySize = size;
        const wrap = document.getElementById('crop-wrap');
        wrap.style.width = `${size}px`;
        wrap.style.height = `${size}px`;
        const canvas = document.getElementById('crop-preview');
        canvas.width = size;
        canvas.height = size;
        _cropScale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
        _cropImgDisplayW = img.naturalWidth * _cropScale;
        _cropImgDisplayH = img.naturalHeight * _cropScale;
        _cropOffsetX = (size - _cropImgDisplayW) / 2;
        _cropOffsetY = (size - _cropImgDisplayH) / 2;
        _clampCropOffset();
        _drawCrop();
        const modal = document.getElementById('crop-modal');
        modal.style.display = 'flex';
      };
      img.onerror = () => { showToast('Failed to read image.'); fileInput.value = ''; };
      img.src = e.target.result;
    };
    reader.onerror = () => { showToast('Failed to read file.'); fileInput.value = ''; };
    reader.readAsDataURL(file);
  };

  function _clampCropOffset() {
    const s = _cropDisplaySize;
    _cropOffsetX = Math.max(s - _cropImgDisplayW, Math.min(0, _cropOffsetX));
    _cropOffsetY = Math.max(s - _cropImgDisplayH, Math.min(0, _cropOffsetY));
  }

  function _drawCrop() {
    const canvas = document.getElementById('crop-preview');
    if (!canvas || !_cropImg) return;
    const ctx = canvas.getContext('2d');
    const s = _cropDisplaySize;
    ctx.clearRect(0, 0, s, s);
    ctx.drawImage(_cropImg, _cropOffsetX, _cropOffsetY, _cropImgDisplayW, _cropImgDisplayH);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(s * i / 3, 0); ctx.lineTo(s * i / 3, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, s * i / 3); ctx.lineTo(s, s * i / 3); ctx.stroke();
    }
  }

  document.addEventListener('mousedown', (e) => {
    if (!e.target || e.target.id !== 'crop-preview') return;
    _cropDragging = true;
    _cropDragStartX = e.clientX;
    _cropDragStartY = e.clientY;
    e.target.style.cursor = 'grabbing';
  });
  document.addEventListener('mousemove', (e) => {
    if (!_cropDragging) return;
    _cropOffsetX += e.clientX - _cropDragStartX;
    _cropOffsetY += e.clientY - _cropDragStartY;
    _cropDragStartX = e.clientX;
    _cropDragStartY = e.clientY;
    _clampCropOffset();
    _drawCrop();
  });
  document.addEventListener('mouseup', () => {
    if (_cropDragging) {
      _cropDragging = false;
      const c = document.getElementById('crop-preview');
      if (c) c.style.cursor = 'grab';
    }
  });

  document.addEventListener('touchstart', (e) => {
    if (!e.target || e.target.id !== 'crop-preview' || e.touches.length !== 1) return;
    _cropDragging = true;
    _cropDragStartX = e.touches[0].clientX;
    _cropDragStartY = e.touches[0].clientY;
    e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (!_cropDragging || e.touches.length !== 1) return;
    _cropOffsetX += e.touches[0].clientX - _cropDragStartX;
    _cropOffsetY += e.touches[0].clientY - _cropDragStartY;
    _cropDragStartX = e.touches[0].clientX;
    _cropDragStartY = e.touches[0].clientY;
    _clampCropOffset();
    _drawCrop();
    e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchend', (e) => {
    if (e.target && e.target.id === 'crop-preview') _cropDragging = false;
  });

  window.cancelCrop = () => {
    document.getElementById('crop-modal').style.display = 'none';
    if (_cropFileInput) _cropFileInput.value = '';
    _cropFileInput = null; _cropImg = null;
  };

  window.confirmCrop = async () => {
    if (!_cropImg) return;
    document.getElementById('crop-modal').style.display = 'none';
    const s = _cropDisplaySize;
    const cropX = -_cropOffsetX / _cropScale;
    const cropY = -_cropOffsetY / _cropScale;
    const cropW = s / _cropScale;
    const cropH = s / _cropScale;
    const out = document.createElement('canvas');
    out.width = 800; out.height = 800;
    out.getContext('2d').drawImage(_cropImg, cropX, cropY, cropW, cropH, 0, 0, 800, 800);
    const base64 = out.toDataURL('image/jpeg', 0.85);
    const ui = { preview: 'preview-avatar', prompt: 'prompt-avatar', loading: 'loading-avatar', input: 'ed-photo' };
    document.getElementById(ui.prompt).classList.add('hidden');
    document.getElementById(ui.loading).classList.remove('hidden');
    try {
      const res = await fetch(UPLOAD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: authToken, image_base64: base64, file_type: 'image/jpeg', image_type: 'avatar' })
      });
      const data = await res.json();
      document.getElementById(ui.loading).classList.add('hidden');
      if (!res.ok) {
        document.getElementById(ui.prompt).classList.remove('hidden');
        showToast(`Upload failed: ${data.error || 'Unknown error'}`);
      } else {
        const allowedPrefixes = ['https://pjyorgedaxevxophpfib.supabase.co/storage/', '/.netlify/images?'];
        if (!data.url || !allowedPrefixes.some(p => data.url.startsWith(p))) {
          document.getElementById(ui.prompt).classList.remove('hidden');
          showToast('Upload returned an unexpected URL. Please try again.');
        } else {
          document.getElementById(ui.preview).innerHTML = `<img src="${esc(data.url)}" alt="Uploaded image">`;
          document.getElementById(ui.input).value = data.url;
          const safeName = (currentAgent.name || '').replace(/[<>"'&]/g, '');
          document.getElementById('edit-avatar').innerHTML = `<img src="${esc(data.url)}" srcset="${esc(`/.netlify/images?url=${encodeURIComponent(data.url)}&w=80&fm=webp&q=80`)} 80w, ${esc(`/.netlify/images?url=${encodeURIComponent(data.url)}&w=160&fm=webp&q=80`)} 160w" sizes="80px" width="80" height="80" alt="${safeName}">`;
        }
      }
    } catch (e) {
      if (typeof window.reportError === 'function') window.reportError('edit/confirmCrop', e);
      else console.error('[edit/confirmCrop]', e);
      document.getElementById(ui.loading).classList.add('hidden');
      document.getElementById(ui.prompt).classList.remove('hidden');
      showToast('Upload failed. Check your connection and try again.');
    }
    if (_cropFileInput) _cropFileInput.value = '';
    _cropFileInput = null; _cropImg = null;
  };

})();
