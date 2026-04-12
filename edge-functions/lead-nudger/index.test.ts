import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeNudges, normalizePhone } from "./index.ts";

// --- normalizePhone ---

Deno.test("normalizePhone: strips non-digits and adds UAE code if missing", () => {
  assertEquals(normalizePhone("+971 50 123 4567"), "971501234567");
  assertEquals(normalizePhone("050 123 4567"), "971501234567");
  assertEquals(normalizePhone("00971501234567"), "971501234567");
});

Deno.test("normalizePhone: returns empty string for falsy input", () => {
  assertEquals(normalizePhone(null), "");
  assertEquals(normalizePhone(""), "");
});

// --- computeNudges ---

const BASE_AGENT = {
  id: "agent-1",
  name: "Test Agent",
  whatsapp: "+971501234567",
  photo_url: null,
  tagline: null,
  verification_status: "pending",
  nudge_day1_sent_at: null,
  nudge_day3_sent_at: null,
  nudge_day7_sent_at: null,
  nudge_weekly_sent_at: null,
};

Deno.test("computeNudges: day1 fires for agent created < 24h with no day1 sent", () => {
  const now = Date.now();
  const agent = { ...BASE_AGENT, created_at: new Date(now - 2 * 60 * 60 * 1000).toISOString() };
  const nudges = computeNudges(agent, 0, now);
  assertEquals(nudges.includes("day1"), true);
});

Deno.test("computeNudges: day1 does not fire if already sent", () => {
  const now = Date.now();
  const agent = {
    ...BASE_AGENT,
    created_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    nudge_day1_sent_at: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
  };
  const nudges = computeNudges(agent, 0, now);
  assertEquals(nudges.includes("day1"), false);
});

Deno.test("computeNudges: day3 fires for agent > 2 days old with incomplete profile", () => {
  const now = Date.now();
  const agent = {
    ...BASE_AGENT,
    created_at: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
    // no photo, no tagline — profile incomplete
  };
  const nudges = computeNudges(agent, 0, now); // 0 active listings
  assertEquals(nudges.includes("day3"), true);
});

Deno.test("computeNudges: day3 does not fire if profile is complete", () => {
  const now = Date.now();
  const agent = {
    ...BASE_AGENT,
    created_at: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
    photo_url: "https://example.com/photo.jpg",
    tagline: "Luxury specialist in Palm Jumeirah",
    whatsapp: "+971501234567",
  };
  const nudges = computeNudges(agent, 1, now); // 1 listing — complete
  assertEquals(nudges.includes("day3"), false);
});

Deno.test("computeNudges: day7 fires for agent > 6 days old with zero listings", () => {
  const now = Date.now();
  const agent = {
    ...BASE_AGENT,
    created_at: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const nudges = computeNudges(agent, 0, now);
  assertEquals(nudges.includes("day7"), true);
});

Deno.test("computeNudges: day7 does not fire if agent has listings", () => {
  const now = Date.now();
  const agent = {
    ...BASE_AGENT,
    created_at: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const nudges = computeNudges(agent, 2, now);
  assertEquals(nudges.includes("day7"), false);
});

Deno.test("computeNudges: weekly fires if nudge_weekly_sent_at > 7 days ago", () => {
  const now = Date.now();
  const agent = {
    ...BASE_AGENT,
    created_at: new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString(),
    nudge_weekly_sent_at: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const nudges = computeNudges(agent, 0, now);
  assertEquals(nudges.includes("weekly"), true);
});

Deno.test("computeNudges: weekly does not fire if sent < 7 days ago", () => {
  const now = Date.now();
  const agent = {
    ...BASE_AGENT,
    created_at: new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString(),
    nudge_weekly_sent_at: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const nudges = computeNudges(agent, 0, now);
  assertEquals(nudges.includes("weekly"), false);
});
