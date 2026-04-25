// edge-functions/telegram-webhook/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";

// deno-lint-ignore no-explicit-any
type CreateClientFn = (url: string, key: string) => any;

// ── Telegram API helpers ────────────────────────────────────────────────────

async function sendTelegramMessage(
  chatId: number,
  text: string,
  // deno-lint-ignore no-explicit-any
  extra?: Record<string, any>,
): Promise<void> {
  const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!BOT_TOKEN) return;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", ...extra }),
    });
  } catch (_e) { /* fire and forget */ } finally {
    clearTimeout(timeoutId);
  }
}

async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!BOT_TOKEN) return;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
  } catch (_e) { /* ignore */ } finally {
    clearTimeout(timeoutId);
  }
}

// ── Auth Flow ───────────────────────────────────────────────────────────────

async function startAuthFlow(
  chatId: number,
  telegramUserId: number,
  // deno-lint-ignore no-explicit-any
  supabase: any,
): Promise<void> {
  await supabase.from("telegram_sessions").upsert(
    {
      telegram_user_id: telegramUserId,
      auth_token_used: false,
      last_active: new Date().toISOString(),
    },
    { onConflict: "telegram_user_id" },
  );

  await sendTelegramMessage(
    chatId,
    "👋 Welcome to SellingDubai Bot!\n\nType your registered email address to connect your account:",
  );
}

async function handlePendingAuth(
  chatId: number,
  telegramUserId: number,
  emailInput: string,
  // deno-lint-ignore no-explicit-any
  supabase: any,
): Promise<void> {
  const emailTrimmed = emailInput.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
    await sendTelegramMessage(chatId, "That doesn't look like a valid email. Please try again:");
    return;
  }

  const { data: agent } = await supabase
    .from("agents")
    .select("id, name")
    .eq("email", emailTrimmed)
    .maybeSingle();

  if (!agent) {
    await sendTelegramMessage(
      chatId,
      "No account found for that email. Make sure you're using the email you registered with at sellingdubai.com/join",
    );
    return;
  }

  const authToken = crypto.randomUUID();
  await supabase.from("telegram_sessions").upsert(
    {
      telegram_user_id: telegramUserId,
      auth_token: authToken,
      auth_token_used: false,
      last_active: new Date().toISOString(),
    },
    { onConflict: "telegram_user_id" },
  );

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) {
    await sendTelegramMessage(chatId, "Configuration error. Please contact support.");
    return;
  }

  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-magic-link`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: emailTrimmed,
        redirect_path: `/verify-telegram?token=${authToken}`,
      }),
    });
  } catch (_e) { /* ignore send errors */ }

  await sendTelegramMessage(
    chatId,
    `✉️ Check your email (${emailTrimmed}) — we've sent a link to connect your Telegram account. Click it to complete setup.`,
  );
}

// ── Voice Transcription ─────────────────────────────────────────────────────

async function transcribeTelegramVoice(fileId: string): Promise<string | null> {
  const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!BOT_TOKEN || !OPENAI_KEY) return null;

  try {
    const fileRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`,
    );
    if (!fileRes.ok) return null;
    const fileData = await fileRes.json();
    const filePath = fileData.result?.file_path;
    if (!filePath) return null;

    const audioRes = await fetch(
      `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`,
    );
    if (!audioRes.ok) return null;
    const audioBytes = new Uint8Array(await audioRes.arrayBuffer());
    const ext = filePath.split(".").pop() || "ogg";

    const form = new FormData();
    form.append("file", new Blob([audioBytes], { type: `audio/${ext}` }), `audio.${ext}`);
    form.append("model", "whisper-1");

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}` },
      body: form,
    });
    if (!whisperRes.ok) return null;
    const data = await whisperRes.json();
    return (data.text as string)?.trim() || null;
  } catch (_e) {
    return null;
  }
}

// ── Route to ai-secretary ──────────────────────────────────────────────────

