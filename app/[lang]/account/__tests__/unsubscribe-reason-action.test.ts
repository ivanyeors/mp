import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * *Mind telling us why?* after the account's toggle is turned off
 * (PRD-crm-retention-loop slice 11): the answer is the signed-in Customer's
 * alone, never one named in the request, and it never changes consent.
 */

const h = vi.hoisted(() => ({
  sessionCustomerId: null as string | null,
  calls: [] as { fn: string; args: Record<string, unknown> }[],
  outcome: "recorded" as string,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/shop/customer-addresses", () => ({ getCurrentCustomerId: () => Promise.resolve(h.sessionCustomerId) }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      h.calls.push({ fn, args });
      return fn === "record_unsubscribe_reason" ? { data: h.outcome, error: null } : { data: null, error: { message: `no ${fn}` } };
    },
  }),
}));

const { answerMyUnsubscribeReason } = await import("../actions");

beforeEach(() => {
  h.sessionCustomerId = "c-own";
  h.calls = [];
  h.outcome = "recorded";
});

describe("answerMyUnsubscribeReason", () => {
  it("records the signed-in Customer's answer, whatever the request names", async () => {
    expect(await answerMyUnsubscribeReason({ reason: "have_what_i_need", customerId: "c-other" })).toEqual({ ok: true });
    expect(h.calls).toEqual([
      { fn: "record_unsubscribe_reason", args: { p_customer_id: "c-own", p_reason: "have_what_i_need", p_text: null } },
    ]);
  });

  it("is a thank-you when there is nothing to answer (subscribed again, or answered already)", async () => {
    h.outcome = "already";
    expect(await answerMyUnsubscribeReason({ reason: "too_many" })).toEqual({ ok: true });
    h.outcome = "not_unsubscribed";
    expect(await answerMyUnsubscribeReason({ reason: "too_many" })).toEqual({ ok: true });
  });

  it("refuses an unknown answer, and anyone signed out", async () => {
    expect(await answerMyUnsubscribeReason({ reason: "discount" })).toMatchObject({ ok: false });
    h.sessionCustomerId = null;
    expect(await answerMyUnsubscribeReason({ reason: "too_many" })).toEqual({ ok: false, error: "You must be signed in." });
    expect(h.calls).toEqual([]);
  });
});
