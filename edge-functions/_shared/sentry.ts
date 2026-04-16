/**
 * Lightweight Sentry reporter for edge functions.
 * Uses Sentry's store API directly — no SDK dependency.
 *
 * Env var: SENTRY_DSN (same DSN as the browser SDK).
 * If not set, becomes a no-op (safe in local dev).
 *
 * Usage:
 *   import { reportToSentry } from "../_shared/sentry.ts";
 *   await reportToSentry("stripe-webhook: 0 rows matched", "fatal", { agentId });
 */

export async function reportToSentry(
  message: string,
  level: "fatal" | "error" | "warning" | "info" = "error",
  extra: Record<string, unknown> = {},
): Promise<void> {
  const dsn = Deno.env.get("SENTRY_DSN");
  if (!dsn) return;
  try {
    const parsed = new URL(dsn);
    const key = parsed.username;
    const projectId = parsed.pathname.replace(/^\//, "");
    const storeUrl = `${parsed.protocol}//${parsed.host}/api/${projectId}/store/`;
    const isLocal = (Deno.env.get("SUPABASE_URL") ?? "").startsWith("http://127.0.0.1");
    await fetch(storeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=edge-fn/1.0, sentry_key=${key}`,
      },
      body: JSON.stringify({
        event_id: crypto.randomUUID().replace(/-/g, ""),
        timestamp: new Date().toISOString(),
        level,
        platform: "other",
        environment: isLocal ? "development" : "production",
        message,
        extra,
      }),
    });
  } catch {
    // Never let Sentry reporting break the caller
  }
}
