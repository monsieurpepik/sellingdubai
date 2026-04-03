import {
  cleanupAgent,
  fnUrl,
  seedAgent,
  seedUsedMagicLink,
} from "../_shared/test-helpers.ts";

const URL = fnUrl("upload-image");

// Minimal valid JPEG base64 (1x1 pixel)
const TINY_JPEG_B64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFgABAQEAAAAAAAAAAAAAAAAABgUEB/8QAIhAAAQMFAQEBAQAAAAAAAAAAAQIDBAUREiExQVH/2gAIAQEAAT8ArNcK2mJ5w3GNjJD5ywH2B3k9rGf3jk4kLJJPyOtFFFV/9k=";

Deno.test("upload-image: missing token returns 400", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_base64: TINY_JPEG_B64 }),
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("upload-image: missing image returns 400", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "irrelevant" }),
  });
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("upload-image: invalid token returns 401", async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: crypto.randomUUID(), image_base64: TINY_JPEG_B64 }),
  });
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("upload-image: unused magic link (not activated) returns 401", async () => {
  const agent = await seedAgent();
  try {
    const { seedMagicLink } = await import("../_shared/test-helpers.ts");
    const link = await seedMagicLink(agent.id as string);
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: link.token, image_base64: TINY_JPEG_B64 }),
    });
    if (res.status !== 401) throw new Error(`Expected 401 for unused link, got ${res.status}`);
    await res.body?.cancel();
  } finally {
    await cleanupAgent(agent.id as string);
  }
});

Deno.test("upload-image: OPTIONS returns CORS headers", async () => {
  const res = await fetch(URL, {
    method: "OPTIONS",
    headers: { "Origin": "https://sellingdubai.ae" },
  });
  if (!res.ok) throw new Error(`OPTIONS failed with ${res.status}`);
  await res.body?.cancel();
});
