import { cleanupOtp, fnUrl } from "../_shared/test-helpers.ts";

const URL = fnUrl("send-otp");

Deno.test("send-otp: missing email returns 400", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("send-otp: empty string email returns 400", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "" }),
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("send-otp: invalid email format returns 400", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "not-an-email" }),
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("send-otp: numeric email returns 400", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: 12345 }),
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("send-otp: test mode email succeeds without real Resend call", async () => {
  // When ENABLE_TEST_MODE=true, boban@sellingdubai.com stores OTP "123456" and
  // returns 200 without calling Resend — safe for CI without email credentials.
  // If test mode is off, the function returns 502 (no Resend key locally).
  const TEST_EMAIL = "boban@sellingdubai.com";
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL }),
    });
    if (res.status !== 200 && res.status !== 502) {
      throw new Error(`Expected 200 (test mode) or 502 (no Resend key), got ${res.status}`);
    }
    await res.body?.cancel();
  } finally {
    await cleanupOtp(TEST_EMAIL);
  }
});

Deno.test("send-otp: OPTIONS returns CORS headers", async () => {
  const res = await fetch(URL, {
    method: "OPTIONS",
    headers: { "Origin": "https://sellingdubai.ae" },
  });
  if (!res.ok) throw new Error(`OPTIONS failed with ${res.status}`);
  const allowOrigin = res.headers.get("access-control-allow-origin");
  if (!allowOrigin) throw new Error("Missing Access-Control-Allow-Origin");
  await res.body?.cancel();
});
