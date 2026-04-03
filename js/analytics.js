// ==========================================
// ANALYTICS
// ==========================================
import { LOG_EVENT_URL } from './config.js';
import { currentAgent } from './state.js';

export function logEvent(eventType, metadata) {
  if (!currentAgent) return;
  const params = new URLSearchParams(window.location.search);
  let referrerSource = params.get('utm_source') || '';
  if (!referrerSource && document.referrer) {
    try {
      const ref = new URL(document.referrer);
      if (ref.hostname.includes('instagram')) referrerSource = 'instagram';
      else if (ref.hostname.includes('tiktok')) referrerSource = 'tiktok';
      else if (ref.hostname.includes('linkedin')) referrerSource = 'linkedin';
      else if (ref.hostname.includes('youtube')) referrerSource = 'youtube';
      else if (ref.hostname.includes('facebook') || ref.hostname.includes('fb.')) referrerSource = 'facebook';
      else if (ref.hostname.includes('t.co') || ref.hostname.includes('twitter') || ref.hostname.includes('x.com')) referrerSource = 'twitter';
      else referrerSource = ref.hostname;
    } catch(e) { referrerSource = 'direct'; }
  }
  if (!referrerSource) referrerSource = 'direct';

  const payload = {
    agent_id: currentAgent.id,
    event_type: eventType,
    metadata: { ...metadata, referrer_source: referrerSource, device: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop' },
    referrer: document.referrer || null,
  };
  fetch(LOG_EVENT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {});
}

export async function trackPageView(agentId) {
  logEvent('view', agentId ? { agent_id: agentId } : {});
}

// Click tracking via event delegation
document.addEventListener('click', function(e) {
  const btn = e.target.closest('[data-track]');
  if (!btn || !currentAgent) return;
  const trackType = btn.dataset.track;
  const trackUrl = btn.dataset.url || '';
  if (trackType === 'whatsapp') logEvent('whatsapp_tap', { url: trackUrl });
  else if (trackType === 'phone') logEvent('phone_tap', {});
  else logEvent('link_click', { link_type: trackType, url: trackUrl });
});
