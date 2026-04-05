import { createLogger } from '../_shared/logger.ts';

Deno.serve(async (req: Request) => {
  const log = createLogger('debug-resend', req);
  const _start = Date.now();
  try {
    log({ event: 'not_found', status: 404 });
    return new Response(JSON.stringify({error:"Not found"}), {status:404, headers:{"Content-Type":"application/json"}});
  } finally {
    log.flush(Date.now() - _start);
  }
});
