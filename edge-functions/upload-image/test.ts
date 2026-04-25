import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

// Minimal valid JPEG base64 (1x1 pixel)
const TINY_JPEG_B64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFgABAQEAAAAAAAAAAAAAAAAABgUEB/8QAIhAAAQMFAQEBAQAAAAAAAAAAAQIDBAUREiExQVH/2gAIAQEAAT8ArNcK2mJ5w3GNjJD5ywH2B3k9rGf3jk4kLJJPyOtFFFV/9k=";

Deno.test("upload-image: missing token returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: TINY_JPEG_B64 }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("upload-image: missing image returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "irrelevant" }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("upload-image: invalid token returns 401", async () => {
  // Default mock returns NOT_FOUND for magic_links → 401
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: crypto.randomUUID(), image_base64: TINY_JPEG_B64 }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("upload-image: unused magic link (not activated) returns 401", async () => {
  // Link exists but used_at is null → session not activated
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token", image_base64: TINY_JPEG_B64 }),
    }),
    mockClientFactory({
      "magic_links": { data: { agent_id: "agent-1", used_at: null }, error: null },
    }),
  );
  if (res.status !== 401) throw new Error(`Expected 401 for unused link, got ${res.status}`);
});

Deno.test("upload-image: agent not found returns 404", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token", image_base64: TINY_JPEG_B64 }),
    }),
    mockClientFactory({
      "magic_links": { data: { agent_id: "agent-1", used_at: "2024-01-01T00:00:00Z" }, error: null },
      // agents not in map → NOT_FOUND default → agent is null → 404
    }),
  );
  if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
});

Deno.test("upload-image: OPTIONS returns CORS headers", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "OPTIONS",
      headers: { "Origin": "https://sellingdubai.com" },
    }),
    mockClientFactory(),
  );
  if (!res.ok) throw new Error(`OPTIONS failed with ${res.status}`);
});

// Storage is not mocked — any test that reaches supabase.storage.upload will fail.
// Mark storage-path tests as ignored.
Deno.test.ignore("upload-image: valid token + image uploads successfully (requires storage mock)", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "valid-token", image_base64: TINY_JPEG_B64, file_type: "image/jpeg", image_type: "avatar" }),
    }),
    mockClientFactory({
      "magic_links": { data: { agent_id: "agent-1", used_at: "2024-01-01T00:00:00Z" }, error: null },
      "agents": { data: { id: "agent-1", slug: "test-agent" }, error: null },
    }),
  );
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
});
