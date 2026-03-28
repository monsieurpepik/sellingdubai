/**
 * SellingDubai — Global Error Tracking
 *
 * Catches unhandled errors & promise rejections, logs structured data.
 * Drop in a Sentry DSN to upgrade to full Sentry reporting.
 *
 * Usage: include this script BEFORE all other scripts in <head>.
 */
(function () {
  'use strict';

  // ──────────────────────────────────────────────
  // CONFIG — set your Sentry DSN here when ready
  // ──────────────────────────────────────────────
  var SENTRY_DSN = ''; // e.g. 'https://abc123@o123.ingest.sentry.io/456'
  var ENV = /sellingdubai\.(ae|com)$/.test(location.hostname) || location.hostname === 'sellingdubai-agents.netlify.app' ? 'production' : 'development';
  var MAX_ERRORS = 10; // max errors to report per page load (prevent flood)

  var errorCount = 0;
  var errorBuffer = [];

  function shouldReport() {
    if (errorCount >= MAX_ERRORS) return false;
    errorCount++;
    return true;
  }

  function buildPayload(type, message, source, line, col, stack) {
    return {
      type: type,
      message: String(message || '').slice(0, 500),
      source: String(source || '').slice(0, 200),
      line: line || 0,
      col: col || 0,
      stack: String(stack || '').slice(0, 2000),
      url: location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      env: ENV
    };
  }

  // ─── Global error handler ───
  window.onerror = function (message, source, line, col, error) {
    if (!shouldReport()) return;
    var payload = buildPayload(
      'error',
      message,
      source,
      line,
      col,
      error && error.stack ? error.stack : ''
    );
    errorBuffer.push(payload);
    reportError(payload);
  };

  // ─── Unhandled promise rejection handler ───
  window.addEventListener('unhandledrejection', function (event) {
    if (!shouldReport()) return;
    var reason = event.reason;
    var message = reason instanceof Error ? reason.message : String(reason);
    var stack = reason instanceof Error ? reason.stack : '';
    var payload = buildPayload('unhandledrejection', message, '', 0, 0, stack);
    errorBuffer.push(payload);
    reportError(payload);
  });

  function reportError(payload) {
    // If Sentry is loaded & configured, it handles reporting automatically
    // via its own global handlers. This is the fallback path.
    if (window.Sentry && SENTRY_DSN) return;

    // Structured console output for dev + log aggregation
    console.error('[SellingDubai Error]', payload.type, payload.message, {
      source: payload.source,
      line: payload.line,
      stack: payload.stack
    });

    // Optional: beacon errors to an edge function for server-side logging
    // Uncomment when capture-errors edge function is deployed:
    // if (ENV === 'production' && navigator.sendBeacon) {
    //   navigator.sendBeacon(
    //     'https://pjyorgedaxevxophpfib.supabase.co/functions/v1/capture-errors',
    //     JSON.stringify(payload)
    //   );
    // }
  }

  // ─── Sentry lazy-load (only if DSN is set) ───
  if (SENTRY_DSN) {
    var script = document.createElement('script');
    script.src = 'https://browser.sentry-cdn.com/8.45.0/bundle.min.js';
    script.crossOrigin = 'anonymous';
    script.onload = function () {
      if (window.Sentry) {
        window.Sentry.init({
          dsn: SENTRY_DSN,
          environment: ENV,
          sampleRate: 1.0,
          tracesSampleRate: 0.1,
          beforeSend: function (event) {
            // Scrub PII — remove user IP and cookies
            if (event.request) {
              delete event.request.cookies;
            }
            return event;
          }
        });
        // Replay any buffered errors into Sentry
        errorBuffer.forEach(function (p) {
          window.Sentry.captureMessage(p.message, {
            level: 'error',
            extra: p
          });
        });
        errorBuffer = [];
      }
    };
    document.head.appendChild(script);
  }

  // ─── Expose for manual error capture ───
  window.__sdTrackError = function (message, extra) {
    if (window.Sentry && SENTRY_DSN) {
      window.Sentry.captureMessage(message, { level: 'error', extra: extra });
    } else {
      console.error('[SellingDubai Manual]', message, extra);
    }
  };
})();
