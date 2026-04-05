// ==========================================
// LEAD MODAL
// ==========================================
import { CAPTURE_URL } from './config.js';
import { logEvent } from './analytics.js';
import { currentAgent } from './state.js';

// Track previously focused element for focus restoration
let _previousFocus: Element | null = null;

// Rate-limit state: 30s cooldown between submissions
let _lastLeadSubmit = 0;
const LEAD_COOLDOWN_MS = 30000;

// Brochure-request state: set by openLeadForBrochure, cleared on close/submit
let _pendingBrochureUrl: string | null = null;
let _pendingSource = 'profile';

function getEl<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

window.openLead = function() {
  if (!currentAgent) return;
  _previousFocus = document.activeElement;
  getEl('lead-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
  getEl('modal-agent-name').textContent = currentAgent.name || '';
  getEl('lead-form').classList.remove('hidden');
  getEl('lead-success').classList.add('hidden');
  getEl('lead-error').classList.remove('show');
  getEl('lead-error').textContent = '';
  // Focus first input after animation
  setTimeout(() => { getEl<HTMLInputElement>('lead-name').focus(); }, 100);
};

window.closeLead = function() {
  getEl('lead-modal').classList.remove('open');
  document.body.style.overflow = '';
  // Restore focus to the element that opened the modal
  if (_previousFocus && (_previousFocus as HTMLElement).focus) { (_previousFocus as HTMLElement).focus(); _previousFocus = null; }
  getEl<HTMLInputElement>('lead-name').value = '';
  getEl<HTMLInputElement>('lead-phone').value = '';
  getEl<HTMLInputElement>('lead-email').value = '';
  getEl<HTMLSelectElement>('lead-budget').value = '';
  getEl<HTMLSelectElement>('lead-type').value = '';
  getEl<HTMLInputElement>('lead-area').value = '';
  getEl<HTMLTextAreaElement>('lead-message').value = '';
  getEl('lead-error').classList.remove('show');
  const btn = getEl<HTMLButtonElement>('btn-lead');
  btn.disabled = false;
  btn.textContent = 'Send My Inquiry';
  getEl('lead-extra').classList.remove('open');
  getEl('lead-expander').classList.remove('open');
  _pendingBrochureUrl = null;
  _pendingSource = 'profile';
};

window.toggleExtra = function() {
  const extra = getEl('lead-extra');
  const btn = getEl('lead-expander');
  extra.classList.toggle('open');
  btn.classList.toggle('open');
};

window.submitLead = async function() {
  const errEl = getEl('lead-error');
  errEl.classList.remove('show');

  // Client-side rate limit
  const now = Date.now();
  if (now - _lastLeadSubmit < LEAD_COOLDOWN_MS) {
    const secs = Math.ceil((LEAD_COOLDOWN_MS - (now - _lastLeadSubmit)) / 1000);
    errEl.textContent = `Please wait ${secs} seconds before submitting again.`;
    errEl.classList.add('show');
    return;
  }

  const name = getEl<HTMLInputElement>('lead-name').value.trim();
  const phone = getEl<HTMLInputElement>('lead-phone').value.trim();
  const email = getEl<HTMLInputElement>('lead-email').value.trim();

  // Honeypot check — bots fill hidden fields; don't send value to server
  const hp = document.getElementById('lead-website') as HTMLInputElement | null;
  if (hp && hp.value) { errEl.textContent = 'Submission blocked.'; errEl.classList.add('show'); return; }

  if (!name || name.length < 2) { errEl.textContent = 'Please enter your full name.'; errEl.classList.add('show'); return; }
  if (!phone && !email) { errEl.textContent = 'Please enter a phone number or email.'; errEl.classList.add('show'); return; }
  if (phone && phone.length < 7) { errEl.textContent = 'Please enter a valid phone number.'; errEl.classList.add('show'); return; }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.textContent = 'Please enter a valid email address.'; errEl.classList.add('show'); return; }

  const btn = getEl<HTMLButtonElement>('btn-lead');
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
        agent_slug: currentAgent?.slug,
        name,
        phone: phone || null,
        email: email || null,
        budget_range: getEl<HTMLSelectElement>('lead-budget').value || null,
        property_type: getEl<HTMLSelectElement>('lead-type').value || null,
        preferred_area: getEl<HTMLInputElement>('lead-area').value.trim() || null,
        message: getEl<HTMLTextAreaElement>('lead-message').value.trim() || null,
        source: _pendingSource,
        utm_source: params.get('utm_source'),
        utm_medium: params.get('utm_medium'),
        utm_campaign: params.get('utm_campaign'),
        device_type: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
      })
    });
    clearTimeout(timeout);
    const data = await res.json() as { error?: string };

    if (!res.ok) {
      btn.disabled = false;
      btn.textContent = 'Send My Inquiry';
      errEl.textContent = data.error || 'Something went wrong. Please try again.';
      errEl.classList.add('show');
      return;
    }

    _lastLeadSubmit = Date.now();
    getEl('lead-form').classList.add('hidden');
    getEl('lead-success').classList.remove('hidden');

    const submittedSource = _pendingSource;
    if (_pendingBrochureUrl) {
      const brochureUrl = _pendingBrochureUrl;
      _pendingBrochureUrl = null;
      _pendingSource = 'profile';
      const opened = window.open(brochureUrl, '_blank');
      if (opened) {
        getEl('success-msg').textContent =
          `Your brochure is opening now. ${currentAgent?.name || 'The agent'} will be in touch shortly.`;
      } else {
        // Popup blocked — show fallback link
        const successMsg = getEl('success-msg');
        successMsg.innerHTML = 'Request received! ';
        const link = document.createElement('a');
        link.href = brochureUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Click here to open your brochure';
        link.style.cssText = 'color:#4f9ef8;text-decoration:underline;';
        successMsg.appendChild(link);
        successMsg.appendChild(document.createTextNode(`.`));
      }
    } else {
      getEl('success-msg').textContent =
        `Your inquiry has been sent to ${currentAgent?.name || 'the agent'} directly. You should receive a response during business hours.`;
    }

    logEvent('lead_submit', { source: submittedSource === 'brochure_request' ? 'brochure_form' : 'profile_form' });

    if ((window as unknown as { fbq?: Function }).fbq) (window as unknown as { fbq: Function }).fbq('track', 'Lead', { content_name: 'SellingDubai Lead', content_category: 'real_estate' });
    if ((window as unknown as { gtag?: Function }).gtag) (window as unknown as { gtag: Function }).gtag('event', 'generate_lead', { event_category: 'lead_capture', event_label: currentAgent?.slug });
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Send My Inquiry';
    errEl.textContent = e instanceof Error && e.name === 'AbortError'
      ? 'Request timed out. Please check your connection and try again.'
      : 'Connection error. Please try again.';
    errEl.classList.add('show');
  }
};

