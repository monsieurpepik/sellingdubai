// edge-functions/verify-telegram-init/index.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handler } from "./index.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(opts: {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
} = {}): Request {
  const method = opts.method ?? "POST";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Origin": "https://sellingdubai.ae",
    ...(opts.headers ?? {}),
  };
  return new Request("http://localhost/verify-telegram-init", {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

/**
 * Build a mock _createClient factory that returns a fake Supabase client.
 *
 * `queryMap` maps table names to the data/error each query resolves with.
 * If a table is not in queryMap the default is { data: null, error: null }.
 */
function makeMockClient(
  queryMap: Record<string, { data: unknown; error: unknown }> = {},
) {
  // deno-lint-ignore no-explicit-any
  return (_url: string, _key: string): any => ({
    from: (table: string) => {
      const result = queryMap[table] ?? { data: null, error: null };
      return {
        select: (_cols: string) => ({
          eq: (_col: string, _val: unknown) => ({
            maybeSingle: () => Promise.resolve(result),
            not: (_c: string, _op: string, _v: unknown) => ({
              maybeSingle: () => Promise.resolve(result),
            }),
          }),
          not: (_c: string, _op: string, _v: unknown) => ({
            maybeSingle: () => Promise.resolve(result),
          }),
        }),
        update: (_vals: unknown) => ({
          eq: (_col: string, _val: unknown) => Promise.resolve({ error: null }),
        }),
      };
    },
  });
}

// ── Environment setup helpers ─────────────────────────────────────────────────

function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> {
  const originals: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    originals[key] = Deno.env.get(key);
    if (value === undefined) {
      Deno.env.delete(key);
    } else {
      Deno.env.set(key, value);
    }
  }
  return fn().finally(() => {
    for (const [key, orig] of Object.entries(originals)) {
      if (orig === undefined) Deno.env.delete(key);
      else Deno.env.set(key, orig);
    }
  });
}

// Set baseline env vars used by most tests
Deno.env.set("SUPABASE_URL", "http://localhost");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
Deno.env.set("TELEGRAM_BOT_TOKEN", "test-bot-token");

// ── 1. OPTIONS preflight ──────────────────────────────────────────────────────

Deno.test("verify-telegram-init: OPTIONS preflight returns 200", async () => {
  const req = makeRequest({ method: "OPTIONS", body: undefined });
  const res = await handler(req, makeMockClient());
  assertEquals(res.status, 200);
});

// ── 2. Non-POST method ────────────────────────────────────────────────────────

Deno.test("verify-telegram-init: GET returns 405", async () => {
  const req = new Request("http://localhost/verify-telegram-init", {
    method: "GET",
  });
  const res = await handler(req, makeMockClient());
  assertEquals(res.status, 405);
  const data = await res.json();
  assertEquals(data.error, "Method not allowed");
});

// ── 3. Missing `mode` field ───────────────────────────────────────────────────

Deno.test("verify-telegram-init: missing mode returns 400", async () => {
  const req = makeRequest({ body: { init_data: "some-data" } });
  const res = await handler(req, makeMockClient());
  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.error, "mode must be 'mini_app' or 'bot_auth'");
});

// ── 4. mini_app mode: HMAC mismatch ──────────────────────────────────────────

Deno.test("verify-telegram-init: mini_app with invalid HMAC returns 401", async () => {
  const req = makeRequest({
    body: {
      mode: "mini_app",
      init_data: "auth_date=1234567890&hash=badhash000000000000000000000000000000000000000000000000000000000&user=%7B%22id%22%3A42%7D",
    },
  });
  const res = await handler(req, makeMockClient());
  assertEquals(res.status, 401);
  const data = await res.json();
  assertEquals(data.error, "Invalid initData");
});

// ── 5. mini_app mode: valid HMAC but account not linked ───────────────────────
//
// We need a real valid HMAC to pass the validation step then hit the DB path.
// We generate a valid initData using the same algorithm as the implementation.

