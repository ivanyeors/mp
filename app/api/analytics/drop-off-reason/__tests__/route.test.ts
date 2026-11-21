import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";
import { resetRateLimits } from "@/lib/rate-limit";

const h = vi.hoisted(() => ({ db: {} as FakeDb, hits: new Map<string, number>() }));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  const rpc = async (fn: string, args: { p_bucket: string; p_key: string; p_max: number }) => {
    if (fn !== "rate_limit_hit") return { data: null, error: { message: `no ${fn}` } };
    const key = `${args.p_bucket}:${args.p_key}`;
    const count = (h.hits.get(key) ?? 0) + 1;
    h.hits.set(key, count);
    return { data: count > args.p_max, error: null };
  };
  return { supabaseAdmin: () => Object.assign(fakeSupabaseAdmin(h.db), { rpc }) };
});

const { POST } = await import("../route");

const VISIT = "7a000000-0000-4000-8000-000000000001";
let ip = 0;
const post = (body: unknown, { from = `203.0.113.${++ip % 250}`, type = "application/json" } = {}) =>
  POST(
    new Request("https://mpillow.test/api/analytics/drop-off-reason", {
      method: "POST",
      headers: { "content-type": type, "x-forwarded-for": from },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const answer = { step: "configurator", reason: "size_or_feel", path: "/en-US/mp-config", visitId: VISIT, visitorId: VISIT };

beforeEach(() => {
  h.db = {};
  h.hits.clear();
  resetRateLimits();
});

describe("POST /api/analytics/drop-off-reason", () => {
  it("records an answer with its step, page and Visit, and no contact details", async () => {
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

  it("keeps typed text only on the answers that take it, without control characters", async () => {
    await post({ ...answer, reason: "other", text: "Need it\u0000 in navy\u0007" });
    await post({ ...answer, visitId: null, reason: "price", text: "ignored" });
    expect(h.db.drop_off_reasons!.map((r) => r.other_text)).toEqual(["Need it in navy", null]);
  });

  it("refuses bad JSON, unknown answers, a decline step, a missing page and a page that is not the step's", async () => {
    expect((await post("{nope")).status).toBe(400);
    expect((await post({ ...answer, reason: "hate_it" })).status).toBe(400);
    expect((await post({ ...answer, step: "quote_decline", reason: "changed_mind" })).status).toBe(400);
    expect((await post({ ...answer, path: undefined })).status).toBe(400);
    expect((await post({ ...answer, path: "/en-US/shop/checkout" })).status).toBe(400);
    expect((await post({ ...answer, path: "/en-US/settings/customers" })).status).toBe(400);
    expect(h.db.drop_off_reasons ?? []).toHaveLength(0);
  });

  it("takes JSON only, and nothing oversized", async () => {
    expect((await post(answer, { type: "text/plain" })).status).toBe(415);
    expect((await post({ ...answer, reason: "other", text: "x".repeat(5000) })).status).toBe(413);
    expect(h.db.drop_off_reasons ?? []).toHaveLength(0);
  });

  it("limits one address to six answers an hour, across instances", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) codes.push((await post({ ...answer, visitId: null }, { from: "198.51.100.7" })).status);
    expect(codes.slice(0, 6).every((c) => c === 200)).toBe(true);
    expect(codes.slice(6)).toEqual([429, 429]);
    expect(h.hits.get("drop-off-reason:198.51.100.7")).toBe(8);
  });
});
