import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cascadeEnding, loadEndingPlan } from "../pair-ending";

type Row = Record<string, unknown>;

/** In-memory mp_config_responses with the eq/in filters the helper uses. */
function fakeAdmin(rows: Row[]) {
  const from = () => {
    const filters: Array<(r: Row) => boolean> = [];
    let patch: Row | null = null;
    const b = {
      select: () => b,
      update: (p: Row) => ((patch = p), b),
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), b),
      then: (resolve: (v: unknown) => unknown) => {
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (patch) hit.forEach((r) => Object.assign(r, patch));
        return Promise.resolve({ data: hit, error: null }).then(resolve);
      },
    };
    return b;
  };
  return { from } as unknown as SupabaseClient;
}

const pair = (anchorStatus: string, companionStatus: string) => [
  { id: "a", paired_build_id: "a", status: anchorStatus, payment_intent_id: "pi", authorized_amount: 300 },
  { id: "b", paired_build_id: "a", status: companionStatus, payment_intent_id: "pi", authorized_amount: 120 },
];

describe("loadEndingPlan + cascadeEnding", () => {
  it("ending the anchor frees the whole hold and ends the companion", async () => {
    const rows = pair("assigned", "held");
    const admin = fakeAdmin(rows);
    const plan = await loadEndingPlan(admin, rows[0]);
    expect(plan).toEqual({
      releaseHold: true,
      cascadeTo: "b",
      intentAmount: 420,
      partner: { id: "b", status: "held" },
    });
    await cascadeEnding(admin, plan, "declined");
    expect(rows[1].status).toBe("declined");
  });

  it("ending the companion keeps the hold for a live anchor", async () => {
    const rows = pair("assigned", "assigned");
    const plan = await loadEndingPlan(fakeAdmin(rows), rows[1]);
    expect(plan).toMatchObject({ releaseHold: false, cascadeTo: null });
  });

  it("never cascades onto a companion that already moved on", async () => {
    const rows = pair("assigned", "captured");
    const admin = fakeAdmin(rows);
    await cascadeEnding(admin, { releaseHold: true, cascadeTo: "b" }, "cancelled");
    expect(rows[1].status).toBe("captured");
  });

  it("an unpaired Result needs no lookup", async () => {
    const row = { id: "c", paired_build_id: null, payment_intent_id: "pi", authorized_amount: 99 };
    expect(await loadEndingPlan(fakeAdmin([]), row)).toEqual({
      releaseHold: true,
      cascadeTo: null,
      intentAmount: 99,
      partner: null,
    });
  });
});
