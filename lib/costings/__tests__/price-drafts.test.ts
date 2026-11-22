import { describe, expect, it } from "vitest";
import { keepDrafts, type PriceBases, type PriceDrafts, type SavedChangeUnderDraft } from "@/lib/costings/price-drafts";

const row = (costPrice: string, msrp: string, compareAt = "") => ({ costPrice, msrp, compareAt });
const base = (cost: number | null, msrp: number | null, compareAt: number | null = null) => ({ cost, msrp, compareAt });

const mine = (drafts: PriceDrafts, bases: PriceBases, savedChanges: SavedChangeUnderDraft[] = []) => ({
  drafts,
  bases,
  savedChanges,
});
const fresh = (drafts: PriceDrafts, bases: PriceBases) => ({ drafts, bases });
const AUTOMATIC = { rebase: false };
const REFRESH = { rebase: true };

describe("keepDrafts", () => {
  it.each([AUTOMATIC, REFRESH])("takes the fresh values and bases for every field nobody typed in (%j)", (mode) => {
    const kept = keepDrafts(
      mine({ "item:1": row("5.00", "20.00") }, { "item:1": base(500, 2000) }),
      fresh({ "item:1": row("6.00", "25.00") }, { "item:1": base(600, 2500) }),
      mode,
    );
    expect(kept.drafts).toEqual({ "item:1": row("6.00", "25.00") });
    expect(kept.bases).toEqual({ "item:1": base(600, 2500) });
    expect(kept.savedChanges).toEqual([]);
  });

  it("keeps a typed field and still refreshes the other fields of the same row", () => {
    const kept = keepDrafts(
      mine({ "item:1": row("5.00", "30.00") }, { "item:1": base(500, 2000) }),
      fresh({ "item:1": row("6.00", "20.00") }, { "item:1": base(600, 2000) }),
      AUTOMATIC,
    );
    expect(kept.drafts).toEqual({ "item:1": row("6.00", "30.00") });
    expect(kept.bases).toEqual({ "item:1": base(600, 2000) });
    expect(kept.savedChanges).toEqual([]);
  });

  it("an automatic reload keeps the base a typed field started from, and reports the new saved value", () => {
    const kept = keepDrafts(
      mine({ "item:1": row("5.00", "50.00") }, { "item:1": base(500, 4000) }),
      fresh({ "item:1": row("5.00", "45.00") }, { "item:1": base(500, 4500) }),
      AUTOMATIC,
    );
    expect(kept.drafts["item:1"]!.msrp).toBe("50.00");
    expect(kept.bases["item:1"]).toEqual(base(500, 4000));
    expect(kept.savedChanges).toEqual([{ key: "item:1", field: "msrp", savedCents: 4500 }]);
  });

  it("a Refresh rebases a typed field on the new saved value, and still reports it", () => {
    const kept = keepDrafts(
      mine({ "item:1": row("5.00", "50.00") }, { "item:1": base(500, 4000) }),
      fresh({ "item:1": row("5.00", "45.00") }, { "item:1": base(500, 4500) }),
      REFRESH,
    );
    expect(kept.drafts["item:1"]!.msrp).toBe("50.00");
    expect(kept.bases["item:1"]).toEqual(base(500, 4500));
    expect(kept.savedChanges).toEqual([{ key: "item:1", field: "msrp", savedCents: 4500 }]);
  });

  it("goes on reporting a rebased field through a later reload that changes nothing", () => {
    const kept = keepDrafts(
      mine({ "item:1": row("5.00", "50.00") }, { "item:1": base(500, 4500) }, [
        { key: "item:1", field: "msrp", savedCents: 4500 },
      ]),
      fresh({ "item:1": row("5.00", "45.00") }, { "item:1": base(500, 4500) }),
      AUTOMATIC,
    );
    expect(kept.savedChanges).toEqual([{ key: "item:1", field: "msrp", savedCents: 4500 }]);
  });

  it("takes the saved value as the base, and drops the report, once it is what was typed", () => {
    const kept = keepDrafts(
      mine({ "item:1": row("5.00", "30.00") }, { "item:1": base(500, 2000) }, [
        { key: "item:1", field: "msrp", savedCents: 2500 },
      ]),
      fresh({ "item:1": row("5.00", "30.00") }, { "item:1": base(500, 3000) }),
      AUTOMATIC,
    );
    expect(kept.drafts["item:1"]!.msrp).toBe("30.00");
    expect(kept.bases["item:1"]).toEqual(base(500, 3000));
    expect(kept.savedChanges).toEqual([]);
  });

  it("keeps a cleared field as cleared", () => {
    const kept = keepDrafts(
      mine({ "item:1": row("5.00", "") }, { "item:1": base(500, 2000) }),
      fresh({ "item:1": row("5.00", "20.00") }, { "item:1": base(500, 2000) }),
      AUTOMATIC,
    );
    expect(kept.drafts["item:1"]!.msrp).toBe("");
    expect(kept.bases["item:1"]).toEqual(base(500, 2000));
  });

  it("drops rows the fresh load no longer has and adds the ones it brings", () => {
    const kept = keepDrafts(
      mine({ "item:1": row("5.00", "30.00") }, { "item:1": base(500, 2000) }),
      fresh({ "item:2": row("1.00", "2.00") }, { "item:2": base(100, 200) }),
      AUTOMATIC,
    );
    expect(kept.drafts).toEqual({ "item:2": row("1.00", "2.00") });
    expect(kept.bases).toEqual({ "item:2": base(100, 200) });
  });
});
