/**
 * Lightweight Sentry error reporter for edge functions.
 * Uses Sentry's envelope API directly — no SDK dependency.
 *
 * Env var: SENTRY_DSN (same DSN as the browser SDK).
 * If not set, errors are silently skipped (no-op in dev).
 *
 * Usage:
 *   import { captureException } from "../_shared/sentry.ts";
 *   try { ... } catch (e) { captureException(e, { function: "my-fn", agent_id: "x" }); }
 */

let _parsedDsn: { host: string; projectId: string; publicKey: string } | null | undefined;

function parseDsn(): typeof _parsedDsn {
  if (_parsedDsn !== undefined) return _parsedDsn;
  const raw = Deno.env.get("SENTRY_DSN");
  if (!raw) { _parsedDsn = null; return null; }
  try {
    const url = new URL(raw);
    const publicKey = url.username;
    const projectId = url.pathname.replace("/", "");
    const host = url.host;
    _parsedDsn = { host, projectId, publicKey };
    return _parsedDsn;
  } catch {
    _parsedDsn = null;
    return null;
  }
}

export function captureException(
  error: unknown,
  tags: Record<string, string> = {},
): void {
  const dsn = parseDsn();
  if (!dsn) return;

  const err = error instanceof Error ? error : new Error(String(error));
  const frames = (err.stack ?? "")
    .split("\n")
    .slice(1, 10)
    .map((line) => {
      const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
      if (match) {
        return { function: match[1], filename: match[2], lineno: Number(match[3]), colno: Number(match[4]) };
      }
      const simpleMatch = line.match(/at\s+(.+?):(\d+):(\d+)/);
      if (simpleMatch) {
        return { filename: simpleMatch[1], lineno: Number(simpleMatch[2]), colno: Number(simpleMatch[3]) };
      }
      return { filename: line.trim() };
    });

  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    platform: "javascript",
    level: "error",
    server_name: "supabase-edge",
    environment: Deno.env.get("SENTRY_ENVIRONMENT") ?? "production",
    tags: { runtime: "deno-edge", ...tags },
    exception: {
      values: [{
        type: err.name,
        value: err.message,
        stacktrace: { frames: frames.reverse() },
      }],
    },
  };

  const envelope = [
    JSON.stringify({ event_id: event.event_id, dsn: `https://${dsn.publicKey}@${dsn.host}/${dsn.projectId}` }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");

  // Fire-and-forget — don't block the response
  fetch(`https://${dsn.host}/api/${dsn.projectId}/envelope/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-sentry-envelope" },
    body: envelope,
  }).catch(() => { /* silently fail — logging infra should not break the app */ });
}
