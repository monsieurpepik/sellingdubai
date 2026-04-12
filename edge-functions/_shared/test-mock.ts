// @ts-check
/**
 * test-mock.ts — Chainable Supabase client mock for unit tests.
 *
 * Usage:
 *   import { createMockSupabase } from "../_shared/test-mock.ts";
 *
 *   const mock = createMockSupabase({
 *     "magic_links": { data: { agent_id: "x", used_at: "...", revoked_at: null }, error: null },
 *     "agents":      { data: { id: "x", slug: "test-agent", tier: "free" }, error: null },
 *     // Array result — just wrap in array:
 *     "properties":  { data: [], error: null },
 *     // Count query — use "<table>:count" key:
 *     "leads:count": { count: 0, error: null },
 *   });
 *
 *   // In the test:
 *   const res = await handler(req, () => mock);
 *
 * Defaults (when no override provided):
 *   - single()      → { data: null, error: { code: "PGRST116", message: "Not found" } }
 *   - maybeSingle() → { data: null, error: null }
 *   - await (array) → { data: [], error: null }
 *   - count query   → { count: 0, error: null }
 *   - write (insert/update/delete) → { data: null, error: null }
 */

export interface MockResponse {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
  count?: number;
}

const NOT_FOUND: MockResponse = { data: null, error: { code: "PGRST116", message: "Not found" } };
const EMPTY_ARRAY: MockResponse = { data: [], error: null };
const WRITE_OK: MockResponse = { data: null, error: null };
const COUNT_ZERO: MockResponse = { count: 0, error: null };

function makeBuilder(
  responses: Record<string, MockResponse>,
  tableName: string,
): Record<string, unknown> {
  let isCount = false;
  let isCountWithData = false; // count:"exact" without head:true — returns data + count
  let isWrite = false;

  const getResponse = (key: string, fallback: MockResponse): MockResponse =>
    responses[key] ?? fallback;

  const builder: Record<string, unknown> = {
    select(...args: unknown[]) {
      const opts = args[1];
      if (opts && typeof opts === "object" && (opts as Record<string, unknown>).count) {
        const isHead = !!(opts as Record<string, unknown>).head;
        if (isHead) {
          isCount = true;
        } else {
          isCountWithData = true;
        }
      }
      return builder;
    },
    insert(_data: unknown) { isWrite = true; return builder; },
    update(_data: unknown) { isWrite = true; return builder; },
    upsert(_data: unknown) { isWrite = true; return builder; },
    delete() { isWrite = true; return builder; },
    eq(_col: string, _val: unknown) { return builder; },
    neq(_col: string, _val: unknown) { return builder; },
    gt(_col: string, _val: unknown) { return builder; },
    gte(_col: string, _val: unknown) { return builder; },
    lt(_col: string, _val: unknown) { return builder; },
    lte(_col: string, _val: unknown) { return builder; },
    in(_col: string, _vals: unknown[]) { return builder; },
    is(_col: string, _val: unknown) { return builder; },
    ilike(_col: string, _pattern: string) { return builder; },
    not(_col: string, _op: string, _val: unknown) { return builder; },
    or(_filter: string) { return builder; },
    limit(_n: number) { return builder; },
    order(..._args: unknown[]) { return builder; },
    range(_from: number, _to: number) { return builder; },

    /** Terminal: expect a single row */
    single(): Promise<MockResponse> {
      if (isWrite) {
        // Prefer tableName:write key if present, fall back to tableName, then WRITE_OK
        const writeKey = `${tableName}:write`;
        return Promise.resolve(responses[writeKey] ?? getResponse(tableName, WRITE_OK));
      }
      return Promise.resolve(getResponse(tableName, NOT_FOUND));
    },

    /** Terminal: expect zero or one row (no error on missing) */
    maybeSingle(): Promise<MockResponse> {
      const r = responses[tableName];
      if (!r || r.error?.code === "PGRST116") {
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve(r);
    },

    /** Terminal: awaited directly (array result or write result) */
    then(
      resolve: (value: MockResponse) => unknown,
      _reject?: (reason: unknown) => unknown,
    ) {
      let result: MockResponse;
      if (isCountWithData) {
        // count:"exact" without head:true — return data array + count
        const r = responses[tableName];
        const countR = responses[`${tableName}:count`];
        const data = r
          ? (Array.isArray(r.data) ? r.data : r.data != null ? [r.data] : [])
          : [];
        const count = countR?.count ?? r?.count ?? data.length;
        result = { data, count, error: r?.error ?? null };
      } else if (isCount) {
        result = getResponse(`${tableName}:count`, COUNT_ZERO);
      } else if (isWrite) {
        const writeKey = `${tableName}:write`;
        result = responses[writeKey] ?? getResponse(tableName, WRITE_OK);
      } else {
        // Array query — ensure data is always an array
        const r = responses[tableName];
        if (!r) {
          result = EMPTY_ARRAY;
        } else {
          result = {
            ...r,
            data: Array.isArray(r.data) ? r.data : r.data != null ? [r.data] : [],
          };
        }
      }
      return Promise.resolve(result).then(resolve);
    },
  };

  return builder;
}

/**
 * Create a mock Supabase client.
 *
 * Pass an object mapping table names to mock responses.
 * Returns a factory function `() => mockClient` that matches
 * the signature expected by handlers using dep-injection:
 *   `handler(req, () => mockClient)`
 *
 * But you can also call it as a createClient-compatible function:
 *   `handler(req, (_url, _key) => mockClient)`
 */
export function createMockSupabase(
  responses: Record<string, MockResponse> = {},
): { from: (table: string) => Record<string, unknown> } {
  return {
    from: (tableName: string) => makeBuilder(responses, tableName),
  };
}

/**
 * Convenience: a createClient-compatible factory that always returns the same mock.
 * Pass this as the second argument to handlers:
 *   `handler(req, mockClientFactory({ ... }))`
 */
export function mockClientFactory(
  responses: Record<string, MockResponse> = {},
): (_url: string, _key: string) => ReturnType<typeof createMockSupabase> {
  const client = createMockSupabase(responses);
  return (_url: string, _key: string) => client;
}
