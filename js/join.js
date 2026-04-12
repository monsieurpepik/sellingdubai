// @ts-check
const SUPABASE_URL = window.__SD_SUPABASE_URL__ || 'https://pjyorgedaxevxophpfib.supabase.co';
const VERIFY_URL = `${SUPABASE_URL}/functions/v1/verify-broker`;
const CREATE_URL = `${SUPABASE_URL}/functions/v1/create-agent`;
const OTP_URL = `${SUPABASE_URL}/functions/v1/send-otp`;
const REFERRAL_URL = `${SUPABASE_URL}/functions/v1/track-referral`;

// Capture referral code from URL (?ref=CODE)
const _refCode = new URLSearchParams(window.location.search).get('ref');

// Capture agency invite token from URL (?agency=TOKEN)
// Falls back to localStorage so it survives a page refresh mid-flow.
let agencyToken = new URLSearchParams(window.location.search).get('agency')
  || localStorage.getItem('agencyInviteToken')
  || null;
if (agencyToken) {
  localStorage.setItem('agencyInviteToken', agencyToken);
}

let verifiedBroker = null;
let createdSlug = null;
let _otpSent = false;

function goStep(n) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById(`step-${n}`).classList.add('active');

  // Update step dots
  for (let i = 1; i <= 3; i++) {
    const dot = document.getElementById(`dot-${i}`);
    dot.classList.remove('active', 'done');
    if (i < n) dot.classList.add('done');
    if (i === n) dot.classList.add('active');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Show referral badge if ?ref= is present
if (_refCode) {
  const badge = document.getElementById('referral-badge');
  if (badge) {
    badge.textContent = `Invited by a fellow agent`;
    badge.style.display = 'block';
  }
}

function showError(step, msg) {
  const el = document.getElementById(`error-${step}`);
  el.textContent = msg; el.classList.add('show');
}

function clearError(step) {
  const el = document.getElementById(`error-${step}`);
  if (el) { el.textContent = ''; el.classList.remove('show'); }
}

function setLoading(btnId, loading, text, isWa) {
  const btn = document.getElementById(btnId);
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner ${isWa ? 'spinner-wa' : ''}"></span> ${text}`;
  } else {
    btn.disabled = false;
    btn.textContent = text;
  }
}

function titleCase(str) {
  return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

async function verifyBroker() {
  clearError(1);
  const raw = document.getElementById('broker-number').value.trim();

  // 00000 normalises to 0 in a number input — sent as integer 0. The edge function handles the bypass
  // when ENABLE_TEST_MODE is set. In production (where ENABLE_TEST_MODE is unset) 0 is rejected like any unknown BRN.
  const isTestBrn = raw === '0';
  const num = isTestBrn ? 0 : parseInt(raw, 10);
  if (!isTestBrn) {
    if (!num || Number.isNaN(num)) { showError(1, 'Please enter a valid RERA broker number.'); return; }
    if (raw.length < 4 || raw.length > 7) { showError(1, 'RERA broker numbers are 4–7 digits. Check your RERA card.'); return; }
  }

  setLoading('btn-verify', true, 'Checking registry...', true);

  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ broker_number: num })
    });
    const data = await res.json();

    if (!res.ok || !data.verified) {
      setLoading('btn-verify', false, 'Verify My License');
      showError(1, data.error || 'Broker number not found in our registry.');
      // Show fallback upload option
      document.getElementById('fallback-upload').style.display = 'block';
      document.getElementById('broker-number').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!data.license_active) {
      setLoading('btn-verify', false, 'Verify My License');
      showError(1, `License expired on ${data.broker.license_end}. Renew to register.`);
      return;
    }

    verifiedBroker = data.broker;
    const name = titleCase(data.broker.name_en);

    document.getElementById('verify-name').textContent = name;
    document.getElementById('verify-bn').textContent = `#${data.broker.broker_number}`;
    document.getElementById('verify-expiry').textContent = data.broker.license_end;
    document.getElementById('verify-status').textContent = 'Active';
    document.getElementById('step2-name').textContent = name;
    document.getElementById('display-name').value = name;

    setLoading('btn-verify', false, 'Verify My License');
    if (typeof gtag === 'function') gtag('event', 'step1_complete');
    saveFormState();
    goStep(2);
  } catch (e) {
    setLoading('btn-verify', false, 'Verify My License');
    showError(1, networkErrorMsg());
    if (typeof window.reportError === 'function') window.reportError('join/verifyBroker', e);
    else console.error('[join/verifyBroker]', e);
  }
}

