import { fnUrl } from "../_shared/test-helpers.ts";

const URL = fnUrl("whatsapp-ingest");

async function signMetaPayload(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

// Requires WH_VERIFY_TOKEN=test-token in supabase/.env
Deno.test("whatsapp-ingest: GET with valid verify token returns challenge", async () => {
  const res = await fetch(
    `${URL}?hub.mode=subscribe&hub.verify_token=test-token&hub.challenge=challenge123`,
  );
  if (res.status !== 200) {
    const text = await res.text();
    throw new Error(`Expected 200, got ${res.status}: ${text}`);
  }
  const body = await res.text();
  if (body !== "challenge123") {
    throw new Error(`Expected challenge "challenge123", got: ${body}`);
  }
});

Deno.test("whatsapp-ingest: GET with wrong verify token returns 403", async () => {
  const res = await fetch(
    `${URL}?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=challenge123`,
  );
  await res.body?.cancel();
  if (res.status !== 403) {
    throw new Error(`Expected 403, got ${res.status}`);
  }
});

Deno.test("whatsapp-ingest: POST with invalid signature returns 403", async () => {
  const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [] } }] }] });
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": "sha256=badhash",
    },
    body,
  });
  await res.body?.cancel();
  if (res.status !== 403) {
    throw new Error(`Expected 403, got ${res.status}`);
  }
});

// Requires WH_APP_SECRET=test-secret in supabase/.env
Deno.test("whatsapp-ingest: POST with valid signature and no messages returns 200", async () => {
  const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [] } }] }] });
  const signature = await signMetaPayload(body, "test-secret");
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": signature,
    },
    body,
  });
  const data = await res.json();
  if (res.status !== 200) {
    throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
  }
  if (data.success !== true) {
    throw new Error(`Expected { success: true }, got: ${JSON.stringify(data)}`);
  }
});
