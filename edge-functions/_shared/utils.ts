/**
 * Shared utilities for SellingDubai edge functions.
 * Import via: import { escHtml, getCorsHeaders } from "../_shared/utils.ts";
 */

export const CORS_ORIGINS = [
  "https://sellingdubai.com",
  "https://www.sellingdubai.com",
  "https://agents.sellingdubai.com",
  "https://sellingdubai.com",
  "https://www.sellingdubai.com",
  "https://staging.sellingdubai.com",
];

// In local development (supabase functions serve), the frontend runs on localhost.
// We detect this by checking if SUPABASE_URL points to the local emulator.
const IS_LOCAL_DEV = (Deno.env.get("SUPABASE_URL") ?? "").startsWith("http://127.0.0.1");

export function getCorsHeaders(origin: string | null): Record<string, string> {
  const isLocalOrigin = IS_LOCAL_DEV &&
    origin != null &&
    (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:"));

  const allowed = isLocalOrigin
    ? origin
    : (origin && CORS_ORIGINS.includes(origin) ? origin : CORS_ORIGINS[0]);

  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function sanitize(s: string | undefined | null, maxLen = 200): string {
  if (!s) return "";
  return String(s).trim().slice(0, maxLen);
}

/**
 * SSRF protection: returns true if the URL hostname resolves to a private/internal address.
 * Mirrors the check in update-agent. Use this in any edge function that fires outbound HTTP.
 */
export function isBlockedSsrfUrl(urlString: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return true; // invalid URL — block it
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return true;
  const h = parsed.hostname.toLowerCase();
  const BLOCKED = [
    /^localhost$/,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,          // link-local — covers AWS/GCP metadata (169.254.169.254)
    /^0\.0\.0\.0$/,
    /^\[::1?\]$/,           // IPv6 loopback
    /^metadata\.google\.internal$/,
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,  // CGN range 100.64–100.127
  ];
  return BLOCKED.some(p => p.test(h));
}

/**
 * Image MIME validation via magic bytes.
 * Returns true if the base64 string starts with a known image signature.
 * Accepts JPEG, PNG, GIF, WebP. Rejects SVG, PDF, and everything else.
 */
export function isValidImageBytes(base64: string): boolean {
  try {
    const raw = base64.replace(/^data:[^;]+;base64,/, "");
    const bytes = Array.from(atob(raw.slice(0, 16))).map(c => c.charCodeAt(0));
    return (
      (bytes[0] === 0xFF && bytes[1] === 0xD8) ||                    // JPEG
      (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) || // PNG
      (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) || // GIF
      (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46)    // WebP (RIFF)
    );
  } catch {
    return false;
  }
}
