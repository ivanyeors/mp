import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { CrossSectionSvg } from "./xray-cross-section";
import { DEFAULT_CUT } from "@/lib/spatial-fillings/cross-section";
import { GENERIC_POUCH } from "@/lib/spatial-fillings/dimensions";
import { fitPillow } from "@/lib/spatial-fillings/fit";

// Slice 10's 360 px check: on a phone the cut must stay readable.
const dims = new Map([[1, { key: "k", kind: "pouch" as const, source: "measured" as const, measuredOn: "2026-10-01", dims: { ...GENERIC_POUCH, thicknessMm: 80, minThicknessMm: 60 } }]]);
// Four 80 mm (min 60) Layers across the whole centre Section: cannot close.
const over = fitPillow(
  (["front", "middle", "back"] as const).flatMap((subSection) =>
    [0, 1, 2, 3].map((row) => ({ section: "center" as const, subSection, slot: row + 1, itemId: 1, row })),
  ),
  { size: "M", dims },
);
const html = (compact: boolean) => renderToStaticMarkup(<CrossSectionSvg fit={over} cut={DEFAULT_CUT} itemSubtypes={new Map()} compact={compact} />);
const fontSizes = (markup: string) => [...markup.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]));

describe("CrossSectionSvg layouts", () => {
  it("desktop keeps the 664-unit view with the status inline", () => {
    const m = html(false);
    expect(m).toContain('viewBox="0 0 664 220"');
    expect(m).toMatch(/>\d+ mm · cannot close</);
  });

  it("phones draw a narrower view with larger type, ≥ 10 px at 330 px wide, and the status on its own line", () => {
    const m = html(true);
    const width = Number(m.match(/viewBox="0 0 (\d+)/)![1]);
    const scale = 330 / width;
    expect(Math.min(...fontSizes(m)) * scale).toBeGreaterThanOrEqual(10);
    expect(m).toMatch(/>\d+ mm</);
    expect(m).toContain(">cannot close<");
  });
});
