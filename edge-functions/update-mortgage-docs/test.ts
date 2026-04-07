import { handler } from "./index.ts";
import { mockClientFactory } from "../_shared/test-mock.ts";

Deno.env.set("SUPABASE_URL", "http://test.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

Deno.test("update-mortgage-docs: GET returns 405", async () => {
  const res = await handler(
    new Request("http://localhost", { method: "GET" }),
    mockClientFactory(),
  );
  if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
});

Deno.test("update-mortgage-docs: missing fields returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "some-id" }), // missing edit_token, doc_type, path
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("update-mortgage-docs: invalid doc_type returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "some-id",
        edit_token: "tok",
        doc_type: "evil_type",
        path: "docs/file.pdf",
      }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("update-mortgage-docs: path traversal returns 400", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "some-id",
        edit_token: "tok",
        doc_type: "passport",
        path: "../etc/passwd",
      }),
    }),
    mockClientFactory(),
  );
  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
});

Deno.test("update-mortgage-docs: wrong edit_token returns 401", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "app-1",
        edit_token: "wrong-token-xyz",
        doc_type: "passport",
        path: "mortgage-docs/passport.pdf",
      }),
    }),
    mockClientFactory({
      "mortgage_applications": {
        data: { id: "app-1", edit_token: "correct-token-abc" },
        error: null,
      },
    }),
  );
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
});

Deno.test("update-mortgage-docs: valid request returns 200", async () => {
  const token = "valid-tok-abc";
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "app-1",
        edit_token: token,
        doc_type: "passport",
        path: "mortgage-docs/passport.pdf",
      }),
    }),
    mockClientFactory({
      "mortgage_applications": {
        data: { id: "app-1", edit_token: token },
        error: null,
      },
      "mortgage_applications:write": { data: null, error: null },
    }),
  );
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  const body = await res.json();
  if (body.ok !== true) throw new Error(`Expected ok:true, got: ${JSON.stringify(body)}`);
});

Deno.test("update-mortgage-docs: unknown application returns 404", async () => {
  const res = await handler(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "nonexistent-app",
        edit_token: "some-token",
        doc_type: "passport",
        path: "mortgage-docs/passport.pdf",
      }),
    }),
    mockClientFactory(), // mortgage_applications defaults to NOT_FOUND
  );
  if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
});
