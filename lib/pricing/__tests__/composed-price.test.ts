import { describe, expect, it } from "vitest";
import {
  UNKEYED,
  baselineCaseMsrpByFamily,
  priceComposedBuild,
  type PricedComponent,
} from "@/lib/pricing/composed-price";

/**
 * Fixtures are the live Costings values (prod, 2026-09-13). The point of this file
 * is that the nine premium price points come out EXACTLY, because they are hand-set
 * and do not decompose into a shared core — see the migration header.
 */

const COVER_MSRP = { XS: 25, S: 26, M: 29, L: 32, XL: 35 } as const;
const LINEN_MSRP = { XS: 65, S: 72, M: 75, L: 89, XL: 113 } as const;
const FIBRECOOL_MSRP: Record<string, number | null> = {
  XS: 88, S: 97, M: 104, L: 122, XL: null,
};

const PREMIUM: Record<string, { linen: number; fibrecool: number | null }> = {
  XS: { linen: 340, fibrecool: 360 },
  S: { linen: 400, fibrecool: 430 },
  M: { linen: 430, fibrecool: 460 },
  L: { linen: 580, fibrecool: 610 },
  XL: { linen: 680, fibrecool: null },
};

/** The case the premium BOM ships for each size — two are Fibrecool, three linen. */
const PREMIUM_DEFAULT_CASE: Record<string, "linen" | "fibrecool"> = {
  XS: "fibrecool", S: "linen", M: "fibrecool", L: "linen", XL: "linen",
};

const satin = (size: keyof typeof COVER_MSRP): PricedComponent => ({
  item_id: 1, msrp: COVER_MSRP[size],
});
const batik = (): PricedComponent => ({ item_id: 29, msrp: 33 });

function casesFor(size: string): PricedComponent[] {
  const out: PricedComponent[] = [
    { item_id: 100, msrp: LINEN_MSRP[size as keyof typeof LINEN_MSRP], family: "linen" },
    { item_id: 101, msrp: LINEN_MSRP[size as keyof typeof LINEN_MSRP], family: "linen" },
  ];
  out.push({ item_id: 102, msrp: FIBRECOOL_MSRP[size], family: "fibrecool" });
  return out;
}

function premiumInput(size: string, chosen: "linen" | "fibrecool" | null, cover?: PricedComponent) {
  const cases = casesFor(size);
  const byFamily: Record<string, number> = {};
  if (PREMIUM[size].linen != null) byFamily.linen = PREMIUM[size].linen;
  if (PREMIUM[size].fibrecool != null) byFamily.fibrecool = PREMIUM[size].fibrecool!;
  const defaultCase = cases.find((c) => c.family === PREMIUM_DEFAULT_CASE[size])!;
  return {
    msrpByFamily: byFamily,
    defaultCover: satin(size as keyof typeof COVER_MSRP),
    defaultCase,
    caseOptions: cases,
    chosenCover: cover ?? null,
    chosenCase: chosen == null ? null : cases.find((c) => c.family === chosen)!,
    addonLines: [],
  };
}

describe("priceComposedBuild — the nine premium price points", () => {
  for (const size of ["XS", "S", "M", "L", "XL"]) {
    it(`${size} linen = ${PREMIUM[size].linen}`, () => {
      const r = priceComposedBuild(premiumInput(size, "linen"));
      expect(r).toMatchObject({ ok: true, subtotal: PREMIUM[size].linen });
    });

    const fc = PREMIUM[size].fibrecool;
    if (fc != null) {
      it(`${size} fibrecool = ${fc}`, () => {
        const r = priceComposedBuild(premiumInput(size, "fibrecool"));
        expect(r).toMatchObject({ ok: true, subtotal: fc });
      });
    }
  }

  it("XL Fibrecool is refused, not sold at a discount", () => {
    // Item 37 has no MSRP and no price row. Counting null as 0 would have priced it
    // at 680 - 113 = 567, i.e. CHEAPER than the linen it upgrades from.
    const r = priceComposedBuild(premiumInput("XL", "fibrecool"));
    expect(r).toMatchObject({ ok: false, code: "unpriced_component" });
  });
});