async function callSecretary(
  agentId: string,
  message: string,
): Promise<string> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) return "Configuration error. Please try again later.";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-secretary`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({ agent_id: agentId, message, channel: "telegram" }),
    });

    if (!res.ok) return "Couldn't process that right now. Please try again.";
    const data = await res.json();
    return data.reply || "Done.";
  } catch (_e) {
    return "Couldn't process that right now. Please try again.";
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────

export async function handler(
  req: Request,
  _createClient: CreateClientFn = createClient,
): Promise<Response> {
  const log = createLogger("telegram-webhook", req);
  const start = Date.now();

  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  const expectedSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (expectedSecret != null && expectedSecret !== "") {
    const receivedSecret = req.headers.get("x-telegram-bot-api-secret-token");
    if (receivedSecret !== expectedSecret) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  try {
    // deno-lint-ignore no-explicit-any
    const update: any = await req.json();

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY) {
      log({ event: "config_error", status: 500 });
      return new Response("OK", { status: 200 });
    }

    const supabase = _createClient(SUPABASE_URL, SERVICE_KEY);

    // ── Callback query (inline button press) ──────────────────────────────
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId: number = cq.message?.chat?.id;
      const telegramUserId: number = cq.from?.id;
      const data: string = cq.data || "";

      if (!chatId || !telegramUserId) return new Response("OK", { status: 200 });

      await answerCallbackQuery(cq.id);

      const { data: session } = await supabase
        .from("telegram_sessions")
        .select("agent_id")
        .eq("telegram_user_id", telegramUserId)
        .not("agent_id", "is", null)
        .maybeSingle();

      if (!session?.agent_id) {
        await sendTelegramMessage(chatId, "Please authenticate first. Type /start");
        return new Response("OK", { status: 200 });
      }

      if (data.startsWith("lead_contacted_") || data.startsWith("lead_archived_")) {
        const isContacted = data.startsWith("lead_contacted_");
        const leadId = isContacted
          ? data.slice("lead_contacted_".length)
          : data.slice("lead_archived_".length);
        const newStatus = isContacted ? "contacted" : "archived";

        const { error } = await supabase
          .from("leads")
          .update({ status: newStatus })
          .eq("id", leadId)
          .eq("agent_id", session.agent_id);

        const replyText = error ? "Couldn't update lead." : isContacted ? "✓ Lead marked as contacted." : "✗ Lead archived.";
        await sendTelegramMessage(chatId, replyText);
      }

      log({ event: "callback_query", agent_id: session.agent_id, status: 200 });
      return new Response("OK", { status: 200 });
    }

    // ── Regular message ───────────────────────────────────────────────────
    const message = update.message;
    if (!message) {
      return new Response("OK", { status: 200 });
    }

    const chatId: number = message.chat?.id;
    const telegramUserId: number = message.from?.id;
    const messageText: string = message.text || "";

    if (!chatId || !telegramUserId) return new Response("OK", { status: 200 });

    if (messageText === "/start") {
      await startAuthFlow(chatId, telegramUserId, supabase);
      log({ event: "start_command", status: 200 });
      return new Response("OK", { status: 200 });
    }

    const { data: session } = await supabase
      .from("telegram_sessions")
      .select("agent_id, auth_token_used")
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();

    const isAuthenticated = session?.agent_id != null;

    if (!isAuthenticated) {
      if (session) {
        if (messageText.trim()) {
          await handlePendingAuth(chatId, telegramUserId, messageText, supabase);
        }
      } else {
        await sendTelegramMessage(
          chatId,
          "Type /start to connect your SellingDubai account.",
        );
      }
      return new Response("OK", { status: 200 });
    }

    await supabase
      .from("telegram_sessions")
      .update({ last_active: new Date().toISOString() })
      .eq("telegram_user_id", telegramUserId);

    if (message.voice) {
      await sendTelegramMessage(chatId, "🎙️ Processing your voice note...");
      const transcript = await transcribeTelegramVoice(message.voice.file_id);
      if (!transcript?.trim()) {
        await sendTelegramMessage(chatId, "Couldn't transcribe. Please type your message.");
        return new Response("OK", { status: 200 });
      }
      const reply = await callSecretary(session.agent_id, transcript);
      await sendTelegramMessage(chatId, reply);
      log({ event: "voice_processed", agent_id: session.agent_id, status: 200 });
      return new Response("OK", { status: 200 });
    }

    if (messageText.trim()) {
      const reply = await callSecretary(session.agent_id, messageText);
      await sendTelegramMessage(chatId, reply);
      log({ event: "text_processed", agent_id: session.agent_id, status: 200 });
    }

    return new Response("OK", { status: 200 });
  } catch (e) {
    log({ event: "error", status: 500, error: String(e) });
    return new Response("OK", { status: 200 }); // Always 200 to Telegram — never retry
  } finally {
    log.flush(Date.now() - start);
  }
}

Deno.serve((req) => handler(req));
