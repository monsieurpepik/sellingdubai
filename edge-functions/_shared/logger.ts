// _shared/logger.ts — Structured request logging for SellingDubai edge functions
//
// Usage:
//   import { createLogger, Logger } from '../_shared/logger.ts';
//
//   Deno.serve(async (req: Request) => {
//     const log = createLogger('function-name', req);
//     const _start = Date.now();
//
//     try {
//       // ... handler logic ...
//       log({ event: 'success', status: 200, agent_id: agentId });
//       return new Response(...);
//     } catch (err) {
//       log({ event: 'error', status: 500, error: String(err) });
//       return new Response(..., { status: 500 });
//     } finally {
//       log.flush(Date.now() - _start);
//     }
//   });

import { captureException } from './sentry.ts';

export interface LogPayload {
  event: string;
  agent_id?: string;
  status?: number;
  error?: string;
  [key: string]: unknown;
}

export interface LogEntry extends LogPayload {
  function: string;
  request_id: string;
  duration_ms?: number;
  timestamp: string;
}

/** Typed Logger interface — avoids assigning properties to a bare function. */
export interface Logger {
  (payload: LogPayload): void;
  flush: (durationMs: number) => void;
  requestId: string;
}

export function createLogger(functionName: string, req: Request): Logger {
  // Honour X-Request-Id if caller provides one (useful for tracing)
  const incomingId = req.headers.get('x-request-id');
  const request_id = incomingId ?? crypto.randomUUID();

  const entries: LogEntry[] = [];

  const logger: Logger = Object.assign(
    function log(payload: LogPayload): void {
      const entry: LogEntry = {
        ...payload,
        function: functionName,
        request_id,
        timestamp: new Date().toISOString(),
      };
      entries.push(entry);
      console.log(JSON.stringify(entry));

      // Auto-report errors to Sentry (fire-and-forget)
      if (payload.event === 'error' && payload.error) {
        captureException(new Error(payload.error), { function: functionName, request_id });
      }
    },
    {
      flush(durationMs: number): void {
        if (entries.length > 0) {
          const last = entries[entries.length - 1];
          // Only emit the final summary line if it doesn't duplicate the last log
          if (last.duration_ms === undefined) {
            console.log(JSON.stringify({
              ...last,
              duration_ms: durationMs,
            }));
          }
        }
      },
      requestId: request_id,
    }
  );

  return logger;
}