describe("priceComposedBuild — the default build costs the shelf price", () => {
  it("premium XS with no selection is 360, its Fibrecool default", () => {
    const r = priceComposedBuild(premiumInput("XS", null));
    expect(r).toMatchObject({ ok: true, subtotal: 360 });
  });

  it("premium S with no selection is 400, its linen default", () => {
    const r = priceComposedBuild(premiumInput("S", null));
    expect(r).toMatchObject({ ok: true, subtotal: 400 });
  });
});

describe("priceComposedBuild — only what differs moves the price", () => {
  it("a dearer cover adds its difference", () => {
    const r = priceComposedBuild(premiumInput("XS", "linen", batik()));
    expect(r).toMatchObject({ ok: true, coverDelta: 8, subtotal: 348 });
  });

  it("swapping between two cases of the same family changes nothing", () => {
    const cases = casesFor("M");
    const base = premiumInput("M", "linen");
    const other = { ...base, chosenCase: cases[1] };
    expect(priceComposedBuild(base)).toMatchObject({ subtotal: 430 });
    expect(priceComposedBuild(other)).toMatchObject({ subtotal: 430 });
  });

  it("add-ons are extras, added at full MSRP", () => {
    const r = priceComposedBuild({
      ...premiumInput("XS", "linen"),
      addonLines: [{ msrp: 60, quantity: 1 }, { msrp: 45, quantity: 2 }],
    });
    expect(r).toMatchObject({ ok: true, addons: 150, subtotal: 490 });
  });
});

describe("priceComposedBuild — basic and bolster reach the same answer unkeyed", () => {
  const basicXsCases = casesFor("XS");
  const basicXs = {
    msrpByFamily: { [UNKEYED]: 170 },
    defaultCover: satin("XS"),
    defaultCase: basicXsCases[0], // Deep Blue Linen, 65
    caseOptions: basicXsCases,
    chosenCover: null,
    chosenCase: null,
    addonLines: [],
  };

  it("the default basic build is its shelf price, not shelf + cover + case", () => {
    // The bug this replaces charged 170 + 25 + 65 = 260 for a 170 pillow.
    expect(priceComposedBuild(basicXs)).toMatchObject({ ok: true, subtotal: 170 });
  });

  it("upgrading a basic case to Fibrecool adds only the difference", () => {
    const r = priceComposedBuild({ ...basicXs, chosenCase: basicXsCases[2] });
    expect(r).toMatchObject({ ok: true, caseDelta: 23, subtotal: 193 });
  });

  it("a bolster with no cover or case at all prices at its row", () => {
    const r = priceComposedBuild({
      msrpByFamily: { [UNKEYED]: 230 },
      defaultCover: null,
      defaultCase: null,
      caseOptions: [],
      chosenCover: null,
      chosenCase: null,
      addonLines: [],
    });
    expect(r).toMatchObject({ ok: true, subtotal: 230 });
  });
});

describe("priceComposedBuild — refusals", () => {
  it("no row at all is no_price", () => {
    const r = priceComposedBuild({ ...premiumInput("XS", "linen"), msrpByFamily: {} });
    expect(r).toMatchObject({ ok: false, code: "no_price" });
  });

  it("an unpriced cover is refused", () => {
    const r = priceComposedBuild(premiumInput("XS", "linen", { item_id: 99, msrp: null }));
    expect(r).toMatchObject({ ok: false, code: "unpriced_component" });
  });
});

describe("baselineCaseMsrpByFamily", () => {
  it("ignores unpriced and unfamilied cases", () => {
    const out = baselineCaseMsrpByFamily([
      { item_id: 1, msrp: 65, family: "linen" },
      { item_id: 2, msrp: null, family: "fibrecool" },
      { item_id: 3, msrp: 50, family: null },
    ]);
    expect(out).toEqual({ linen: 65 });
  });

  it("takes the cheapest when a family disagrees with itself", () => {
    const out = baselineCaseMsrpByFamily([
      { item_id: 1, msrp: 72, family: "linen" },
      { item_id: 2, msrp: 65, family: "linen" },
    ]);
    expect(out).toEqual({ linen: 65 });
  });
});
