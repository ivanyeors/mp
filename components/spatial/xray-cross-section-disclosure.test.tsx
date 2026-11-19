import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { BolsterCrossSection, XrayCrossSection } from "./xray-cross-section";
import { XrayCrossSectionStrip } from "./xray-cross-section-strip";
import { DEFAULT_CUT } from "@/lib/spatial-fillings/cross-section";
import { fitBolster, fitPillow } from "@/lib/spatial-fillings/fit";

// A phone: every cut sits under its disclosure.
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));

const fit = fitPillow([], { size: "M" });
const subtypes = new Map<number, string | null>();
/** The disclosure's root element: its state and whether the cut is drawn inside it. */
const disclosure = (markup: string) => ({
  state: markup.match(/<div[^>]*data-xray-cross-section-disclosure[^>]*>/)?.[0].match(/data-state="(\w+)"/)?.[1],
  // Not the chevron (a lucide icon): the cut itself.
  drawsCut: /<svg(?![^>]*lucide)[^>]*viewBox/.test(markup),
});

// Owner, 2026-11-19: the cross-section is shown by default on phones, with no prop from the caller.
describe("phone cross-section disclosure", () => {
  it("the single cut starts open and draws the cut", () => {
    const d = disclosure(renderToStaticMarkup(<XrayCrossSection fit={fit} cut={DEFAULT_CUT} itemSubtypes={subtypes} />));
    expect(d).toEqual({ state: "open", drawsCut: true });
  });

  it("the strip's three cuts start open with no defaultOpen prop", () => {
    const d = disclosure(renderToStaticMarkup(<XrayCrossSectionStrip fit={fit} itemSubtypes={subtypes} />));
    expect(d).toEqual({ state: "open", drawsCut: true });
  });

  it("the Mbolster end-on cut starts open", () => {
    const d = disclosure(renderToStaticMarkup(<BolsterCrossSection fit={fitBolster([], "medium")} itemSubtypes={subtypes} />));
    expect(d).toEqual({ state: "open", drawsCut: true });
  });
});
