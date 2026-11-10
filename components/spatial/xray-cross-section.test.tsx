import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { shellPolygon } from "./slab-shape";
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
/** Every text drawn under each column. */
const columnText = (markup: string) => [...markup.matchAll(/<g data-column="[a-z]+"[^>]*>(.*?)<\/g>/g)].map((m) => [...m[1].matchAll(/>([^<]+)</g)].map((t) => t[1]).join(" | "));
/** The drawn outline: its path, its transform's scale, and the polygon it makes in view units. */
const outlineOf = (markup: string) => {
  const m = markup.match(/<path d="([^"]+)" transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+) ([-\d.]+)\)" fill="[^"]*" data-xray-profile/)!;
  const [tx, ty, sx, sy] = m.slice(2).map(Number);
  return { sx, sy, polygon: shellPolygon(m[1], { tx, ty, sx, sy }) };
};
const inside = (poly: readonly (readonly [number, number])[], x: number, y: number) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};
/** Each cubic's end point. */
const anchors = (d: string) =>
  d.split(/(?=[CZ])/).flatMap((seg) => {
    const ns = [...seg.matchAll(/-?[\d.]+/g)].map((x) => Number(x[0]));
    return ns.length >= 2 ? [[ns[ns.length - 2], ns[ns.length - 1]] as const] : [];
  });

describe("CrossSectionSvg layouts", () => {
  it("desktop keeps the 664-unit view and names the columns, nothing else", () => {
    const m = html(false);
    expect(m).toMatch(/viewBox="0 0 664 [\d.]+"/);
    expect(columnText(m)).toEqual(["front", "middle", "back"]);
  });

  it("draws no loft budget, mm or status word, even when a column cannot close", () => {
    for (const compact of [false, true]) {
      const m = html(compact);
      expect(m).toContain('data-status="over"');
      expect(m).not.toMatch(/>max \d+ mm</);
      expect(m).not.toMatch(/>[^<]*\d+ mm[^<]*</);
      expect(m).not.toMatch(/>(cannot close|compressed|empty)</);
      expect(m).not.toContain('stroke-dasharray="6 4"');
    }
  });

  it("never squashes the outline: the same proportions on a phone as on a desktop, the designer's own", () => {
    for (const fit of [over, fitPillow([], { size: "XS", dims })])
      for (const section of ["left", "center"] as const) {
        const desk = outlineOf(renderToStaticMarkup(<CrossSectionSvg fit={fit} cut={{ section }} itemSubtypes={new Map()} />));
        const phone = renderToStaticMarkup(<CrossSectionSvg fit={fit} cut={{ section }} itemSubtypes={new Map()} compact />);
        const p = outlineOf(phone);
        // Uniform scale: one view unit per profile unit across as up.
        expect(Math.abs(desk.sy)).toBeCloseTo(desk.sx, 3);
        expect(Math.abs(p.sy)).toBeCloseTo(p.sx, 3);
        const aspect = (poly: readonly (readonly [number, number])[]) => {
          const xs = poly.map((q) => q[0]);
          const ys = poly.map((q) => q[1]);
          return (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys));
        };
        expect(aspect(p.polygon)).toBeCloseTo(aspect(desk.polygon), 2);
        expect(Number(phone.match(/data-xray-cut-aspect="([\d.]+)"/)![1])).toBeCloseTo(aspect(p.polygon), 1);
      }
  });

  it("phones draw a narrower view with larger type, ≥ 10 px at 330 px wide", () => {
    const m = html(true);
    const width = Number(m.match(/viewBox="0 0 (\d+)/)![1]);
    const scale = 330 / width;
    expect(Math.min(...fontSizes(m)) * scale).toBeGreaterThanOrEqual(10);
    expect(columnText(m)).toEqual(["front", "middle", "back"]);
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
  // One pouch alone in its Section, slid most of the way into the empty back: it stands in two columns.
  const soft = new Map([[1, { key: "k", kind: "pouch" as const, source: "measured" as const, measuredOn: "2026-10-01", dims: { ...GENERIC_POUCH, thicknessMm: 60, minThicknessMm: 15 } }]]);
  const lone = fitPillow([{ section: "right", subSection: "middle", slot: 1, itemId: 1, row: 0, offsetYMm: 100 }], { size: "M", dims: soft });

  it("draws one slab for one pouch, however many columns it stands in", () => {
    const m = renderToStaticMarkup(<CrossSectionSvg fit={lone} cut={{ section: "right" }} itemSubtypes={new Map()} />);
    const s = lone.settle.pieces[0];
    expect(s.spanFrom).toBe("middle");
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

  it("draws each pouch as a closed cushion of curves, inside the outline, shaded, with its name when it fits", () => {
    const m = renderToStaticMarkup(
      <CrossSectionSvg fit={two} cut={DEFAULT_CUT} itemSubtypes={new Map([[1, "6D"]])} itemSizes={new Map([[1, "S"]])} />,
    );
    const bodies = [...m.matchAll(/data-slab-status="[a-z]+"[^>]*><path d="([^"]+)"/g)].map((x) => x[1]);
    expect(bodies).toHaveLength(2);
    // In the front tip they are pressed into the case: still all curves, and every point inside it.
    const { polygon } = outlineOf(m);
    for (const d of bodies) {
      expect(d).toMatch(/^M[^LHVA]+Z$/);
      for (const [x, y] of anchors(d)) expect(inside(polygon, x, y)).toBe(true);
    }
    // A pouch clear of the walls is the plain cushion: eight cubics.
    const free = fitPillow([{ section: "center", subSection: "middle", slot: 1, itemId: 1, row: 0 }], { size: "M", dims });
    const [d] = [...renderToStaticMarkup(<CrossSectionSvg fit={free} cut={DEFAULT_CUT} itemSubtypes={new Map()} />).matchAll(/data-slab-status="[a-z]+"[^>]*><path d="([^"]+)"/g)].map((x) => x[1]);
    expect(d.match(/C/g)).toHaveLength(8);
    // Flat colour as in the top view: no sheen, no shade, no shadow.
    expect(m).not.toContain("data-slab-gloss");
    expect(m).not.toContain("Gradient");
    expect(m).not.toContain("<filter");
    expect(m.match(/>6D S</g)).toHaveLength(2);
    expect(m.match(/data-xray-column-divider/g)).toHaveLength(2);
  });

  it("an editor makes every pouch a focusable handle and draws a held pouch where it will land", () => {
    const editor = {
      svgRef: { current: null },
      held: { attachGhost: () => {}, attachBadge: () => {}, place: () => {} },
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
            badge: "0–110 mm",
            badgeFont: 13,
          },
        }}
      />,
    );
    expect(held).toContain('data-slab-mode="landing"');
    expect(held).toContain("data-xray-slab-ghost");
    // The shared hold (held-pouch.tsx): the badge rides over the ghost.
    expect(held).toContain("data-xray-drag-badge");
    expect(held).toContain("0–110 mm");
    expect(held).toContain('data-xray-drop-column="ok"');
    expect(held).not.toContain("data-slab-selected");
  });
});
