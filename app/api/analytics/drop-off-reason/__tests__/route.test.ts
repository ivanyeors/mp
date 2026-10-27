import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";
import { resetRateLimits } from "@/lib/rate-limit";

/**
 * PRD-crm-retention-loop slice 10: the storefront card's answers. Anonymous,
 * checked against the step's answers and the page it was asked on, limited
 * per address, and never a way to write a decline's answer.
 */

const h = vi.hoisted(() => ({ db: {} as FakeDb }));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});

const { POST } = await import("../route");

const VISIT = "7a000000-0000-4000-8000-000000000001";
let ip = 0;
const post = (body: unknown, from = `203.0.113.${++ip % 250}`) =>
  POST(
    new Request("https://mpillow.test/api/analytics/drop-off-reason", {
      method: "POST",
      headers: { "content-type": "text/plain", "x-forwarded-for": from },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const answer = { step: "configurator", reason: "size_or_feel", path: "/en-US/mp-config", visitId: VISIT, visitorId: VISIT };

beforeEach(() => {
  h.db = {};
  resetRateLimits();
});

describe("POST /api/analytics/drop-off-reason", () => {
  it("records an anonymous answer with its step, page and Visit", async () => {
    const res = await post(answer);
    expect(res.status).toBe(200);
    expect(h.db.drop_off_reasons).toEqual([
      expect.objectContaining({
        step: "configurator",
        reason: "size_or_feel",
        other_text: null,
        path: "/mp-config",
        visit_id: VISIT,
        visitor_id: VISIT,
        result_id: null,
      }),
    ]);
  });

  it("keeps typed text only on the answers that take it", async () => {
    await post({ ...answer, reason: "other", text: "Need it in navy" });
    await post({ ...answer, visitId: null, reason: "price", text: "ignored" });
    expect(h.db.drop_off_reasons!.map((r) => r.other_text)).toEqual(["Need it in navy", null]);
  });

  it("refuses bad JSON, unknown answers, a decline step, and a page that is not the step's", async () => {
    expect((await post("{nope")).status).toBe(400);
    expect((await post({ ...answer, reason: "hate_it" })).status).toBe(400);
    expect((await post({ ...answer, step: "quote_decline", reason: "changed_mind" })).status).toBe(400);
    expect((await post({ ...answer, path: "/en-US/shop/checkout" })).status).toBe(400);
    expect((await post({ ...answer, path: "/en-US/settings/customers" })).status).toBe(400);
    expect(h.db.drop_off_reasons ?? []).toHaveLength(0);
  });

  it("limits one address to ten answers a minute", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await post({ ...answer, visitId: null }, "198.51.100.7")).status);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429]);
  });
});
