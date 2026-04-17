// ==========================================
// LEAD MODAL
// ==========================================

import { logEvent } from './analytics';
import { CAPTURE_URL } from './config';
import { currentAgent } from './state';

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

window.openLead = () => {
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

window.closeLead = () => {
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

window.toggleExtra = () => {
  const extra = getEl('lead-extra');
  const btn = getEl('lead-expander');
  extra.classList.toggle('open');
  btn.classList.toggle('open');
};

window.submitLead = async () => {
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
  if (hp?.value) { errEl.textContent = 'Submission blocked.'; errEl.classList.add('show'); return; }

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
window.openLeadForBrochure = (projectName, brochureUrl) => {
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

// ==========================================
// INTENT FLOWS — Sell & Buy/Rent qualifier
// ==========================================

const _chipState: Record<string, string> = {
  'sell-type': 'Apartment',
  'sell-timeline': '1-3 months',
  'buy-mode': 'Buy',
  'buy-beds': '2BR',
};

window.selectChip = (el: HTMLElement) => {
  const group = el.dataset.group;
  const val = el.dataset.val;
  if (!group || !val) return;
  _chipState[group] = val;
  el.closest('.chip-row')?.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
};

function _agentFirstName(): string {
  return (currentAgent?.name || '').split(' ')[0] || 'the agent';
}

function _openSheet(id: string): void {
  const sheet = document.getElementById(id);
  if (!sheet) return;
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function _closeSheet(id: string, bodyId: string): void {
  const sheet = document.getElementById(id);
  if (!sheet) return;
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  // Restore body content if it was replaced by success state
  const body = document.getElementById(bodyId);
  if (body && body.querySelector('.sheet-success')) {
    // Reset chip state defaults
    _chipState['sell-type'] = 'Apartment';
    _chipState['sell-timeline'] = '1-3 months';
    _chipState['buy-mode'] = 'Buy';
    _chipState['buy-beds'] = '2BR';
  }
}

function _buildSuccessPanel(agentFirst: string, context: 'sell' | 'buy'): string {
  const msg = context === 'sell'
    ? `WhatsApp is open with your message pre-filled — just tap send. ${agentFirst} will arrange a free valuation, or their AI assistant will reply if it's after hours.`
    : `WhatsApp is open with your search brief pre-filled — just tap send. ${agentFirst} will match you with properties, or their AI assistant will reply if it's after hours.`;
  return `<div class="sheet-success">
    <div class="sheet-success-icon">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="2.5" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>
    </div>
    <div class="sheet-success-title">Message ready!</div>
    <div class="sheet-success-msg">${msg}</div>
    <button class="sheet-cta sheet-cta-ghost" data-action="${context === 'sell' ? 'closeSellFlow' : 'closeBuyFlow'}" style="margin-top:20px;">Done</button>
  </div>`;
}

window.openSellFlow = () => {
  const first = _agentFirstName();
  const subtitle = document.getElementById('sell-subtitle');
  if (subtitle) subtitle.textContent = `Tell ${first} about your property for a free valuation`;
  const nameEl = document.getElementById('sell-agent-name');
  if (nameEl) nameEl.textContent = first;
  _openSheet('sell-sheet');
};

window.closeSellFlow = () => _closeSheet('sell-sheet', 'sell-body');

window.submitSellFlow = () => {
  const phone = (document.getElementById('sell-phone') as HTMLInputElement)?.value.trim();
  const errEl = document.getElementById('sell-error');
  if (!phone) {
    if (errEl) { errEl.textContent = 'Please enter your WhatsApp number.'; errEl.classList.add('show'); }
    return;
  }
  if (errEl) errEl.classList.remove('show');

  const type = _chipState['sell-type'] ?? 'property';
  const timeline = _chipState['sell-timeline'] ?? '';
  const location = (document.getElementById('sell-location') as HTMLInputElement)?.value.trim() || 'Dubai';
  const name = (document.getElementById('sell-name') as HTMLInputElement)?.value.trim();
  const first = _agentFirstName();

  const waMsg = [
    `Hi ${first}, I'd like to sell my ${type} in ${location}.`,
    `Timeline: ${timeline}`,
    name ? `My name is ${name}.` : '',
    `My number: ${phone}`,
    `Can you arrange a free valuation?`
  ].filter(Boolean).join('\n');

  const waNum = currentAgent?.whatsapp?.replace(/[^0-9]/g, '');
  if (waNum) window.open(`https://wa.me/${waNum}?text=${encodeURIComponent(waMsg)}`, '_blank');

  void fetch(CAPTURE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_slug: currentAgent?.slug,
      name: name || null,
      phone,
      intent: 'seller',
      property_type: type,
      preferred_area: location,
      message: `Sell: ${type} in ${location}, timeline: ${timeline}`,
      source: 'sell_qualifier',
    })
  }).catch(() => {});

  const body = document.getElementById('sell-body');
  if (body) body.innerHTML = _buildSuccessPanel(first, 'sell');
  logEvent('lead_submit', { source: 'sell_qualifier' });
};

window.openBuyFlow = () => {
  const first = _agentFirstName();
  const subtitle = document.getElementById('buy-subtitle');
  if (subtitle) subtitle.textContent = `Tell ${first} what you're looking for`;
  const nameEl = document.getElementById('buy-agent-name');
  if (nameEl) nameEl.textContent = first;
  _openSheet('buy-sheet');
};

window.closeBuyFlow = () => _closeSheet('buy-sheet', 'buy-body');

window.submitBuyFlow = () => {
  const phone = (document.getElementById('buy-phone') as HTMLInputElement)?.value.trim();
  const errEl = document.getElementById('buy-error');
  if (!phone) {
    if (errEl) { errEl.textContent = 'Please enter your WhatsApp number.'; errEl.classList.add('show'); }
    return;
  }
  if (errEl) errEl.classList.remove('show');

  const mode = _chipState['buy-mode'] ?? 'Buy';
  const beds = _chipState['buy-beds'] ?? '';
  const budget = (document.getElementById('buy-budget') as HTMLSelectElement)?.value || '';
  const area = (document.getElementById('buy-area') as HTMLInputElement)?.value.trim() || 'Dubai';
  const name = (document.getElementById('buy-name') as HTMLInputElement)?.value.trim();
  const first = _agentFirstName();

  const waMsg = [
    `Hi ${first}, I'm looking to ${mode.toLowerCase()} a ${beds} in ${area}.`,
    budget ? `Budget: ${budget}` : '',
    name ? `My name is ${name}.` : '',
    `My number: ${phone}`,
    `Can you help me find the right property?`
  ].filter(Boolean).join('\n');

  const waNum = currentAgent?.whatsapp?.replace(/[^0-9]/g, '');
  if (waNum) window.open(`https://wa.me/${waNum}?text=${encodeURIComponent(waMsg)}`, '_blank');

  void fetch(CAPTURE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_slug: currentAgent?.slug,
      name: name || null,
      phone,
      intent: 'buyer',
      property_type: beds,
      budget_range: budget || null,
      preferred_area: area,
      message: `${mode}: ${beds} in ${area}${budget ? `, budget: ${budget}` : ''}`,
      source: 'buy_qualifier',
    })
  }).catch(() => {});

  const body = document.getElementById('buy-body');
  if (body) body.innerHTML = _buildSuccessPanel(first, 'buy');
  logEvent('lead_submit', { source: 'buy_qualifier' });
};

// Open lead modal pre-filled with property name
window.openLeadForProperty = (propertyTitle) => {
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
