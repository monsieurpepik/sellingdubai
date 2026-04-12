// edge-functions/telegram-webhook/index.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handler } from "./index.ts";
import { createMockSupabase } from "../_shared/test-mock.ts";

Deno.test("telegram-webhook: non-POST → 200 OK", async () => {
  const req = new Request("http://localhost/telegram-webhook", { method: "GET" });
  const res = await handler(req);
  assertEquals(res.status, 200);
});

Deno.test("telegram-webhook: wrong secret → 403", async () => {
  const origSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  Deno.env.set("TELEGRAM_WEBHOOK_SECRET", "correct-secret");

  try {
    const req = new Request("http://localhost/telegram-webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "wrong-secret",
      },
      body: JSON.stringify({ message: { text: "hi", chat: { id: 1 }, from: { id: 42 } } }),
    });
    const res = await handler(req);
    assertEquals(res.status, 403);
  } finally {
    if (origSecret === undefined) Deno.env.delete("TELEGRAM_WEBHOOK_SECRET");
    else Deno.env.set("TELEGRAM_WEBHOOK_SECRET", origSecret);
  }
});

Deno.test("telegram-webhook: /start command → sends auth prompt", async () => {
  const origSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  const origToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const origUrl = Deno.env.get("SUPABASE_URL");
  const origKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  Deno.env.delete("TELEGRAM_WEBHOOK_SECRET");
  Deno.env.set("TELEGRAM_BOT_TOKEN", "test-token");
  Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-key");

  const sentMessages: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => {
    if (init?.body) sentMessages.push(JSON.parse(init.body as string));
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  }) as typeof fetch;

  const mock = createMockSupabase({
    telegram_sessions: { data: null, error: null },
  });

  const req = new Request("http://localhost/telegram-webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: { text: "/start", chat: { id: 12345 }, from: { id: 99999 } },
    }),
  });

  try {
    const res = await handler(req, () => mock);
    assertEquals(res.status, 200);
    assertEquals(sentMessages.length >= 1, true);
    const welcomeMsg = sentMessages[0] as { chat_id: number; text: string };
    assertEquals(welcomeMsg.chat_id, 12345);
    assertEquals(welcomeMsg.text.includes("Welcome") || welcomeMsg.text.includes("/start"), true);
  } finally {
    globalThis.fetch = originalFetch;
    if (origSecret === undefined) Deno.env.delete("TELEGRAM_WEBHOOK_SECRET");
    else Deno.env.set("TELEGRAM_WEBHOOK_SECRET", origSecret);
    if (origToken === undefined) Deno.env.delete("TELEGRAM_BOT_TOKEN");
    else Deno.env.set("TELEGRAM_BOT_TOKEN", origToken);
    if (origUrl === undefined) Deno.env.delete("SUPABASE_URL");
    else Deno.env.set("SUPABASE_URL", origUrl);
    if (origKey === undefined) Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
    else Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", origKey);
  }
});

Deno.test("telegram-webhook: unauthenticated non-start message → prompts auth", async () => {
  const origSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  const origToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const origUrl = Deno.env.get("SUPABASE_URL");
  const origKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  Deno.env.delete("TELEGRAM_WEBHOOK_SECRET");
  Deno.env.set("TELEGRAM_BOT_TOKEN", "test-token");
  Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-key");

  const sentMessages: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => {
    if (init?.body) sentMessages.push(JSON.parse(init.body as string));
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  }) as typeof fetch;

  // No session found for this user
  const mock = createMockSupabase({
    telegram_sessions: { data: null, error: null },
  });

  const req = new Request("http://localhost/telegram-webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: { text: "check my leads", chat: { id: 12345 }, from: { id: 99999 } },
    }),
  });

  try {
    const res = await handler(req, () => mock);
    assertEquals(res.status, 200);
    assertEquals(sentMessages.length >= 1, true);
    const promptMsg = sentMessages[0] as { chat_id: number; text: string };
    assertEquals(promptMsg.chat_id, 12345);
    assertEquals(promptMsg.text.includes("/start"), true);
  } finally {
    globalThis.fetch = originalFetch;
    if (origSecret === undefined) Deno.env.delete("TELEGRAM_WEBHOOK_SECRET");
    else Deno.env.set("TELEGRAM_WEBHOOK_SECRET", origSecret);
    if (origToken === undefined) Deno.env.delete("TELEGRAM_BOT_TOKEN");
    else Deno.env.set("TELEGRAM_BOT_TOKEN", origToken);
    if (origUrl === undefined) Deno.env.delete("SUPABASE_URL");
    else Deno.env.set("SUPABASE_URL", origUrl);
    if (origKey === undefined) Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
    else Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", origKey);
  }
});

Deno.test("telegram-webhook: OPTIONS → 200", async () => {
  const req = new Request("http://localhost/telegram-webhook", { method: "OPTIONS" });
  const res = await handler(req);
  assertEquals(res.status, 200);
});