// Compress image to max 800px, JPEG quality 0.8
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
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function previewPhoto(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { showError(2, 'Photo must be under 10MB.'); return; }
  clearError(2);

  const placeholder = document.getElementById('photo-placeholder');
  const prev = document.getElementById('photo-preview');
  const dataInput = document.getElementById('onboard-photo-data');
  if (!placeholder || !prev || !dataInput) return;

  compressImage(file, 800, 0.8).then((dataUrl) => {
    placeholder.style.display = 'none';
    prev.style.display = 'block';
    prev.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    dataInput.value = dataUrl.split(',')[1];
  }, () => {
    placeholder.style.display = '';
    prev.style.display = 'none';
    prev.innerHTML = '';
    showError(2, 'Failed to process photo. Try a different image.');
  });
}
window.previewPhoto = previewPhoto;

// ========== OTP FLOW ==========
async function sendOtpAndShow() {
  clearError(2);
  const displayName = document.getElementById('display-name').value.trim();
  if (!displayName) { showError(2, 'Display name is required.'); return; }

  const email = document.getElementById('email').value.trim();
  if (!email?.includes('@')) { showError(2, 'Email is required — you\'ll need it to edit your profile later.'); return; }

  const wa = document.getElementById('whatsapp').value.trim();
  if (!wa) { showError(2, 'WhatsApp number is required — it\'s your main contact button.'); return; }

  setLoading('btn-create', true, 'Sending verification code...', true);

  try {
    const res = await fetch(OTP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        broker_number: verifiedBroker ? verifiedBroker.broker_number : null
      })
    });
    const data = await res.json().then(null, () => ({}));

    if (!res.ok) {
      setLoading('btn-create', false, 'Create My Profile');
      showError(2, data.error || `Server error ${res.status} — please try again.`);
      return;
    }

    _otpSent = true;
    document.getElementById('otp-email-display').textContent = email;
    document.getElementById('otp-section').style.display = 'block';
    document.getElementById('btn-create').style.display = 'none';
    document.getElementById('btn-back-step1').style.display = 'none';
    document.getElementById('otp-code').focus();
    setLoading('btn-create', false, 'Create My Profile');
  } catch (e) {
    setLoading('btn-create', false, 'Create My Profile');
    showError(2, e instanceof TypeError ? networkErrorMsg() : `Error: ${e.message}`);
    if (typeof window.reportError === 'function') window.reportError('join/sendOtpAndShow', e);
    else console.error('[join/sendOtpAndShow]', e);
  }
}

function resendOtp() {
  clearError(2);
  const email = document.getElementById('email').value.trim();
  const btn = document.getElementById('btn-resend-otp');
  btn.textContent = 'Sending...';
  btn.disabled = true;

  fetch(OTP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: email,
      broker_number: verifiedBroker ? verifiedBroker.broker_number : null
    })
  }).then((res) => res.json().then(null, () => ({})).then((data) => {
      if (!res.ok) {
        showError(2, data.error || 'Failed to resend code.');
        btn.textContent = "Didn't get it? Resend code";
        btn.disabled = false;
      } else {
        let countdown = 60;
        btn.textContent = `Resend code (${countdown}s)`;
        const countdownTimer = setInterval(() => {
          countdown--;
          if (countdown <= 0) {
            clearInterval(countdownTimer);
            btn.textContent = "Didn't get it? Resend code";
            btn.disabled = false;
          } else {
            btn.textContent = `Resend code (${countdown}s)`;
          }
        }, 1000);
      }
    }), () => {
    showError(2, networkErrorMsg());
    btn.textContent = "Didn't get it? Resend code";
    btn.disabled = false;
  });
}

async function verifyOtpAndCreate() {
  clearError(2);
  const code = document.getElementById('otp-code').value.trim();
  if (!code || code.length !== 6) { showError(2, 'Please enter the 6-digit code from your email.'); return; }

  setLoading('btn-verify-otp', true, 'Verifying...', true);
  await createProfile(code);
}

