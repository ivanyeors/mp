import { describe, expect, it } from "vitest";

import {
  pairedPillowRows,
  parsePairedHandoff,
  type PairedHandoff,
} from "@/lib/configurator/paired-mbolster";

/**
 * A Paired build's step 2 (the Mbolster page) shows the Mpillow it is paired with.
 * Staff measured the customer, so the Mpillow owes the Measurement service (ADR
 * 0024). The fee is the Mpillow's, not the Mbolster's, and it must stay on screen
 * as its own row while the shopper customises the Mbolster, the way steps 1, 3
 * and 4 show it, rather than disappearing into the Mpillow's figure.
 */
const handoff: PairedHandoff = {
  v: 2,
  anchorId: "a",
  companionId: "b",
  sleepPosition: "side",
  reason: "",
  configPath: "/mp-config",
  pillow: {
    label: "Mpillow M · premium",
    ballpark: 520,
    currency: "SGD",
    goods: 470,
    services: [{ label: "Measurement (Premium)", amount: 50 }],
  },
};

describe("the Mpillow's Measurement service on step 2", () => {
  it("survives the hand-off between the two pages", () => {
    const stored = JSON.parse(JSON.stringify(handoff));
    expect(parsePairedHandoff(stored)?.pillow).toEqual(handoff.pillow);
  });

  it("shows the goods, then the fee on its own row, adding up to the total", () => {
    const rows = pairedPillowRows(handoff.pillow);
    expect(rows).toEqual([
      { key: "pillow", label: "Mpillow M · premium", amount: 470 },
      { key: "service-0", label: "Measurement (Premium)", amount: 50 },
    ]);
    expect(rows.reduce((s, r) => s + (r.amount ?? 0), 0)).toBe(handoff.pillow.ballpark);
  });

  it("shows one row when the customer measured themselves", () => {
    expect(pairedPillowRows({ ...handoff.pillow, goods: 520, services: [] })).toEqual([
      { key: "pillow", label: "Mpillow M · premium", amount: 520 },
    ]);
  });

  it("falls back to the one figure for a hand-off written before the split", () => {
    const legacy = { label: "Mpillow M · premium", ballpark: 520, currency: "SGD" };
    expect(pairedPillowRows(parsePairedHandoff({ ...handoff, pillow: legacy })!.pillow)).toEqual([
      { key: "pillow", label: "Mpillow M · premium", amount: 520 },
    ]);
  });

  it("never shows a split that does not add up to what the total charges", () => {
    expect(pairedPillowRows({ ...handoff.pillow, goods: 400 }).map((r) => r.amount)).toEqual([520]);
  });

  it("withholds an unpriced Mpillow, fee and all", () => {
    expect(pairedPillowRows({ ...handoff.pillow, ballpark: null }).map((r) => r.amount)).toEqual([null]);
  });
});
