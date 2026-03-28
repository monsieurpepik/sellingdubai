// ==========================================
// LEAD MODAL
// ==========================================
import { CAPTURE_URL } from './config.js';
import { logEvent } from './analytics.js';
import { currentAgent } from './state.js';

// Track previously focused element for focus restoration
let _previousFocus = null;

// Rate-limit state: 30s cooldown between submissions
let _lastLeadSubmit = 0;
const LEAD_COOLDOWN_MS = 30000;

window.openLead = function() {
  if (!currentAgent) return;
  _previousFocus = document.activeElement;
  document.getElementById('lead-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('modal-agent-name').textContent = currentAgent.name || '';
  document.getElementById('lead-form').classList.remove('hidden');
  document.getElementById('lead-success').classList.add('hidden');
  document.getElementById('lead-error').classList.remove('show');
  document.getElementById('lead-error').textContent = '';
  // Focus first input after animation
  setTimeout(() => { document.getElementById('lead-name').focus(); }, 100);
};

window.closeLead = function() {
  document.getElementById('lead-modal').classList.remove('open');
  document.body.style.overflow = '';
  // Restore focus to the element that opened the modal
  if (_previousFocus && _previousFocus.focus) { _previousFocus.focus(); _previousFocus = null; }
  document.getElementById('lead-name').value = '';
  document.getElementById('lead-phone').value = '';
  document.getElementById('lead-email').value = '';
  document.getElementById('lead-budget').value = '';
  document.getElementById('lead-type').value = '';
  document.getElementById('lead-area').value = '';
  document.getElementById('lead-message').value = '';
  document.getElementById('lead-error').classList.remove('show');
  const btn = document.getElementById('btn-lead');
  btn.disabled = false;
  btn.textContent = 'Send My Inquiry';
  document.getElementById('lead-extra').classList.remove('open');
  document.getElementById('lead-expander').classList.remove('open');
};

window.toggleExtra = function() {
  const extra = document.getElementById('lead-extra');
  const btn = document.getElementById('lead-expander');
  extra.classList.toggle('open');
  btn.classList.toggle('open');
};

window.submitLead = async function() {
  const errEl = document.getElementById('lead-error');
  errEl.classList.remove('show');

  // Client-side rate limit
  const now = Date.now();
  if (now - _lastLeadSubmit < LEAD_COOLDOWN_MS) {
    const secs = Math.ceil((LEAD_COOLDOWN_MS - (now - _lastLeadSubmit)) / 1000);
    errEl.textContent = `Please wait ${secs}s before submitting again.`;
    errEl.classList.add('show');
    return;
  }

  const name = document.getElementById('lead-name').value.trim();
  const phone = document.getElementById('lead-phone').value.trim();
  const email = document.getElementById('lead-email').value.trim();

  // Honeypot check — bots fill hidden fields; don't send value to server
  const hp = document.getElementById('lead-website');
  if (hp && hp.value) { errEl.textContent = 'Submission blocked.'; errEl.classList.add('show'); return; }

  if (!name || name.length < 2) { errEl.textContent = 'Please enter your full name.'; errEl.classList.add('show'); return; }
  if (!phone && !email) { errEl.textContent = 'Please enter a phone number or email.'; errEl.classList.add('show'); return; }
  if (phone && phone.length < 7) { errEl.textContent = 'Please enter a valid phone number.'; errEl.classList.add('show'); return; }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.textContent = 'Please enter a valid email address.'; errEl.classList.add('show'); return; }

  const btn = document.getElementById('btn-lead');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-sm"></span> Sending...';

  try {
    const params = new URLSearchParams(window.location.search);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
    const res = await fetch(CAPTURE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        agent_slug: currentAgent.slug,
        name,
        phone: phone || null,
        email: email || null,
        budget_range: document.getElementById('lead-budget').value || null,
        property_type: document.getElementById('lead-type').value || null,
        preferred_area: document.getElementById('lead-area').value.trim() || null,
        message: document.getElementById('lead-message').value.trim() || null,
        source: 'profile',
        utm_source: params.get('utm_source'),
        utm_medium: params.get('utm_medium'),
        utm_campaign: params.get('utm_campaign'),
        device_type: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
      })
    });
    clearTimeout(timeout);
    const data = await res.json();

    if (!res.ok) {
      btn.disabled = false;
      btn.textContent = 'Send My Inquiry';
      errEl.textContent = data.error || 'Something went wrong. Please try again.';
      errEl.classList.add('show');
      return;
    }

    _lastLeadSubmit = Date.now();
    document.getElementById('lead-form').classList.add('hidden');
    document.getElementById('lead-success').classList.remove('hidden');
    document.getElementById('success-msg').textContent =
      `${currentAgent?.name || 'The agent'} has received your inquiry. You'll hear back within 30 minutes during business hours.`;
    logEvent('lead_submit', { source: 'profile_form' });

    if (window.fbq) fbq('track', 'Lead', { content_name: 'SellingDubai Lead', content_category: 'real_estate' });
    if (window.gtag) gtag('event', 'generate_lead', { event_category: 'lead_capture', event_label: currentAgent.slug });
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Send My Inquiry';
    errEl.textContent = e.name === 'AbortError'
      ? 'Request timed out. Please check your connection and try again.'
      : 'Connection error. Please try again.';
    errEl.classList.add('show');
  }
};

// Open lead modal pre-filled with property name
window.openLeadForProperty = function(propertyTitle) {
  document.getElementById('detail-overlay').classList.remove('open');
  closeProps();
  setTimeout(() => {
    openLead();
    const msgEl = document.getElementById('lead-message');
    msgEl.value = `I'm interested in: ${propertyTitle}`;
    const extra = document.getElementById('lead-extra');
    const btn = document.getElementById('lead-expander');
    if (!extra.classList.contains('open')) {
      extra.classList.add('open');
      btn.classList.add('open');
    }
  }, 200);
};
