import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/rate-limit";

/**
 * PRD-crm-retention-loop slice 11: *Mind telling us why?* on the unsubscribe
 * page. Only with the same signed link the unsubscribe used, JSON only,
 * limited per address, and never a way to change consent: it records an
 * answer through `record_unsubscribe_reason()`, which decides whether there is
 * an unsubscribe to answer (assert-11-unsubscribe-reasons.sql proves it).
 */

const h = vi.hoisted(() => ({
  calls: [] as { fn: string; args: Record<string, unknown> }[],
  outcome: "recorded" as string,
  hits: new Map<string, number>(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === "rate_limit_hit") {
        const key = `${String(args.p_bucket)}:${String(args.p_key)}`;
        const count = (h.hits.get(key) ?? 0) + 1;
        h.hits.set(key, count);
        return { data: count > Number(args.p_max), error: null };
      }
      h.calls.push({ fn, args });
      if (fn === "record_unsubscribe_reason") return { data: h.outcome, error: null };
      return { data: null, error: { message: `no ${fn}` } };
    },
  }),
}));

const { unsubscribeToken } = await import("@/lib/marketing-consent/unsubscribe");
const { POST } = await import("../route");

const SECRET = "reason-test-secret";
const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const SEND = "5e5d0000-0000-4000-8000-000000000001";
let ip = 0;

const post = (body: unknown, { type = "application/json", from = `198.51.100.${++ip % 250}` } = {}) =>
  POST(
    new Request("https://custom.mpillow.com/api/email/unsubscribe/reason", {
      method: "POST",
      headers: { "content-type": type, "x-forwarded-for": from },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
const signed = () => ({ u: ID, t: unsubscribeToken(ID, SECRET)! });

beforeEach(() => {
  vi.stubEnv("UNSUBSCRIBE_SECRET", SECRET);
  h.calls = [];
  h.outcome = "recorded";
  h.hits.clear();
  resetRateLimits();
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/email/unsubscribe/reason", () => {
  it("records the answer for the link's Customer, and nothing else", async () => {
    const res = await post({ ...signed(), reason: "too_many" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recorded: true });
    expect(h.calls).toEqual([{ fn: "record_unsubscribe_reason", args: { p_customer_id: ID, p_reason: "too_many", p_text: null } }]);
    // Never a consent change: the unsubscribe route made it already.
    expect(h.calls.some((c) => c.fn === "set_marketing_email")).toBe(false);
  });

  it("keeps typed words with Other alone, up to 500 characters", async () => {
    await post({ ...signed(), reason: "other", text: "  Moving overseas " });
    expect(h.calls.at(-1)?.args).toMatchObject({ p_reason: "other", p_text: "Moving overseas" });
    await post({ ...signed(), reason: "not_relevant", text: "dropped" });
    expect(h.calls.at(-1)?.args).toMatchObject({ p_reason: "not_relevant", p_text: null });
    expect((await post({ ...signed(), reason: "other", text: "x".repeat(501) })).status).toBe(400);
  });

  it("takes a campaign link, signed with its send", async () => {
    const t = unsubscribeToken(ID, SECRET, SEND)!;
    expect((await post({ u: ID, t, s: SEND, reason: "not_happy" })).status).toBe(200);
  });

  it("refuses a link that does not verify, and an unknown answer, recording nothing", async () => {
    expect((await post({ u: ID, t: "forged", reason: "too_many" })).status).toBe(400);
    expect((await post({ ...signed(), reason: "give_me_a_discount" })).status).toBe(400);
    expect((await post({ reason: "too_many" })).status).toBe(400);
    expect(h.calls).toEqual([]);
  });

  it("is JSON only", async () => {
    const t = encodeURIComponent(signed().t);
    expect((await post(`u=${ID}&t=${t}&reason=too_many`, { type: "application/x-www-form-urlencoded" })).status).toBe(415);
    expect((await post("{not json")).status).toBe(400);
  });

  it("says already answered is fine, and nothing to answer is a 409", async () => {
    h.outcome = "already";
    expect(await (await post({ ...signed(), reason: "too_many" })).json()).toEqual({ ok: true, recorded: false });
    for (const outcome of ["not_unsubscribed", "complaint", "not_asked", "not_found"]) {
      h.outcome = outcome;
      expect((await post({ ...signed(), reason: "too_many" })).status, outcome).toBe(409);
    }
  });

  it("limits one address to 10 answers an hour", async () => {
    for (let i = 0; i < 10; i++) expect((await post({ ...signed(), reason: "too_many" }, { from: "192.0.2.9" })).status).toBe(200);
    expect((await post({ ...signed(), reason: "too_many" }, { from: "192.0.2.9" })).status).toBe(429);
  });

  it("is off until unsubscribe links can be signed", async () => {
    vi.stubEnv("UNSUBSCRIBE_SECRET", "");
    expect((await post({ ...signed(), reason: "too_many" })).status).toBe(503);
  });
});
