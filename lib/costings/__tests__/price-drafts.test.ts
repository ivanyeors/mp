import { describe, expect, it } from "vitest";
import { keepDrafts, type PriceBases, type PriceDrafts } from "@/lib/costings/price-drafts";

const row = (costPrice: string, msrp: string, compareAt = "") => ({ costPrice, msrp, compareAt });
const base = (cost: number | null, msrp: number | null, compareAt: number | null = null) => ({ cost, msrp, compareAt });

const loaded = (drafts: PriceDrafts, bases: PriceBases) => ({ drafts, bases });

describe("keepDrafts", () => {
  it("takes the fresh values for every field nobody typed in", () => {
    const { drafts, savedChanges } = keepDrafts(
      { ...loaded({ "item:1": row("5.00", "20.00") }, { "item:1": base(500, 2000) }), savedChanges: [] },
      loaded({ "item:1": row("6.00", "25.00") }, { "item:1": base(600, 2500) }),
    );
    expect(drafts).toEqual({ "item:1": row("6.00", "25.00") });
    expect(savedChanges).toEqual([]);
  });

  it("keeps a typed field and still refreshes the other fields of the same row", () => {
    const { drafts, savedChanges } = keepDrafts(
      { ...loaded({ "item:1": row("5.00", "30.00") }, { "item:1": base(500, 2000) }), savedChanges: [] },
      loaded({ "item:1": row("6.00", "20.00") }, { "item:1": base(600, 2000) }),
    );
    expect(drafts).toEqual({ "item:1": row("6.00", "30.00") });
    expect(savedChanges).toEqual([]);
  });

  it("keeps a typed field whose saved value moved, and reports it", () => {
    const { drafts, savedChanges } = keepDrafts(
      { ...loaded({ "item:1": row("5.00", "30.00") }, { "item:1": base(500, 2000) }), savedChanges: [] },
      loaded({ "item:1": row("5.00", "25.00") }, { "item:1": base(500, 2500) }),
    );
    expect(drafts["item:1"]!.msrp).toBe("30.00");
    expect(savedChanges).toEqual([{ key: "item:1", field: "msrp" }]);
  });

  it("goes on reporting a moved saved value through a later reload that changes nothing", () => {
    const { savedChanges } = keepDrafts(
      {
        ...loaded({ "item:1": row("5.00", "30.00") }, { "item:1": base(500, 2500) }),
        savedChanges: [{ key: "item:1", field: "msrp" }],
      },
      loaded({ "item:1": row("5.00", "25.00") }, { "item:1": base(500, 2500) }),
    );
    expect(savedChanges).toEqual([{ key: "item:1", field: "msrp" }]);
  });

  it("drops the report once the saved value is what was typed", () => {
    const { drafts, savedChanges } = keepDrafts(
      {
        ...loaded({ "item:1": row("5.00", "30.00") }, { "item:1": base(500, 2000) }),
        savedChanges: [{ key: "item:1", field: "msrp" }],
      },
      loaded({ "item:1": row("5.00", "30.00") }, { "item:1": base(500, 3000) }),
    );
    expect(drafts["item:1"]!.msrp).toBe("30.00");
    expect(savedChanges).toEqual([]);
  });

  it("keeps a cleared field as cleared", () => {
    const { drafts } = keepDrafts(
      { ...loaded({ "item:1": row("5.00", "") }, { "item:1": base(500, 2000) }), savedChanges: [] },
      loaded({ "item:1": row("5.00", "20.00") }, { "item:1": base(500, 2000) }),
    );
    expect(drafts["item:1"]!.msrp).toBe("");
  });

  it("drops rows the fresh load no longer has and adds the ones it brings", () => {
    const { drafts } = keepDrafts(
      { ...loaded({ "item:1": row("5.00", "30.00") }, { "item:1": base(500, 2000) }), savedChanges: [] },
      loaded({ "item:2": row("1.00", "2.00") }, { "item:2": base(100, 200) }),
    );
    expect(drafts).toEqual({ "item:2": row("1.00", "2.00") });
  });
});