async function createProfile(otpCode) {
  clearError(2);
  const displayName = document.getElementById('display-name').value.trim();
  if (!displayName) { showError(2, 'Display name is required.'); return; }

  const email = document.getElementById('email').value.trim();
  if (!email?.includes('@')) { showError(2, 'Email is required — you\'ll need it to edit your profile later.'); return; }

  const wa = document.getElementById('whatsapp').value.trim();
  if (!wa) { showError(2, 'WhatsApp number is required — it\'s your main contact button.'); return; }

  if (!otpCode) { showError(2, 'Verification code is required.'); return; }

  if (!verifiedBroker) { showError(2, 'Broker verification required. Please complete step 1.'); return; }

  setLoading('btn-verify-otp', true, 'Creating profile...', true);

  try {
    const payload = {
      broker_number: verifiedBroker.broker_number,
      display_name: displayName,
      whatsapp: wa,
      email: email,
      otp_code: otpCode,
      tagline: document.getElementById('tagline').value.trim() || null,
      calendly_url: document.getElementById('calendly').value.trim() || null,
      instagram_url: document.getElementById('instagram').value.trim() || null,
      youtube_url: document.getElementById('youtube').value.trim() || null,
      tiktok_url: document.getElementById('tiktok').value.trim() || null,
      linkedin_url: document.getElementById('linkedin').value.trim() || null,
      photo_base64: document.getElementById('onboard-photo-data').value || null,
      ...(agencyToken ? { agency_invite_token: agencyToken } : {}),
    };

    // Manual verification path: include RERA card image and flag
    if (isManualVerification) {
      payload.manual_verification = true;
      payload.rera_image_base64 = verifiedBroker.rera_image_base64 || null;
      payload.rera_file_type = verifiedBroker.rera_file_type || null;
    }

    const res = await fetch(CREATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().then(null, () => ({}));

    if (!res.ok) {
      setLoading('btn-verify-otp', false, 'Verify & Create Profile');
      showError(2, data.slug
        ? `This broker already has a profile at sellingdubai.ae/a/${data.slug}`
        : (data.error || `Server error ${res.status} — please try again or contact support.`));
      return;
    }

    createdSlug = data.agent.slug;
    const editToken = data.edit_token || null;

    // Save token to localStorage for persistent login across edit/dashboard
    if (editToken) {
      localStorage.setItem('sd_edit_token', editToken);
    }

    // Track referral if agent arrived via ?ref=CODE
    if (_refCode && data.agent.id) {
      fetch(REFERRAL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referral_code: _refCode, agent_id: data.agent.id })
      }).then(null, (e) => { console.error('[referral] tracking failed:', e); }); // fire-and-forget, don't block signup
    }

    // Populate the preview card — show photo if uploaded, else initials
    const photoData = document.getElementById('onboard-photo-data').value;
    const previewAvatar = document.getElementById('preview-initials');
    if (photoData) {
      previewAvatar.innerHTML = `<img src="data:image/jpeg;base64,${photoData}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else if (data.agent?.photo_url) {
      previewAvatar.innerHTML = `<img src="/.netlify/images?url=${encodeURIComponent(data.agent.photo_url)}&w=80&fm=webp&q=80" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
      previewAvatar.textContent = getInitials(displayName);
    }
    document.getElementById('preview-name').textContent = displayName;
    document.getElementById('preview-tagline').textContent =
      document.getElementById('tagline').value.trim() || 'Licensed Real Estate Broker in Dubai';
    document.getElementById('preview-broker').textContent = verifiedBroker.broker_number ? `#${verifiedBroker.broker_number}` : 'Pending';
    document.getElementById('profile-url').textContent = `sellingdubai.ae/a/${createdSlug}`;
    document.getElementById('btn-view').href = `/a/${createdSlug}`;

    // Token is already in localStorage — edit.html will pick it up automatically
    // No need to pass token in URL (prevents leakage via browser history/referrer)

    // ALL signups are pending verification — update step 3 messaging
    if (isManualVerification) {
      document.querySelector('#step-3 .name').textContent = "You're Almost Live";
      document.querySelector('#step-3 .bio').textContent = "Your profile is created. We'll verify your RERA card within 24 hours and you'll get the verified badge.";
    } else {
      document.querySelector('#step-3 .name').textContent = "You're Almost Live";
      document.querySelector('#step-3 .bio').textContent = "Your profile is created. We'll verify your identity within 24 hours and your profile will go live.";
    }
    // Show amber/pending icon for all paths since verification is manual
    document.querySelector('#step-3 .profile-icon').innerHTML = '<svg width="44" height="44" viewBox="0 0 24 24" fill="rgba(255,255,255,0.55)"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>';
    document.querySelector('#step-3 .profile-icon').style.borderColor = 'rgba(255,255,255,0.2)';

    clearFormState();
    setLoading('btn-verify-otp', false, 'Verify & Create Profile');
    if (typeof gtag === 'function') gtag('event', 'profile_created');
    goStep(3);
  } catch (e) {
    setLoading('btn-verify-otp', false, 'Verify & Create Profile');
    showError(2, e instanceof TypeError ? networkErrorMsg() : `Error: ${e.message}`);
    if (typeof window.reportError === 'function') window.reportError('join/createProfile', e);
    else console.error('[join/createProfile]', e);
  }
}

