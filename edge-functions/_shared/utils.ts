/**
 * Shared utilities for SellingDubai edge functions.
 * Import via: import { escHtml, getCorsHeaders } from "../_shared/utils.ts";
 */

export const CORS_ORIGINS = [
  "https://sellingdubai.ae",
  "https://www.sellingdubai.ae",
  "https://agents.sellingdubai.ae",
  "https://sellingdubai.com",
  "https://www.sellingdubai.com",
  "https://sellingdubai-agents.netlify.app",
];

export function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && CORS_ORIGINS.includes(origin) ? origin : CORS_ORIGINS[0];
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
