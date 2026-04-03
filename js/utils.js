// ==========================================
// UTILITIES
// ==========================================
export function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

export function escAttr(str) {
  return escHtml(str);
}

// Validate URLs — block javascript: and data: protocols
export function safeUrl(url) {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return '';
  // Allow http, https, mailto, tel, and protocol-relative
  if (/^(https?:\/\/|mailto:|tel:|\/)/.test(trimmed)) return trimmed;
  // Bare domain or path — prefix with https
  return 'https://' + trimmed;
}

// Validate tracking IDs — alphanumeric, hyphens, underscores only
export function safeTrackingId(id) {
  if (!id) return '';
  return /^[A-Za-z0-9\-_]+$/.test(id) ? id : '';
}

// Image error fallback — replaces broken images with a styled placeholder
export function handleImgError(img) {
  const parent = img.parentElement;
  const fallback = document.createElement('div');
  fallback.className = 'img-error';
  fallback.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="rgba(255,255,255,0.08)"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>';
  img.replaceWith(fallback);
}
// Expose globally for inline onerror handlers
window.handleImgError = handleImgError;

// ==========================================
// ROUTING
// ==========================================
export function getAgentSlug() {
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
  const parts = path.split('/');
  if (parts[0] === 'a' && parts[1]) return parts[1];
  if (parts.length === 1 && parts[0]) return parts[0];
  const params = new URLSearchParams(window.location.search);
  return params.get('agent') || null;
}

// ==========================================
// IMAGE OPTIMIZATION
// ==========================================
// Netlify Image CDN — WebP, max width, quality 80
// Unsplash URLs are not allowlisted — served directly
export function optimizeImg(url, w = 800) {
  if (!url) return '';
  if (url.includes('images.unsplash.com')) return url;
  return `/.netlify/images?url=${encodeURIComponent(url)}&w=${w}&q=80&fm=webp`;
}
