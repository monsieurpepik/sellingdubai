// js/errors.ts — Centralised error reporting for SellingDubai client JS
//
// Usage (esbuild-processed modules only — imported through init.ts):
//   import { reportError } from './errors';
//   reportError('dashboard/verifyToken', error);
//
// Usage (Category B plain IIFE scripts — dashboard.js, edit.js, join.js):
//   window.reportError('dashboard/functionName', error);
//   // Guard for the rare case init bundle hasn't executed yet:
//   if (typeof window.reportError === 'function') window.reportError(ctx, err);
//   else console.error(ctx, err);

/**
 * Log an error to console and capture it in Sentry (if loaded).
 *
 * @param context  Human-readable location string, e.g. "dashboard/sendMagicLink"
 * @param error    The caught value — may be Error, string, or unknown
 * @param extras   Optional key-value pairs added to the Sentry scope
 */
export function reportError(
  context: string,
  error: unknown,
  extras?: Record<string, unknown>
): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${context}]`, message, error);

  if (typeof window !== 'undefined' && window.Sentry) {
    window.Sentry.withScope((scope: { setTag: (k: string, v: string) => void; setExtras: (e: Record<string, unknown>) => void }) => {
      scope.setTag('context', context);
      if (extras) scope.setExtras(extras);
      window.Sentry.captureException(
        error instanceof Error ? error : new Error(message)
      );
    });
  }
}

// Expose as a window global so Category B plain IIFE scripts (dashboard.js,
// edit.js, join.js) can call window.reportError() without an ES import.
// This file is bundled through init.ts by esbuild, so this assignment runs
// before any deferred plain script executes.
(window as any).reportError = reportError;
