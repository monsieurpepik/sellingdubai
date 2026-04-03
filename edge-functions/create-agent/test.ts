import {
  cleanupAgent,
  cleanupOtp,
  fnUrl,
  seedAgent,
  seedOtp,
} from "../_shared/test-helpers.ts";

const URL = fnUrl("create-agent");

Deno.test("create-agent: missing required fields returns 400", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  const data = await res.json();
  if (!data.error) throw new Error("Expected error message in body");
});

Deno.test("create-agent: missing email returns 400", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ display_name: "Test Agent", whatsapp: "+971501234567" }),
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("create-agent: missing otp_code returns 400", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      display_name: "Test Agent",
      email: "test-no-otp@test.local",
      whatsapp: "+971501234567",
    }),
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("create-agent: invalid OTP code returns 400", async () => {
  const email = `test-bad-otp-${crypto.randomUUID().slice(0, 8)}@test.local`;
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: "Test Agent",
        email,
        whatsapp: "+971501234567",
        otp_code: "000000",
      }),
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    await res.body?.cancel();
  } finally {
    await cleanupOtp(email);
  }
});

Deno.test("create-agent: expired OTP returns 400", async () => {
  const email = `test-exp-otp-${crypto.randomUUID().slice(0, 8)}@test.local`;
  try {
    await seedOtp(email, "654321", {
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: "Test Agent",
        email,
        whatsapp: "+971501234567",
        otp_code: "654321",
      }),
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    await res.body?.cancel();
  } finally {
    await cleanupOtp(email);
  }
});

Deno.test("create-agent: duplicate email returns 409", async () => {
  const existing = await seedAgent();
  const email = existing.email as string;
  try {
    await seedOtp(email);
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: "Dupe Agent",
        email,
        whatsapp: "+971507654321",
        otp_code: "123456",
      }),
    });
    if (res.status !== 409) throw new Error(`Expected 409, got ${res.status}`);
    const data = await res.json();
    if (!data.error) throw new Error("Expected error in response");
    await res.body?.cancel();
  } finally {
    await cleanupOtp(email);
    await cleanupAgent(existing.id as string);
  }
});

Deno.test("create-agent: valid registration with test OTP creates agent", async () => {
  const email = `test-reg-${crypto.randomUUID().slice(0, 8)}@test.local`;
  let createdId: string | null = null;
  try {
    await seedOtp(email, "999888");
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: "Test Registration",
        email,
        whatsapp: "+971501234567",
        otp_code: "999888",
      }),
    });
    if (res.status !== 201) {
      const body = await res.text();
      throw new Error(`Expected 201, got ${res.status}: ${body}`);
    }
    const data = await res.json();
    if (!data.agent?.id) throw new Error("Expected agent.id in response");
    if (!data.agent?.slug) throw new Error("Expected agent.slug in response");
    if (!data.edit_token) throw new Error("Expected edit_token in response");
    createdId = data.agent.id;
  } finally {
    await cleanupOtp(email);
    if (createdId) await cleanupAgent(createdId);
  }
});

Deno.test("create-agent: OPTIONS returns CORS headers", async () => {
  const res = await fetch(URL, {
    method: "OPTIONS",
    headers: { "Origin": "https://sellingdubai.ae" },
  });
  if (!res.ok) throw new Error(`OPTIONS failed with ${res.status}`);
  const allowOrigin = res.headers.get("access-control-allow-origin");
  if (!allowOrigin) throw new Error("Missing Access-Control-Allow-Origin");
  await res.body?.cancel();
});