function copyUrl() {
  const url = `https://sellingdubai.ae/a/${createdSlug}`;
  const doCopy = navigator.clipboard?.writeText
    ? navigator.clipboard.writeText(url)
    : new Promise((resolve, reject) => {
        const ta = document.createElement('textarea');
        ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        if (document.execCommand('copy')) { resolve(); } else { reject(new Error('execCommand failed')); }
        document.body.removeChild(ta);
      });
  doCopy.then(() => {
    const btn = document.querySelector('.btn-copy');
    btn.textContent = 'COPIED'; setTimeout(() => { btn.textContent = 'Copy Link'; }, 2000);
  }, () => {});
}

function shareWhatsApp() {
  const url = `https://sellingdubai.ae/a/${createdSlug}`;
  const text = encodeURIComponent(`Check out my verified Dubai real estate profile: ${url}`);
  window.open(`https://wa.me/?text=${text}`, '_blank');
}

// Handle bg image load failure — fallback to gradient
const bgEl = document.getElementById('bg');
const bgImg = new Image();
bgImg.onload = () => { /* image loaded fine */ };
bgImg.onerror = () => { bgEl.classList.add('bg-fallback'); };
bgImg.src = '/.netlify/images?url=/dubai-skyline.jpg&w=1600&fm=webp&q=80';

function networkErrorMsg() {
  return navigator.onLine
    ? 'Something went wrong on our end. Please try again in a moment.'
    : 'No internet connection. Check your connection and try again.';
}

document.getElementById('broker-number').addEventListener('keydown', e => { if (e.key === 'Enter') verifyBroker(); });
document.getElementById('otp-code').addEventListener('keydown', e => { if (e.key === 'Enter') verifyOtpAndCreate(); });

// RERA card upload preview
function previewRera(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showError(1, 'File must be under 5MB.'); return; }
  clearError(1);

  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('rera-photo-data').value = e.target.result.split(',')[1];
    document.getElementById('rera-file-type').value = file.type;

    if (file.type.startsWith('image/')) {
      document.getElementById('rera-placeholder').style.display = 'none';
      const prev = document.getElementById('rera-preview');
      prev.style.display = 'block';
      document.getElementById('rera-preview-img').src = e.target.result;
    } else {
      // PDF - just show confirmation text
      document.getElementById('rera-placeholder').innerHTML = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="#25d366" style="margin-bottom:8px;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
        <div style="font-size:13px;color:#25d366;font-weight:600;">${file.name}</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:4px;">Tap to change file</div>
      `;
    }

    // Visual feedback
    document.getElementById('rera-upload-area').style.borderColor = 'rgba(37,211,102,0.3)';
    document.getElementById('rera-upload-area').style.background = 'rgba(37,211,102,0.04)';
  };
  reader.readAsDataURL(file);
}

// ========== FORM STATE PERSISTENCE ==========
const FORM_DRAFT_KEY = 'sd_join_draft';

function saveFormState() {
  try {
    // Determine current visible step
    let currentStep = 1;
    if (document.getElementById('step-2')?.classList.contains('active')) currentStep = 2;
    if (document.getElementById('step-3')?.classList.contains('active')) currentStep = 3;

    localStorage.setItem(FORM_DRAFT_KEY, JSON.stringify({
      displayName: document.getElementById('display-name').value,
      email:       document.getElementById('email').value,
      whatsapp:    document.getElementById('whatsapp').value,
      tagline:     document.getElementById('tagline').value,
      calendly:    document.getElementById('calendly').value,
      instagram:   document.getElementById('instagram').value,
      youtube:     document.getElementById('youtube').value,
      tiktok:      document.getElementById('tiktok').value,
      linkedin:    document.getElementById('linkedin').value,
      step: currentStep,
      verifiedBroker: verifiedBroker || null,
    }));
  } catch(e) { console.warn('[join] Could not save form draft to localStorage:', e); }
}

function restoreFormState() {
  try {
    const raw = localStorage.getItem(FORM_DRAFT_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.displayName) document.getElementById('display-name').value = s.displayName;
    if (s.email)       document.getElementById('email').value       = s.email;
    if (s.whatsapp)    document.getElementById('whatsapp').value    = s.whatsapp;
    if (s.tagline)     document.getElementById('tagline').value     = s.tagline;
    if (s.calendly)    document.getElementById('calendly').value    = s.calendly;
    if (s.instagram)   document.getElementById('instagram').value   = s.instagram;
    if (s.youtube)     document.getElementById('youtube').value     = s.youtube;
    if (s.tiktok)      document.getElementById('tiktok').value      = s.tiktok;
    if (s.linkedin)    document.getElementById('linkedin').value    = s.linkedin;

    // Resume step 2 if agent had already completed broker verification
    if (s.step === 2 && s.verifiedBroker) {
      verifiedBroker = s.verifiedBroker;
      const name = titleCase(verifiedBroker.name_en || '');
      document.getElementById('verify-name').textContent = name;
      document.getElementById('verify-bn').textContent = `#${verifiedBroker.broker_number}`;
      document.getElementById('verify-expiry').textContent = verifiedBroker.license_end || '—';
      document.getElementById('verify-status').textContent = 'Active';
      document.getElementById('step2-name').textContent = name;
      if (s.displayName) document.getElementById('display-name').value = s.displayName;
      goStep(2);
    }
  } catch(e) { console.warn('[join] Could not restore form draft from localStorage:', e); }
}

