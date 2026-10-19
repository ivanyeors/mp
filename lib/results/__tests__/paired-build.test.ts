import { describe, expect, it } from "vitest";
import {
  companionAtAccept,
  endingPlan,
  isAnchor,
  isCompanion,
  pairAuthorized,
  pairReadyToAccept,
  shipsWithAnchor,
} from "../paired-build";

const ANCHOR = "a";
const anchor = { id: ANCHOR, paired_build_id: ANCHOR, payment_intent_id: "pi_1" };
const companion = { id: "b", paired_build_id: ANCHOR, payment_intent_id: "pi_1" };
const single = { id: "c", paired_build_id: null, payment_intent_id: "pi_2" };

describe("pair roles", () => {
  it("names the anchor and the companion by the shared id", () => {
    expect(isAnchor(anchor)).toBe(true);
    expect(isCompanion(anchor)).toBe(false);
    expect(isCompanion(companion)).toBe(true);
    expect(isAnchor(single) || isCompanion(single)).toBe(false);
  });

  it("charges shipping on the anchor only", () => {
    expect(shipsWithAnchor(companion)).toBe(true);
    expect(shipsWithAnchor(anchor)).toBe(false);
    expect(shipsWithAnchor(single)).toBe(false);
  });
});

describe("endingPlan", () => {
  it("an unpaired Result releases its own hold, as before", () => {
    expect(endingPlan(single, null)).toEqual({ releaseHold: true, cascadeTo: null });
    expect(endingPlan({ ...single, payment_intent_id: null }, null)).toEqual({
      releaseHold: false,
      cascadeTo: null,
    });
  });

  it("ending the anchor ends a live companion and frees the hold", () => {
    expect(endingPlan(anchor, { ...companion, status: "held" })).toEqual({
      releaseHold: true,
      cascadeTo: "b",
    });
    expect(endingPlan(anchor, { ...companion, status: "assigned" })).toEqual({
      releaseHold: true,
      cascadeTo: "b",
    });
  });

  it("ending the anchor leaves an already-ended companion where it is", () => {
    expect(endingPlan(anchor, { ...companion, status: "declined" })).toEqual({
      releaseHold: true,
      cascadeTo: null,
    });
  });

  it("ending the companion keeps the hold while the anchor still needs it", () => {
    for (const status of ["held", "assigned", "accepted"]) {
      expect(endingPlan(companion, { ...anchor, status })).toEqual({
        releaseHold: false,
        cascadeTo: null,
      });
    }
  });

  it("ending the companion after the anchor has ended frees the hold", () => {
    expect(endingPlan(companion, { ...anchor, status: "expired" })).toEqual({
      releaseHold: true,
      cascadeTo: null,
    });
    expect(endingPlan(companion, null)).toEqual({ releaseHold: true, cascadeTo: null });
  });
});

describe("pairAuthorized", () => {
  it("sums what each member quoted — the whole intent", () => {
    expect(pairAuthorized([{ authorized_amount: "360.00" }, { authorized_amount: 129.9 }])).toBe(489.9);
  });

  it("is null when nothing was held on a card", () => {
    expect(pairAuthorized([{ authorized_amount: null }, { authorized_amount: null }])).toBeNull();
  });
});

describe("companionAtAccept", () => {
  it("takes an assigned companion along", () => {
    expect(companionAtAccept({ status: "assigned" })).toEqual({ ok: true, include: true });
  });

  it("refuses while the companion is still being built", () => {
    expect(companionAtAccept({ status: "held" })).toMatchObject({ ok: false, code: "pair_pending" });
  });

  it("leaves out a companion that has ended, and an unpaired Result has none", () => {
    for (const status of ["declined", "cancelled", "expired"]) {
      expect(companionAtAccept({ status })).toEqual({ ok: true, include: false });
    }
    expect(companionAtAccept(null)).toEqual({ ok: true, include: false });
  });

  it("refuses a companion already mid-accept", () => {
    expect(companionAtAccept({ status: "accepted" })).toMatchObject({ ok: false, code: "pair_busy" });
  });
});

describe("pairReadyToAccept", () => {
  it("waits while any member is still held", () => {
    expect(pairReadyToAccept([{ status: "assigned" }, { status: "held" }])).toBe(false);
    expect(pairReadyToAccept([{ status: "assigned" }, { status: "assigned" }])).toBe(true);
    expect(pairReadyToAccept([{ status: "assigned" }, { status: "declined" }])).toBe(true);
  });
});