// Open lead modal pre-filled for a brochure request; opens PDF after successful submit
window.openLeadForBrochure = function(projectName, brochureUrl) {
  _pendingBrochureUrl = brochureUrl;
  _pendingSource = 'brochure_request';
  window.openLead?.();
  setTimeout(() => {
    const msgEl = getEl<HTMLTextAreaElement>('lead-message');
    if (msgEl) msgEl.value = `I'd like to receive the brochure for ${projectName}`;
    const extra = getEl('lead-extra');
    const expander = getEl('lead-expander');
    if (extra && !extra.classList.contains('open')) {
      extra.classList.add('open');
      if (expander) expander.classList.add('open');
    }
  }, 150);
};

// Open lead modal pre-filled with property name
window.openLeadForProperty = function(propertyTitle) {
  getEl('detail-overlay').classList.remove('open');
  window.closeProps?.();
  setTimeout(() => {
    window.openLead?.();
    const msgEl = getEl<HTMLTextAreaElement>('lead-message');
    msgEl.value = `I'm interested in: ${propertyTitle}`;
    const extra = getEl('lead-extra');
    const btn = getEl('lead-expander');
    if (!extra.classList.contains('open')) {
      extra.classList.add('open');
      btn.classList.add('open');
    }
  }, 200);
};