function clearFormState() {
  localStorage.removeItem(FORM_DRAFT_KEY);
  localStorage.removeItem('agencyInviteToken');
}

// Attach save-on-input listeners to all persisted fields
['display-name','email','whatsapp','tagline','calendly','instagram','youtube','tiktok','linkedin']
  .forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', saveFormState);
  });

// Restore any previously saved draft on page load
restoreFormState();

// Manual RERA submission - goes to step 2 with pending status
let isManualVerification = false;

async function manualSubmit() {
  clearError(1);
  const name = document.getElementById('manual-name').value.trim();
  const reraData = document.getElementById('rera-photo-data').value;
  const brokerNum = document.getElementById('broker-number').value.trim();

  if (!name) { showError(1, 'Please enter your full name.'); return; }
  if (!reraData) { showError(1, 'Please upload a photo of your RERA card.'); return; }

  isManualVerification = true;

  // Build a synthetic verifiedBroker object for the manual path
  verifiedBroker = {
    broker_number: brokerNum || 0,
    name_en: name,
    license_end: 'Pending verification',
    manual_verification: true,
    rera_image_base64: reraData,
    rera_file_type: document.getElementById('rera-file-type').value
  };

  // Populate step 2 for manual flow
  document.getElementById('verify-name').textContent = name;
  document.getElementById('verify-bn').textContent = brokerNum ? `#${brokerNum}` : 'Pending';
  document.getElementById('verify-expiry').textContent = 'Under review';
  document.getElementById('verify-status').textContent = 'Pending Review';
  document.getElementById('verify-status').classList.remove('active');
  document.getElementById('verify-status').style.color = 'rgba(255,255,255,0.55)';

  // Update the badge to show pending
  const badge = document.querySelector('.verify-card .badge');
  badge.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255,255,255,0.55)"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
    Pending Manual Verification
  `;
  badge.style.color = 'rgba(255,255,255,0.55)';

  document.getElementById('step2-name').textContent = name;
  document.getElementById('display-name').value = name;

  saveFormState();
  goStep(2);
}

// Expose functions needed by event-delegation.js
window.verifyBroker = verifyBroker;
window.manualSubmit = manualSubmit;
window.previewRera = previewRera;
// window.previewPhoto already exported above
window.sendOtpAndShow = sendOtpAndShow;
window.verifyOtpAndCreate = verifyOtpAndCreate;
window.resendOtp = resendOtp;
window.goStep = goStep;
window.copyUrl = copyUrl;
window.shareWhatsApp = shareWhatsApp;
