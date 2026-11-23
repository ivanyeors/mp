import { describe, expect, it } from "vitest";
import {
  isFieldDirty,
  keepDrafts,
  type PriceBases,
  type PriceDrafts,
  type SavedChangeUnderDraft,
} from "@/lib/costings/price-drafts";

const row = (costPrice: string, msrp: string, compareAt = "") => ({ costPrice, msrp, compareAt });
const base = (cost: number | null, msrp: number | null, compareAt: number | null = null) => ({ cost, msrp, compareAt });

const mine = (
  drafts: PriceDrafts,
  stored: PriceBases,
  conflictBases: PriceBases = stored,
  savedChanges: SavedChangeUnderDraft[] = [],
) => ({ drafts, stored, conflictBases, savedChanges });
const fresh = (drafts: PriceDrafts, stored: PriceBases) => ({ drafts, stored });
const AUTOMATIC = { rebase: false };
const REFRESH = { rebase: true };

describe("keepDrafts", () => {
  it.each([AUTOMATIC, REFRESH])("takes the fresh values and stored prices for every field nobody typed in (%j)", (mode) => {
    const kept = keepDrafts(
      mine({ "item:1": row("5.00", "20.00") }, { "item:1": base(500, 2000) }),
      fresh({ "item:1": row("6.00", "25.00") }, { "item:1": base(600, 2500) }),
      mode,
    );
    expect(kept.drafts).toEqual({ "item:1": row("6.00", "25.00") });
    expect(kept.stored).toEqual({ "item:1": base(600, 2500) });
    expect(kept.conflictBases).toEqual({ "item:1": base(600, 2500) });
    expect(kept.savedChanges).toEqual([]);
  });

  it("keeps a typed field and still refreshes the other fields of the same row", () => {
    const kept = keepDrafts(
      mine({ "item:1": row("5.00", "30.00") }, { "item:1": base(500, 2000) }),
      fresh({ "item:1": row("6.00", "20.00") }, { "item:1": base(600, 2000) }),
      AUTOMATIC,
    );
    expect(kept.drafts).toEqual({ "item:1": row("6.00", "30.00") });
    expect(kept.conflictBases).toEqual({ "item:1": base(600, 2000) });
    expect(kept.savedChanges).toEqual([]);
  });

  it("an automatic reload stores the new price but keeps the conflict base a typed field started from", () => {
    const kept = keepDrafts(
      mine({ "item:1": row("5.00", "50.00") }, { "item:1": base(500, 4000) }),
      fresh({ "item:1": row("5.00", "45.00") }, { "item:1": base(500, 4500) }),
      AUTOMATIC,
    );
    expect(kept.drafts["item:1"]!.msrp).toBe("50.00");
    expect(kept.stored["item:1"]).toEqual(base(500, 4500));
    expect(kept.conflictBases["item:1"]).toEqual(base(500, 4000));
    expect(kept.savedChanges).toEqual([{ key: "item:1", field: "msrp" }]);
  });

  it("a Refresh moves the conflict base of a typed field to the new stored price, and still reports it", () => {
    const kept = keepDrafts(
      mine({ "item:1": row("5.00", "50.00") }, { "item:1": base(500, 4500) }, { "item:1": base(500, 4000) }, [
        { key: "item:1", field: "msrp" },
      ]),
      fresh({ "item:1": row("5.00", "45.00") }, { "item:1": base(500, 4500) }),
      REFRESH,
    );
    expect(kept.drafts["item:1"]!.msrp).toBe("50.00");
    expect(kept.conflictBases["item:1"]).toEqual(base(500, 4500));
    expect(kept.savedChanges).toEqual([{ key: "item:1", field: "msrp" }]);
  });

  it("a price typed back to the value editing started from is still an edit while another price is stored", () => {
    const edits = mine({ "item:1": row("5.00", "40.00") }, { "item:1": base(500, 4500) }, { "item:1": base(500, 4000) }, [
      { key: "item:1", field: "msrp" },
    ]);
    expect(isFieldDirty(edits.drafts["item:1"], edits.stored["item:1"], "msrp")).toBe(true);

    const kept = keepDrafts(edits, fresh({ "item:1": row("5.00", "45.00") }, { "item:1": base(500, 4500) }), AUTOMATIC);
    expect(kept.drafts["item:1"]!.msrp).toBe("40.00");
    expect(kept.stored["item:1"]).toEqual(base(500, 4500));
    expect(kept.conflictBases["item:1"]).toEqual(base(500, 4000));
    expect(kept.savedChanges).toEqual([{ key: "item:1", field: "msrp" }]);
  });

  it("goes on reporting a refreshed field through a later reload that changes nothing", () => {
    const kept = keepDrafts(
      mine({ "item:1": row("5.00", "50.00") }, { "item:1": base(500, 4500) }, { "item:1": base(500, 4500) }, [
        { key: "item:1", field: "msrp" },
      ]),
      fresh({ "item:1": row("5.00", "45.00") }, { "item:1": base(500, 4500) }),
      AUTOMATIC,
    );
    expect(kept.savedChanges).toEqual([{ key: "item:1", field: "msrp" }]);
  });

  it("takes the stored price as the base, and drops the report, once it is what was typed", () => {
    const kept = keepDrafts(
      mine({ "item:1": row("5.00", "30.00") }, { "item:1": base(500, 2500) }, { "item:1": base(500, 2000) }, [
        { key: "item:1", field: "msrp" },
      ]),
      fresh({ "item:1": row("5.00", "30.00") }, { "item:1": base(500, 3000) }),
      AUTOMATIC,
    );
    expect(kept.drafts["item:1"]!.msrp).toBe("30.00");
    expect(kept.conflictBases["item:1"]).toEqual(base(500, 3000));
    expect(kept.savedChanges).toEqual([]);
  });

  it("keeps a cleared field as cleared", () => {
    const kept = keepDrafts(
      mine({ "item:1": row("5.00", "") }, { "item:1": base(500, 2000) }),
      fresh({ "item:1": row("5.00", "20.00") }, { "item:1": base(500, 2000) }),
      AUTOMATIC,
    );
    expect(kept.drafts["item:1"]!.msrp).toBe("");
    expect(kept.conflictBases["item:1"]).toEqual(base(500, 2000));
  });

  it("drops rows the fresh load no longer has and adds the ones it brings", () => {
    const kept = keepDrafts(
      mine({ "item:1": row("5.00", "30.00") }, { "item:1": base(500, 2000) }),
      fresh({ "item:2": row("1.00", "2.00") }, { "item:2": base(100, 200) }),
      AUTOMATIC,
    );
    expect(kept.drafts).toEqual({ "item:2": row("1.00", "2.00") });
    expect(kept.stored).toEqual({ "item:2": base(100, 200) });
    expect(kept.conflictBases).toEqual({ "item:2": base(100, 200) });
  });
});