async function buildValidInitData(
  botToken: string,
  params: Record<string, string>,
): Promise<string> {
  const pairs = Object.entries(params)
    .filter(([k]) => k !== "hash")
    .map(([k, v]) => `${k}=${v}`)
    .sort();
  const dataCheckString = pairs.join("\n");

  const botTokenBytes = new TextEncoder().encode(botToken);
  const webAppDataBytes = new TextEncoder().encode("WebAppData");

  const secretKey = await crypto.subtle.importKey(
    "raw",
    webAppDataBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const secretKeyBytes = await crypto.subtle.sign("HMAC", secretKey, botTokenBytes);

  const hmacKey = await crypto.subtle.importKey(
    "raw",
    secretKeyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const dataBytes = new TextEncoder().encode(dataCheckString);
  const sigBytes = await crypto.subtle.sign("HMAC", hmacKey, dataBytes);
  const hash = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Use URLSearchParams to construct the final string so that special
  // characters in values (e.g. JSON braces/quotes in the "user" field)
  // are percent-encoded.  This mirrors how real Telegram initData is encoded.
  const sp = new URLSearchParams({ ...params, hash });
  return sp.toString();
}

Deno.test("verify-telegram-init: mini_app valid HMAC but no linked account returns 401", async () => {
  const BOT_TOKEN = "test-bot-token";
  // The implementation uses URLSearchParams to parse initData, which decodes
  // percent-encoded values. The HMAC data_check_string is built from decoded
  // values. So we must compute HMAC over the decoded user JSON string, then
  // percent-encode just the user value in the final query string so
  // URLSearchParams reconstructs the original decoded value.
  const userDecoded = JSON.stringify({ id: 42 });
  const initData = await buildValidInitData(BOT_TOKEN, {
    auth_date: "1234567890",
    user: userDecoded,
  });

  const req = makeRequest({
    body: { mode: "mini_app", init_data: initData },
  });

  // DB returns no session for telegram_sessions
  const res = await handler(req, makeMockClient({
    telegram_sessions: { data: null, error: null },
  }));

  assertEquals(res.status, 401);
  const data = await res.json();
  assertEquals(data.error, "Telegram account not linked. Open the bot and type /start first.");
});

// ── 6. bot_auth mode: missing token field ─────────────────────────────────────

Deno.test("verify-telegram-init: bot_auth with missing bot_auth_token returns 400", async () => {
  const req = makeRequest({ body: { mode: "bot_auth" } });
  const res = await handler(req, makeMockClient());
  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.error, "bot_auth_token required");
});

// ── 7. bot_auth mode: auth_token_used === true (replay) ──────────────────────

Deno.test("verify-telegram-init: bot_auth with already-used token returns 401 (bot_auth_token_replay)", async () => {
  const req = makeRequest({
    body: { mode: "bot_auth", bot_auth_token: "used-token-abc" },
  });

  // Session exists but auth_token_used is true
  const res = await handler(req, makeMockClient({
    telegram_sessions: {
      data: { id: "sess-1", telegram_user_id: 42, auth_token_used: true },
      error: null,
    },
  }));

  assertEquals(res.status, 401);
  const data = await res.json();
  assertEquals(data.error, "Token already used");
});

// ── 8. bot_auth mode: magic_links.used_at set ────────────────────────────────

Deno.test("verify-telegram-init: bot_auth with used magic link returns 401", async () => {
  // Session is valid (not used) but magic link has used_at set
  // We need the mock to return different data for different tables.
  // deno-lint-ignore no-explicit-any
  const mockClient = (_url: string, _key: string): any => ({
    from: (table: string) => {
      if (table === "telegram_sessions") {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: unknown) => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: "sess-1", telegram_user_id: 42, auth_token_used: false },
                  error: null,
                }),
            }),
          }),
          update: (_vals: unknown) => ({
            eq: (_col: string, _val: unknown) => Promise.resolve({ error: null }),
          }),
        };
      }
      if (table === "magic_links") {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: unknown) => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    agent_id: "agent-1",
                    used_at: new Date().toISOString(),
                    revoked_at: null,
                  },
                  error: null,
                }),
            }),
          }),
        };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
      };
    },
  });

  const req = makeRequest({
    body: { mode: "bot_auth", bot_auth_token: "valid-token-xyz" },
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://sellingdubai.ae",
      "Authorization": "Bearer some-bearer-token",
    },
  });

  const res = await handler(req, mockClient);
  assertEquals(res.status, 401);
  const data = await res.json();
  assertEquals(data.error, "Invalid session");
});

// ── 9. Missing env vars returns 500 ──────────────────────────────────────────

Deno.test("verify-telegram-init: missing SUPABASE_URL returns 500", async () => {
  await withEnv({ SUPABASE_URL: undefined }, async () => {
    const req = makeRequest({ body: { mode: "mini_app", init_data: "x" } });
    const res = await handler(req, makeMockClient());
    assertEquals(res.status, 500);
    const data = await res.json();
    assertEquals(data.error, "Server configuration error");
  });
});

Deno.test("verify-telegram-init: missing SUPABASE_SERVICE_ROLE_KEY returns 500", async () => {
  await withEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined }, async () => {
    const req = makeRequest({ body: { mode: "mini_app", init_data: "x" } });
    const res = await handler(req, makeMockClient());
    assertEquals(res.status, 500);
    const data = await res.json();
    assertEquals(data.error, "Server configuration error");
  });
});

Deno.test("verify-telegram-init: missing both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY returns 500", async () => {
  await withEnv(
    { SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined },
    async () => {
      const req = makeRequest({ body: { mode: "bot_auth", bot_auth_token: "tok" } });
      const res = await handler(req, makeMockClient());
      assertEquals(res.status, 500);
      const data = await res.json();
      assertEquals(data.error, "Server configuration error");
    },
  );
});
