// ==========================================
// UTILITIES
// ==========================================
export function escHtml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

export function escAttr(str: string | null | undefined): string {
  return escHtml(str);
}

// Validate URLs — block javascript: and data: protocols
export function safeUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return '';
  // Allow http, https, mailto, tel, and protocol-relative
  if (/^(https?:\/\/|mailto:|tel:|\/)/.test(trimmed)) return trimmed;
  // Bare domain or path — prefix with https
  return `https://${trimmed}`;
}

// Validate tracking IDs — alphanumeric, hyphens, underscores only
export function safeTrackingId(id: string | null | undefined): string {
  if (!id) return '';
  return /^[A-Za-z0-9\-_]+$/.test(id) ? id : '';
}

// Image error fallback — replaces broken images with a styled placeholder
export function handleImgError(img: HTMLImageElement): void {
  const parent = img.parentElement;
  const fallback = document.createElement('div');
  fallback.className = 'img-error';
  fallback.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="rgba(255,255,255,0.08)"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>';
  if (parent) {
    parent.replaceChild(fallback, img);
  } else {
    img.replaceWith(fallback);
  }
}
// Expose globally for inline onerror handlers
window.handleImgError = handleImgError;

// ==========================================
// ROUTING
// ==========================================
export function getAgentSlug(): string | null {
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
// Domains that Netlify Image CDN can proxy server-side without being blocked.
// Google's aida-public CDN blocks server-side proxy requests — do not add googleusercontent.com.
export const SAFE_CDN_DOMAINS = ['supabase.co', 'netlify.app', 'sellingdubai.com'];

// Netlify Image CDN — WebP, max width, quality 80.
// Returns raw URL for unsupported domains so the browser fetches directly.
export function optimizeImg(url: string | null | undefined, w = 800): string {
  if (!url) return '';
  if (url.includes('images.unsplash.com')) return url;
  if (!SAFE_CDN_DOMAINS.some(d => url.includes(d))) return url;
  return `/.netlify/images?url=${encodeURIComponent(url)}&w=${w}&q=80&fm=webp`;
}
