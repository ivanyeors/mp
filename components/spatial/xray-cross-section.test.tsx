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

describe("CrossSectionSvg along profiles", () => {
  const empty = (size: "XS" | "M") => fitPillow([], { size, dims });
  const along = (size: "XS" | "M", section: "left" | "center") =>
    renderToStaticMarkup(<CrossSectionSvg fit={empty(size)} cut={{ section }} itemSubtypes={new Map()} />);

  it("draws the designer profile per Section and Size", () => {
    expect(along("M", "left")).toContain('data-xray-profile="sides"');
    expect(along("M", "center")).toContain('data-xray-profile="center"');
    expect(along("XS", "center")).toContain('data-xray-profile="center-xs"');
  });
});

describe("CrossSectionSvg along pieces", () => {
  // One squashable pouch alone in its Section: it settles front-to-back across all three columns.
  const soft = new Map([[1, { key: "k", kind: "pouch" as const, source: "measured" as const, measuredOn: "2026-10-01", dims: { ...GENERIC_POUCH, thicknessMm: 60, minThicknessMm: 15 } }]]);
  const lone = fitPillow([{ section: "right", subSection: "middle", slot: 1, itemId: 1, row: 0 }], { size: "M", dims: soft });

  it("draws one slab for one pouch, however many columns it settles into", () => {
    const m = renderToStaticMarkup(<CrossSectionSvg fit={lone} cut={{ section: "right" }} itemSubtypes={new Map()} />);
    const s = lone.settle.pieces[0];
    expect(s.spanFrom).toBe("front");
    expect(s.spanTo).toBe("back");
    expect(m.match(/data-slab-status=/g)).toHaveLength(1);
  });

  it("draws a Neck support as a round roll", () => {
    const m = renderToStaticMarkup(<CrossSectionSvg fit={lone} cut={{ section: "right" }} itemSubtypes={new Map([[1, "Cervical neck support"]])} />);
    expect(m).toMatch(/data-slab-status="[a-z]+"[^>]*><path d="M[\d.]+ [\d.]+ A/);
  });

  it("an offset moves the pouch's settled span front ↔ back", () => {
    const pushed = fitPillow([{ section: "right", subSection: "middle", slot: 1, itemId: 1, row: 0, offsetYMm: 20 }], { size: "M", dims: dims });
    const home = fitPillow([{ section: "right", subSection: "middle", slot: 1, itemId: 1, row: 0 }], { size: "M", dims: dims });
    expect(pushed.sections.right.pieces[0].startMm).toBeGreaterThan(home.sections.right.pieces[0].startMm);
  });
});

describe("CrossSectionSvg pouches", () => {
  const two = fitPillow(
    [
      { section: "center", subSection: "front", slot: 1, itemId: 1, row: 0 },
      { section: "center", subSection: "front", slot: 2, itemId: 1, row: 1 },
    ],
    { size: "M", dims },
  );

  it("draws each pouch as a cushion of curves, shaded, with its name when it fits", () => {
    const m = renderToStaticMarkup(
      <CrossSectionSvg fit={two} cut={DEFAULT_CUT} itemSubtypes={new Map([[1, "6D"]])} itemSizes={new Map([[1, "S"]])} />,
    );
    const bodies = [...m.matchAll(/data-slab-status="[a-z]+"[^>]*><path d="([^"]+)"/g)].map((x) => x[1]);
    expect(bodies).toHaveLength(2);
    for (const d of bodies) expect(d.match(/C/g)).toHaveLength(8);
    expect(m).toContain("<linearGradient");
    expect(m.match(/>6D S</g)).toHaveLength(2);
    // One loft label for the Section, not one per column.
    expect(m.match(/>max \d+ mm</g)).toHaveLength(1);
    expect(m.match(/data-xray-column-divider/g)).toHaveLength(2);
  });

  it("an editor makes every pouch a focusable handle and draws a held pouch where it will land", () => {
    const editor = {
      svgRef: { current: null },
      ghostRef: { current: null },
      svgHandlers: {},
      slabHit: (slab: { key: string }) => ({ tabIndex: 0, role: "button", "data-slab-key": slab.key }),
      selectedKey: "center/front/1",
      hoveredKey: null,
    };
    const idle = renderToStaticMarkup(<CrossSectionSvg fit={two} cut={DEFAULT_CUT} itemSubtypes={new Map()} editor={{ ...editor, drag: null }} />);
    expect(idle.match(/tabindex="0"/g)).toHaveLength(2);
    expect(idle).toContain("data-slab-selected");
    const held = renderToStaticMarkup(
      <CrossSectionSvg
        fit={two}
        cut={DEFAULT_CUT}
        itemSubtypes={new Map()}
        editor={{
          ...editor,
          drag: {
            sourceKey: "center/front/1",
            landingKey: "center/front/1",
            column: "front",
            tone: "ok",
            ghost: { w: 120, h: 30, roll: false, puff: 1, subtype: null, label: "6D S", at: { x: 100, y: 50 } },
            overTab: false,
          },
        }}
      />,
    );
    expect(held).toContain('data-slab-mode="landing"');
    expect(held).toContain("data-xray-slab-ghost");
    expect(held).toContain('data-xray-drop-column="ok"');
    expect(held).not.toContain("data-slab-selected");
  });
});
