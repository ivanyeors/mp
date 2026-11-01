"use client";

/**
 * Cross-section view (X-ray pillow UX slice 05, ADR 0019): a live cut of the
 * pillow beside every x-ray: front, middle, back of one Section inside the
 * designer's side profile, drawn at its own proportions on every screen. Pure
 * SVG from the fit the host already computed — one pouch per piece at its
 * compressed thickness, coloured by family through the same CSS variables the
 * pouches use, hatched when compressed; a stack that cannot close pokes out of
 * the case (never red: Ivan, 1-11-2026); a Neck support is a round roll. A pouch draws as a stuffed
 * cushion (`slab-shape.ts`): its free top domes, a pressed face flattens, it
 * sags where nothing holds it up, it is pressed into the case where it meets
 * the outline, and it glides to its new place when the mix changes.
 *
 * On a Staff surface the cut is also an editor: drag a pouch to another
 * column (sub-section), between Layers (a new one), onto a Layer (side by
 * side) or onto a Section tab — held there, the tab opens that Section. While
 * it is held the cut previews the drop through the same pure move the commit
 * uses (`slab-drag.ts`), so what it shows is what lands. Keys: ← → front /
 * back, ↑ ↓ one Layer, Shift + ← → the neighbouring Section. Hover or select
 * a pouch to read why it is as thick as it draws, from its Settings row.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref, type RefObject } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import type { FillingItem } from "@/components/configurator/staff-assist-panel";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import { cellLayers, type MoveResult, type PieceRef } from "@/lib/configurator/staff-assist";
import { applySlabDrop, cellBands, describeSlabTarget, previewSlabDrop, slabTargetAt, slabTargetKey, stepSlabLayer, type SlabDropTarget } from "@/lib/dnd/slab-drag";
import { xrayColorVarStyle, type ColorOverrideRow } from "@/lib/spatial-fillings/color-overrides";
import { SECTIONS, SUB_SECTIONS, type PillowPlacement, type Section, type SubSection } from "@/lib/spatial-fillings/core";
import type { ResolvedDims } from "@/lib/spatial-fillings/dimensions";
import {
  alongSlabs,
  crossSectionSlabs,
  cutLabel,
  slabThicknessNote,
  type AlongSlab,
  type CrossSectionColumn,
  type Cut,
} from "@/lib/spatial-fillings/cross-section";
import type { BolsterFit, FitStatus, PillowFit } from "@/lib/spatial-fillings/fit";
import { fillingLabel, pieceLabelLines } from "@/lib/spatial-fillings/filling-groups";
import { SOFT_BODY_DEFAULTS, type SoftBodySettings } from "@/lib/spatial-fillings/soft-body-settings";
import { fillingVisual } from "@/lib/spatial-fillings/visuals";
import { cn } from "@/lib/utils";
import { pouchPath, puffOf, puffyPath, rollPath, shellPolygon, smoothClosedPath, type PouchShaping, type ShellPolygon, type ShellTransform, type SlabBox } from "./slab-shape";
import { useSoftCut, type SoftCutInput } from "./soft-cut";
import { XRAY_INTERIOR_VAR, XRAY_SHELL_VAR, XRAY_THEME } from "./xray-theme";

export const CROSS_SECTION_VIEW = { width: 664, height: 220 } as const;

/**
 * Text and spacing for the two layouts. The drawing scales to its container,
 * so at a phone's ~330 px the 664-unit view halves every label (slice 10's
 * 360 px check). Phones draw a narrower view with larger type instead, ~10–13
 * px on screen, and the Mbolster puts its status on a line of its own so it
 * fits a narrow column. The pillow itself is never squashed to fit either one:
 * its outline keeps the designer's proportions (`cutFrame`), so a phone shows
 * the same shape smaller.
 *
 * The pillow cut names its columns (front, middle, back) and nothing else: no
 * loft budget, no mm, no status word (Ivan, 1-11-2026). The pouches carry the
 * fit — hatched when squeezed or when they cannot close, never red — and the
 * Section tab's amber dot marks a Section that does not fit.
 */
type CutLayout = {
  width: number;
  /** The Mbolster's end-on view height; the pillow cut's height follows its outline. */
  height: number;
  /** The tallest the outline draws, view units: a tall profile draws narrower instead of taller. */
  maxShellH: number;
  /** The Mbolster's room above and below its circle. */
  padTop: number;
  padBottom: number;
  /** The pillow cut's room above its outline, and below it for the column names. */
  cutPadTop: number;
  cutPadBottom: number;
  /** The Mbolster's "Ø … mm". */
  maxFont: number;
  labelFont: number;
  valueFont: number;
  labelDy: number;
  valueDy: number;
  /** The Mbolster's status ("compressed" / "cannot fit") on its own line, at this offset; inline when null. */
  statusDy: number | null;
  /** A pouch's own label: the largest it draws, and the smallest worth drawing (else it is left off). */
  pieceFont: number;
  minPieceFont: number;
};
const LAYOUT: CutLayout = { ...CROSS_SECTION_VIEW, maxShellH: 200, padTop: 22, padBottom: 30, cutPadTop: 8, cutPadBottom: 18, maxFont: 9, labelFont: 11, valueFont: 10, labelDy: 13, valueDy: 25, statusDy: null, pieceFont: 10, minPieceFont: 7 };
const COMPACT_LAYOUT: CutLayout = { width: 380, height: 250, maxShellH: 170, padTop: 26, padBottom: 54, cutPadTop: 10, cutPadBottom: 24, maxFont: 12, labelFont: 15, valueFont: 14, labelDy: 17, valueDy: 33, statusDy: 49, pieceFont: 13, minPieceFont: 9 };

const PAD_X = 8;
/** How far inside the outline every pouch stays, view units: the case's own cloth, so a pouch reads as inside it. */
const SHELL_MARGIN = 3;
/** The inside floor, view units above the outline's bottom edge: the margin plus a hair, so a resting pouch is not pressed up. */
const FLOOR = SHELL_MARGIN + 1;
/** The inset at each end of a piece, so two pouches that meet still read as two. */
const SLAB_GAP = 2;
/** A drop that would not close, or is refused: amber, as everything that does not fit — nothing turns red (Ivan, 1-11-2026). */
const AMBER = "#f59e0b";
const DROP = "#38bdf8";
/** How long a held pouch rests on a Section tab before the cut opens that Section. */
const SPRING_MS = 450;
const DRAG_THRESHOLD_PX = 6;
const TWEEN_MS = 220;

/** The cut state hook lives with the other host hooks so a page can lazy-load this component and still hold the state. */
export { useCut } from "./use-pillow-fit";

const r1 = (n: number) => Math.round(n * 10) / 10;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpBox = (a: SlabBox, b: SlabBox, t: number): SlabBox => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) });
const sameBox = (a: SlabBox, b: SlabBox) =>
  Math.abs(a.x - b.x) < 0.05 && Math.abs(a.y - b.y) < 0.05 && Math.abs(a.w - b.w) < 0.05 && Math.abs(a.h - b.h) < 0.05;
const prefersReducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** `section/subSection/slot` → the piece it names. */
function refOf(key: string): PieceRef {
  const [section, subSection, slot] = key.split("/");
  return { section: section as Section, subSection: subSection as SubSection, slot: Number(slot) };
}
const keyOf = (ref: PieceRef) => `${ref.section}/${ref.subSection}/${ref.slot}`;

/** "compressed" / "cannot close" after a separator, or nothing when the column fits: the drag readout's. */
const statusSuffix = (status: string, sep: string) =>
  status === "compressed" ? `${sep}compressed` : status === "over" ? `${sep}cannot close` : "";

/**
 * The designer's front → back side profiles, in their own SVG units: `flatY`
 * is the edge on the bed, `peakY` the tallest point. Sides are one shape for
 * every Size; the centre has its own XS profile.
 */
type Profile = { key: string; d: string; minX: number; maxX: number; flatY: number; peakY: number };
const PROFILES = {
  sides: {
    key: "sides",
    d: "M94.4775 0.5C140.826 0.5 165.667 4.24664 176.965 6.7002C181.766 7.74296 185.26 11.5247 186.301 16.3623C187.803 23.3458 189.657 33.539 189.657 41.2617C189.657 47.5783 188.416 55.5526 187.14 62.0762C185.793 68.9617 179.636 73.709 172.586 73.709H17.125C9.74053 73.709 3.38599 68.5056 2.31445 61.2285C1.37696 54.8608 0.500008 47.2884 0.5 41.2617C0.499996 34.1165 1.73302 24.8029 2.83594 17.9043C3.74251 12.2343 7.90689 7.76851 13.5283 6.69629C26.41 4.2393 52.8524 0.500025 94.4775 0.5Z",
    minX: 0.5,
    maxX: 189.657,
    flatY: 73.709,
    peakY: 0.5,
  },
  center: {
    key: "center",
    d: "M161.199 0.5L11.8047 0.500043C1.61909 0.500043 -2.78475 11.5218 3.22472 19.9799C19.9623 43.5375 50.8086 59.5316 76.3467 59.5316C93.1431 59.5316 110.98 45.4414 134.837 43.0554C152.323 41.3066 178.911 36.8768 178.911 18.7529C178.911 6.22563 171.085 0.5 161.199 0.5Z",
    minX: 0.5,
    maxX: 178.911,
    flatY: 0.5,
    peakY: 59.53,
  },
  centerXs: {
    key: "center-xs",
    d: "M166.034 0.5L4.14085 0.500029C-2.69623 0.500029 1.41211 8.71423 5.75493 12.4702C24.8871 30.4286 56.9305 41.9314 81.2856 39.9146C97.954 38.5343 123.168 29.7469 138.053 28.7541C155.538 27.5879 176.174 22.9134 176.174 12.4702C176.174 4.1157 171.347 0.5 166.034 0.5Z",
    minX: 0.5,
    maxX: 176.174,
    flatY: 0.5,
    peakY: 40.3,
  },
} as const satisfies Record<string, Profile>;

function profileFor(size: PillowFit["size"], section: Section): Profile {
  if (section !== "center") return PROFILES.sides;
  return size === "XS" ? PROFILES.centerXs : PROFILES.center;
}

/** The designer's width ÷ height: the cut always draws a profile at it. */
const aspectOf = (p: Profile) => (p.maxX - p.minX) / Math.abs(p.flatY - p.peakY);

/** Fits a profile to x0…x0 + w on the baseline, flat edge down, at its own proportions. */
function profileTransform(p: Profile, x0: number, w: number, baseline: number): ShellTransform {
  const k = w / (p.maxX - p.minX);
  const dir = p.peakY < p.flatY ? 1 : -1;
  return { tx: x0 - p.minX * k, ty: baseline - dir * p.flatY * k, sx: k, sy: dir * k };
}

const transformAttr = (t: ShellTransform) => `translate(${r1(t.tx)} ${r1(t.ty)}) scale(${t.sx.toFixed(4)} ${t.sy.toFixed(4)})`;

/** The case every pouch is pressed into, in view units: once per outline and frame, not per pouch or per frame of a tween. */
const casePolygons = new Map<string, ShellPolygon>();
function casePolygon(p: Profile, t: ShellTransform): ShellPolygon {
  const key = `${p.key}|${t.tx}|${t.ty}|${t.sx}|${t.sy}`;
  let poly = casePolygons.get(key);
  if (!poly) {
    if (casePolygons.size > 32) casePolygons.clear();
    poly = shellPolygon(p.d, t);
    casePolygons.set(key, poly);
  }
  return poly;
}

// --- Frame: mm ↔ view units ---------------------------------------------------

/** The tallest stack the cut must make room for, mm: the loft line, or an over stack through it. */
function tallestMm(columns: readonly CrossSectionColumn[]): number {
  return Math.max(1, ...columns.map((c) => Math.max(c.maxLoftMm, c.loftMm)));
}

type Frame = {
  L: CutLayout;
  profile: Profile;
  /** Where the outline starts and how wide it draws, view units. */
  x0: number;
  drawW: number;
  shellH: number;
  /** The outline's flat edge, and the inside floor the pouches rest on. */
  baseline: number;
  floor: number;
  ky: number;
  kx: number;
  colW: number;
  /** The view's height: the outline, or an over stack taller than it. */
  height: number;
};

/**
 * mm ↔ view units for one cut. The outline is drawn at the designer's own
 * proportions on every screen — never squashed to fit a phone — as wide as
 * the view allows (narrower when that would make it taller than
 * `maxShellH`). Across, the Section's length fills it; up, its peak inside
 * the case is the side Sections' max loft, as the profile was drawn.
 */
function cutFrame(compact: boolean, profile: Profile, profileMm: number, tallest: number, cellLengthMm: number): Frame {
  const L = compact ? COMPACT_LAYOUT : LAYOUT;
  const aspect = aspectOf(profile);
  const drawW = Math.min(L.width - 2 * PAD_X, L.maxShellH * aspect);
  const shellH = drawW / aspect;
  const x0 = (L.width - drawW) / 2;
  const ky = Math.max(shellH - FLOOR - SHELL_MARGIN, 1) / Math.max(profileMm, 1);
  const kx = drawW / (cellLengthMm * SUB_SECTIONS.length || 1);
  const content = Math.max(shellH, FLOOR + tallest * ky + 4);
  const baseline = L.cutPadTop + content;
  return { L, profile, x0, drawW, shellH, baseline, floor: baseline - FLOOR, ky, kx, colW: cellLengthMm * kx, height: baseline + L.cutPadBottom };
}

/** The frame a cut of this fit draws in; `tallest` pins the view's height (a drag holds the committed one). */
function frameFor(fit: PillowFit, cut: Cut, compact: boolean, tallest: number): Frame {
  // The profile peaks at full gusset height inside the case: the side Sections' max loft.
  return cutFrame(compact, profileFor(fit.size, cut.section), fit.sections.left.maxLoftMm, tallest, fit.settle.cellLengthMm);
}

/** A piece's box in the cut: its settled span across, its thickness up, resting on what lies under it. */
function slabBox(slab: AlongSlab, f: Frame): SlabBox {
  const h = Math.max(slab.heightMm * f.ky - 2, 1);
  return {
    x: f.x0 + slab.startMm * f.kx + SLAB_GAP,
    y: f.floor - slab.bottomMm * f.ky - h - 1,
    w: Math.max((slab.endMm - slab.startMm) * f.kx - 2 * SLAB_GAP, 1),
    h,
  };
}

/** The label's size inside a box, or 0 when it would not fit at a readable size. */
function pieceFontFor(label: string, box: SlabBox, L: CutLayout): number {
  if (!label) return 0;
  const size = Math.min(L.pieceFont, (box.w - 10) / (label.length * 0.62), box.h * 0.75);
  return size >= L.minPieceFont ? r1(size) : 0;
}

// --- The soft cut (ADR 0025) ---------------------------------------------------

function softInputOf(fit: PillowFit, cut: Cut, f: Frame, polygon: ShellPolygon, itemSubtypes: ReadonlyMap<number, string | null>, settings: SoftBodySettings): SoftCutInput {
  return {
    fit,
    section: cut.section,
    // Lengths and speeds scale with the outline: the solver was tuned on the desktop cut.
    frame: { ...f, width: f.L.width, slabGap: SLAB_GAP, scale: f.drawW / Math.min(LAYOUT.width - 2 * PAD_X, LAYOUT.maxShellH * aspectOf(f.profile)) },
    casePolygon: polygon as SoftCutInput["casePolygon"],
    isRoll: (itemId) => fillingVisual(itemSubtypes.get(itemId) ?? null).shape === "pill",
    settings,
  };
}

/** The soft cut's input for a cut of this fit, in the frame and case the drawing uses (tests and tools settle it directly). */
export function softCutInputFor(
  fit: PillowFit,
  cut: Cut,
  { compact = false, scaleMm, itemSubtypes, settings = SOFT_BODY_DEFAULTS }: { compact?: boolean; scaleMm?: number; itemSubtypes: ReadonlyMap<number, string | null>; settings?: SoftBodySettings },
): SoftCutInput {
  const f = frameFor(fit, cut, compact, scaleMm ?? tallestMm(crossSectionSlabs(fit, cut)));
  return softInputOf(fit, cut, f, casePolygon(f.profile, profileTransform(f.profile, f.x0, f.drawW, f.baseline)), itemSubtypes, settings);
}

// --- One pouch ----------------------------------------------------------------

/** A pouch's handle props, with the data attributes the hit-test and focus read. */
type SlabHitProps = React.SVGProps<SVGGElement> & { [attr: `data-${string}`]: string };

/** solid: committed · lifted: picked up, its place still shown · landing: where a held pouch will land. */
type SlabMode = "solid" | "lifted" | "landing";

type SvgIds = { hatch: string; shade: string; rollShade: string };

function slabOutline(box: SlabBox, roll: boolean, puff: number, shaping?: PouchShaping): string {
  return roll ? rollPath(box) : pouchPath(box, puff, shaping);
}

/**
 * One filling, side-on: a cushion in its family colour, shaded for volume,
 * hatched when compressed or when it cannot close;
 * pressed into the case and sagging where nothing holds it up (`shaping`).
 * When its box changes it eases there (attribute writes in rAF,
 * interruptible) instead of jumping, unless the viewer asked for reduced
 * motion.
 */
function PuffySlab({
  box,
  roll,
  puff,
  subtype,
  shaping,
  status,
  hatched,
  mode,
  selected,
  hovered = false,
  label,
  font,
  ids,
  pieceKey,
  hit,
  outline,
  labelAt,
  still = false,
}: {
  box: SlabBox;
  roll: boolean;
  puff: number;
  /** What presses on it, its sag and the case it is pressed into. */
  shaping?: PouchShaping;
  subtype: string | null;
  status: FitStatus;
  hatched: boolean;
  mode: SlabMode;
  selected: boolean;
  /** Under the pointer, ready to pick up: a brighter rim. */
  hovered?: boolean;
  label: string;
  font: number;
  ids: SvgIds;
  pieceKey: string;
  /** Editing: what makes the pouch a handle (pointer, keys, focus). */
  hit?: SlabHitProps;
  /** The soft cut's outline for it (ADR 0025): drawn as is, in place of the slab and its tween. */
  outline?: string;
  /** Where its label sits on the soft outline. */
  labelAt?: { x: number; y: number };
  /** Never tween: the soft cut animates by settling, and a tween's attribute writes would outlive its outline. */
  still?: boolean;
}) {
  const visual = fillingVisual(subtype);
  const body = outline ?? slabOutline(box, roll, puff, shaping);
  // The label rides the sag at the pouch's middle, so it stays on the fill.
  const mid = (a?: readonly number[]) => (a && a.length ? a[Math.floor(a.length / 2)] : 0);
  const labelDy = roll ? 0 : (mid(shaping?.sag) + mid(shaping?.sagTop ?? shaping?.sag)) / 2;
  // The tween writes the outline to every body-shaped path and the label, so they move together.
  const groupEl = useRef<SVGGElement | null>(null);
  const shown = useRef(box);

  useLayoutEffect(() => {
    const from = shown.current;
    const to = box;
    const group = groupEl.current;
    if (!group || still || outline || sameBox(from, to) || prefersReducedMotion()) {
      shown.current = to;
      return;
    }
    const paint = (b: SlabBox) => {
      shown.current = b;
      const d = slabOutline(b, roll, puff, shaping);
      group.querySelectorAll("[data-slab-body]").forEach((el) => el.setAttribute("d", d));
      const text = group.querySelector("text");
      text?.setAttribute("x", String(r1(b.x + b.w / 2)));
      text?.setAttribute("y", String(r1(b.y + b.h / 2 + labelDy)));
    };
    paint(from);
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - t0) / TWEEN_MS, 1);
      paint(t < 1 ? lerpBox(from, to, easeOutCubic(t)) : to);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [box, roll, puff, shaping, labelDy, outline, still]);

  const fill = `var(${visual.cssVar}, ${visual.defaultColor})`;
  return (
    <g
      data-item-subtype={subtype ?? ""}
      data-slab-status={status}
      data-piece={pieceKey}
      data-slab-mode={mode === "solid" ? undefined : mode}
      opacity={mode === "lifted" ? 0.28 : 1}
      {...hit}
      ref={groupEl}
    >
      <path
        d={body}
        data-slab-body=""
        fill={fill}
        fillOpacity={mode === "landing" ? 0.5 : hovered ? 1 : 0.92}
        stroke={hovered ? "white" : "rgba(255,255,255,0.9)"}
        strokeWidth={mode === "landing" || hovered ? 2.2 : 1.5}
        strokeDasharray={mode === "landing" ? "5 3" : undefined}
        vectorEffect="non-scaling-stroke"
      />
      <path d={body} data-slab-body="" fill={`url(#${roll ? ids.rollShade : ids.shade})`} pointerEvents="none" />
      {hatched && <path d={body} data-slab-body="" fill={`url(#${ids.hatch})`} pointerEvents="none" />}
      {selected && (
        <path
          d={body}
          data-slab-body=""
          fill="none"
          stroke="white"
          strokeWidth={3}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
          data-slab-selected
        />
      )}
      {font > 0 && (
        <text
          x={r1(labelAt ? labelAt.x : box.x + box.w / 2)}
          y={r1(labelAt ? labelAt.y : box.y + box.h / 2 + labelDy)}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={font}
          fontWeight={600}
          fill="white"
          stroke="rgba(2,6,23,0.75)"
          strokeWidth={font * 0.22}
          strokeLinejoin="round"
          paintOrder="stroke"
          className="select-none"
          pointerEvents="none"
        >
          {label}
        </text>
      )}
    </g>
  );
}

// --- The cut ------------------------------------------------------------------

/** What the editor hands the drawing while it edits; absent on a read-only cut. */
export type CutEditorView = {
  svgRef: Ref<SVGSVGElement>;
  ghostRef: RefObject<SVGGElement | null>;
  svgHandlers: React.SVGProps<SVGSVGElement>;
  /** The handle props for one pouch. */
  slabHit: (slab: AlongSlab, label: string) => SlabHitProps;
  selectedKey: string | null;
  hoveredKey: string | null;
  /** Mid-drag: the held piece, the key it lands as in the drawn fit, and the column the drop names. */
  drag: {
    sourceKey: string;
    landingKey: string | null;
    column: SubSection | null;
    tone: "ok" | "compressed" | "over" | "refused";
    ghost: { w: number; h: number; roll: boolean; puff: number; subtype: string | null; label: string; at: { x: number; y: number } };
    /** Over a Section tab: the ghost shrinks and fades so the tab it is about to open still reads. */
    overTab: boolean;
  } | null;
};

export function CrossSectionSvg({
  fit,
  cut,
  itemSubtypes,
  itemSizes,
  compact = false,
  scaleMm,
  editor,
  softBody = SOFT_BODY_DEFAULTS,
  softReplay = 0,
}: {
  fit: PillowFit;
  cut: Cut;
  itemSubtypes: ReadonlyMap<number, string | null>;
  /** item id → Item size, written on the pouch beside its type; absent ids show the type alone. */
  itemSizes?: ReadonlyMap<number, string | null>;
  /** Phones: the narrower view with larger type (`COMPACT_LAYOUT`). */
  compact?: boolean;
  /** Pins the view's height (the tallest stack it makes room for, mm): a drag holds the committed one so a preview never resizes the cut under the pointer. */
  scaleMm?: number;
  editor?: CutEditorView;
  /** The soft cut's Settings (ADR 0025); `enabled: false` draws the rounded slabs. */
  softBody?: SoftBodySettings;
  /** Bump to settle again from the start, even a recipe already settled (the Settings preview's Replay). */
  softReplay?: number;
}) {
  const uid = useId();
  const columns = crossSectionSlabs(fit, cut);
  const f = frameFor(fit, cut, compact, scaleMm ?? tallestMm(columns));
  const { L, ky, profile } = f;
  const { width } = L;
  const height = f.height;
  const ids: SvgIds = { hatch: `${uid}-hatch`, shade: `${uid}-shade`, rollShade: `${uid}-roll` };
  const shellId = `${uid}-shell`;
  const transform = profileTransform(profile, f.x0, f.drawW, f.baseline);
  const shell = transformAttr(transform);
  const polygon = casePolygon(profile, transform);
  const drag = editor?.drag ?? null;
  // The soft cut: every piece settled as a soft body inside the cloth case, from the fit's own spans and Layers.
  // The hook keys the settle by value, so a fresh input each render settles only when something it reads changed.
  const soft = useSoftCut(softBody.enabled ? softInputOf(fit, cut, f, polygon, itemSubtypes, softBody) : null, softBody.animate && !drag, softReplay);
  const clothD = soft ? smoothClosedPath(soft.case) : null;
  const labelOf = (itemId: number) => pieceLabelLines(itemSubtypes.get(itemId) ?? null, itemSizes?.get(itemId) ?? null).join(" ");
  const dropX0 = drag?.column ? f.x0 + SUB_SECTIONS.indexOf(drag.column) * f.colW : null;
  const toneColor = drag?.tone === "over" || drag?.tone === "refused" ? AMBER : DROP;
  const top = f.baseline - f.shellH;
  const slabs = alongSlabs(fit, cut.section).map((slab) => {
    const box = slabBox(slab, f);
    const subtype = itemSubtypes.get(slab.itemId) ?? null;
    const label = labelOf(slab.itemId);
    const landing = drag !== null && slab.key === drag.landingKey;
    const mode: SlabMode = landing ? "landing" : drag && !drag.landingKey && slab.key === drag.sourceKey ? "lifted" : "solid";
    // A stack that cannot close is not pressed into the case: it pokes out of it.
    const over = slab.status === "over";
    const shaping: PouchShaping = {
      contacts: slab.pressed,
      sag: slab.sagMm.map((mm) => mm * ky),
      sagTop: slab.sagTopMm.map((mm) => mm * ky),
      shell: over ? undefined : { polygon, margin: SHELL_MARGIN },
    };
    // A held pouch keeps its identity while it previews elsewhere, so it glides there.
    const key = landing ? drag!.sourceKey : slab.key;
    const ring = soft?.rings.get(slab.key);
    const spot = ring ? soft!.labels.get(slab.key) : undefined;
    const font = spot ? pieceFontFor(label, { x: 0, y: 0, w: spot.r * 2.6, h: spot.r * 2 }, L) : pieceFontFor(label, box, L);
    const el = (
      <PuffySlab
        key={key}
        box={box}
        roll={fillingVisual(subtype).shape === "pill"}
        puff={puffOf(slab.heightMm, slab.relaxedMm)}
        shaping={shaping}
        subtype={subtype}
        status={slab.status}
        hatched={slab.hatched}
        mode={mode}
        selected={!drag && editor?.selectedKey === slab.key}
        hovered={!drag && editor?.hoveredKey === slab.key}
        label={label}
        font={font}
        ids={ids}
        pieceKey={slab.key}
        hit={editor?.slabHit(slab, label)}
        outline={ring ? smoothClosedPath(ring) : undefined}
        labelAt={spot ? { x: spot.at[0], y: spot.at[1] } : undefined}
        still={softBody.enabled}
      />
    );
    return { over, el };
  });
  return (
    <svg
      ref={editor?.svgRef}
      viewBox={`0 0 ${width} ${r1(height)}`}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      className="h-auto w-full"
      style={drag ? { overflow: "visible", touchAction: "none" } : undefined}
      aria-label={`Cross-section ${cutLabel(cut)}`}
      data-xray-cross-section="along"
      data-xray-cut-aspect={aspectOf(profile).toFixed(3)}
      data-xray-soft={soft ? "" : undefined}
      {...editor?.svgHandlers}
    >
      <defs>
        <pattern id={ids.hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0 L0 6" stroke="rgba(255,255,255,0.55)" strokeWidth="2" />
        </pattern>
        {/* The cushion's volume: lit from above, a shade underneath. */}
        <linearGradient id={ids.shade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="white" stopOpacity={0.3} />
          <stop offset="0.35" stopColor="white" stopOpacity={0.06} />
          <stop offset="0.62" stopColor="white" stopOpacity={0} />
          <stop offset="1" stopColor="black" stopOpacity={0.3} />
        </linearGradient>
        <radialGradient id={ids.rollShade} cx="0.36" cy="0.32" r="0.75">
          <stop offset="0" stopColor="white" stopOpacity={0.32} />
          <stop offset="0.45" stopColor="white" stopOpacity={0.04} />
          <stop offset="1" stopColor="black" stopOpacity={0.32} />
        </radialGradient>
        <clipPath id={shellId}>
          {clothD ? <path d={clothD} /> : <path d={profile.d} transform={shell} />}
        </clipPath>
      </defs>
      {clothD ? (
        <>
          {/* The case as sewn, faint: how far the cloth would stand were it full. */}
          <path d={profile.d} transform={shell} fill="none" stroke={XRAY_SHELL_VAR} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" data-xray-sewn-outline />
          <path d={clothD} fill={XRAY_INTERIOR_VAR} data-xray-profile={profile.key} data-xray-cloth />
        </>
      ) : (
        <path d={profile.d} transform={shell} fill={XRAY_INTERIOR_VAR} data-xray-profile={profile.key} />
      )}
      <g clipPath={`url(#${shellId})`}>
        {/* Where one sub-section ends and the next begins — the columns a pouch is dropped into. */}
        {[1, 2].map((i) => (
          <path
            key={i}
            d={`M${r1(f.x0 + i * f.colW)} ${r1(top)} L${r1(f.x0 + i * f.colW)} ${r1(f.baseline)}`}
            stroke={XRAY_SHELL_VAR}
            strokeOpacity={0.22}
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
            data-xray-column-divider
          />
        ))}
        {dropX0 !== null && (
          <path
            d={`M${r1(dropX0)} 0 H${r1(dropX0 + f.colW)} V${r1(f.baseline)} H${r1(dropX0)} Z`}
            fill={toneColor}
            fillOpacity={0.14}
            data-xray-drop-column={drag?.tone}
          />
        )}
        {/* Each piece once, over the length it settles to, resting on what lies under it, inside the case. */}
        {slabs.filter((s) => !s.over).map((s) => s.el)}
      </g>
      {clothD ? (
        <path d={clothD} fill="none" stroke={XRAY_SHELL_VAR} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      ) : (
        <path d={profile.d} transform={shell} fill="none" stroke={XRAY_SHELL_VAR} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      )}
      {/* A stack that cannot close, through the case. */}
      {slabs.filter((s) => s.over).map((s) => s.el)}
      {/* The column names, and nothing else: the pouches carry the fit. */}
      {columns.map((col, i) => {
        const cx = f.x0 + i * f.colW + f.colW / 2;
        return (
          <g key={col.key} data-column={col.key} data-status={col.status}>
            <text x={r1(cx)} y={r1(f.baseline + L.labelDy)} textAnchor="middle" fontSize={L.labelFont} fontWeight={600} fill={drag?.column === col.key ? toneColor : XRAY_SHELL_VAR} className="select-none capitalize">
              {col.label}
            </text>
          </g>
        );
      })}
      {/* The held pouch, under the pointer, over everything (even the tabs above the cut). */}
      {drag && (
        <g ref={editor?.ghostRef} transform={`translate(${r1(drag.ghost.at.x)} ${r1(drag.ghost.at.y)})`} pointerEvents="none" data-xray-slab-ghost>
          <g transform={drag.overTab ? "translate(0 18) scale(0.5)" : "scale(1.04)"} opacity={drag.overTab ? 0.6 : 1}>
            {(() => {
              const g = drag.ghost;
              const box = { x: -g.w / 2, y: -g.h / 2, w: g.w, h: g.h };
              const d = slabOutline(box, g.roll, g.puff);
              const visual = fillingVisual(g.subtype);
              const font = pieceFontFor(g.label, box, L);
              return (
                <>
                  <path d={d} fill={`var(${visual.cssVar}, ${visual.defaultColor})`} fillOpacity={0.82} stroke="white" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                  <path d={d} fill={`url(#${g.roll ? ids.rollShade : ids.shade})`} />
                  {font > 0 && (
                    <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fontSize={font} fontWeight={600} fill="white" stroke="rgba(2,6,23,0.75)" strokeWidth={font * 0.22} strokeLinejoin="round" paintOrder="stroke" className="select-none">
                      {g.label}
                    </text>
                  )}
                </>
              );
            })()}
          </g>
        </g>
      )}
    </svg>
  );
}

// --- Section tabs ---------------------------------------------------------------

const TAB_CLASS = "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] leading-5 capitalize transition-colors max-md:px-3 max-md:py-1 max-md:text-xs";
const TAB_ON = "bg-primary text-primary-foreground";
const TAB_OFF = "bg-background hover:bg-accent";

function CutControls({
  cut,
  onCutChange,
  fit,
  dragging = false,
  springSection = null,
  dropSection = null,
}: {
  cut: Cut;
  onCutChange: (cut: Cut) => void;
  fit: PillowFit;
  /** A pouch is held: every tab is a drop target. */
  dragging?: boolean;
  /** The tab a held pouch is resting on, about to open. */
  springSection?: Section | null;
  /** The tab a release would drop onto. */
  dropSection?: Section | null;
}) {
  return (
    <div className="flex w-fit overflow-hidden rounded border shadow-sm" role="group" aria-label="Section" data-xray-cut-controls>
      {SECTIONS.map((section) => {
        const on = cut.section === section;
        const sf = fit.sections[section];
        const count = sf.pieces.length;
        return (
          <button
            key={section}
            type="button"
            aria-pressed={on}
            data-drop-section={section}
            className={cn(
              TAB_CLASS,
              on ? TAB_ON : TAB_OFF,
              dragging && !on && "ring-1 ring-inset ring-sky-400/50",
              dropSection === section && "ring-2 ring-inset ring-sky-400",
              springSection === section && "animate-pulse bg-sky-500/30",
            )}
            onClick={() => onCutChange({ section })}
          >
            {section}
            {count > 0 && <span className="tabular-nums opacity-70">{count}</span>}
            {sf.status !== "ok" && (
              <span
                className="inline-block size-1.5 rounded-full bg-amber-400"
                aria-label={sf.status === "over" ? "cannot close" : "compressed"}
                role="img"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

// --- The editor around the cut --------------------------------------------------

type SlabHold = {
  source: PieceRef & { itemId: number };
  key: string;
  pointerId: number;
  startX: number;
  startY: number;
  ghost: { w: number; h: number; roll: boolean; puff: number; subtype: string | null; label: string };
  /** Where the pointer picked it up, view units: the ghost's first frame (each move after writes its transform directly). */
  at: { x: number; y: number };
  active: boolean;
  target: SlabDropTarget | null;
};

export function XrayCrossSection({
  fit,
  cut,
  onCutChange,
  itemSubtypes,
  itemSizes,
  itemDims,
  placements,
  onPlacementsChange,
  items,
  colorOverrides = [],
  softBody = SOFT_BODY_DEFAULTS,
  themed = true,
  collapsible = true,
  className,
}: {
  fit: PillowFit;
  cut: Cut;
  /** Omit for the read-only variant (the shopper preview): no toggle, no tabs. */
  onCutChange?: (cut: Cut) => void;
  itemSubtypes: ReadonlyMap<number, string | null>;
  /** item id → Item size, for the label on each pouch. */
  itemSizes?: ReadonlyMap<number, string | null>;
  /** item id → registry dimensions (the Settings rows applied): the drop preview's fit and the thickness readout read them. */
  itemDims?: ReadonlyMap<number, ResolvedDims>;
  /** The same lifted Placements the x-ray edits; with `onPlacementsChange` (and the tabs) the cut is an editor. */
  placements?: PillowPlacement[];
  onPlacementsChange?: (next: PillowPlacement[]) => void;
  /** Inventory Items, for the pouch names in toasts and the readout. */
  items?: FillingItem[];
  /** Product Builder colour overrides, applied as the same CSS variables the pouches use. */
  colorOverrides?: ColorOverrideRow[];
  /** The soft cut's Settings (ADR 0025): pieces settle as soft bodies in a cloth case; off draws rounded slabs. */
  softBody?: SoftBodySettings;
  /** Admin pages theme the shell for light/dark; the configurator's dark stage keeps the defaults. */
  themed?: boolean;
  /** Phones collapse it under a "Cross-section" disclosure, closed by default. */
  collapsible?: boolean;
  className?: string;
}) {
  const isMobile = useIsMobile();
  const editable = Boolean(placements && onPlacementsChange && onCutChange);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const ghostRef = useRef<SVGGElement | null>(null);
  const holdRef = useRef<SlabHold | null>(null);
  const placementsRef = useRef(placements);
  const pendingFocus = useRef<string | null>(null);
  const spring = useRef<{ section: Section; timer: number } | null>(null);
  const [held, setHeld] = useState<SlabHold | null>(null);
  const [dropTarget, setDropTarget] = useState<SlabDropTarget | null>(null);
  const [springSection, setSpringSection] = useState<Section | null>(null);
  const [overTab, setOverTab] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  useEffect(() => {
    placementsRef.current = placements;
  }, [placements]);

  // The committed cut: what hit-testing reads, so the zones never move while a preview reflows.
  const columns = useMemo(() => crossSectionSlabs(fit, cut), [fit, cut]);
  const slabs = useMemo(() => alongSlabs(fit, cut.section), [fit, cut.section]);
  const tallest = tallestMm(columns);
  const frame = frameFor(fit, cut, isMobile, tallest);

  const labelOf = useCallback(
    (itemId: number) => {
      const item = items?.find((i) => i.id === itemId);
      if (item) return fillingLabel(item);
      return pieceLabelLines(itemSubtypes.get(itemId) ?? null, itemSizes?.get(itemId) ?? null).join(" ") || `Item #${itemId}`;
    },
    [items, itemSubtypes, itemSizes],
  );

  // The drop, applied and fitted through the same pure move the commit uses — once per target, not per pointer move.
  const heldSource = held?.source ?? null;
  const preview = useMemo(() => {
    if (!heldSource || !dropTarget || !placements) return null;
    return previewSlabDrop(placements, heldSource, dropTarget, { size: fit.size, dims: itemDims, loftAllowance: fit.loftAllowance });
  }, [heldSource, dropTarget, placements, itemDims, fit.size, fit.loftAllowance]);

  const disarmSpring = useCallback(() => {
    if (spring.current) window.clearTimeout(spring.current.timer);
    spring.current = null;
    setSpringSection(null);
  }, []);

  const endHold = useCallback(() => {
    holdRef.current = null;
    disarmSpring();
    setHeld(null);
    setDropTarget(null);
    setOverTab(false);
  }, [disarmSpring]);

  // Escape lets go of a held pouch where it was. Capture phase, ahead of the x-ray's dive handler.
  useEffect(() => {
    if (!held) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      endHold();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [held, endHold]);

  useEffect(() => () => disarmSpring(), [disarmSpring]);

  // `touch-action: none` does not reach SVG shapes in Chromium: a finger on a
  // pouch would pan the page and cancel the drag. A non-passive touchstart on
  // the pouch handles only keeps the page scrollable from anywhere else. A
  // callback ref, because on a phone the cut mounts later, when its disclosure opens.
  const attachSvg = useCallback((el: SVGSVGElement | null) => {
    svgRef.current = el;
    if (!el) return;
    const onTouchStart = (e: TouchEvent) => {
      if (e.target instanceof Element && e.target.closest("[data-slab-hit]")) e.preventDefault();
    };
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      svgRef.current = null;
    };
  }, []);

  // After a move the selection follows the pouch to its new key (and Section).
  useEffect(() => {
    const key = pendingFocus.current;
    if (!key) return;
    pendingFocus.current = null;
    svgRef.current?.querySelector<SVGGElement>(`[data-slab-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
  }, [placements, cut.section]);

  const toView = (clientX: number, clientY: number) => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const inv = m.inverse();
    return { x: inv.a * clientX + inv.c * clientY + inv.e, y: inv.b * clientX + inv.d * clientY + inv.f };
  };

  /** Rest on a tab long enough and the cut opens that Section, so the drop can be placed there exactly. */
  const armSpring = (section: Section) => {
    if (section === cut.section) {
      disarmSpring();
      return;
    }
    if (spring.current?.section === section) return;
    disarmSpring();
    setSpringSection(section);
    spring.current = {
      section,
      timer: window.setTimeout(() => {
        spring.current = null;
        setSpringSection(null);
        onCutChange?.({ section });
      }, SPRING_MS),
    };
  };

  /** What the pointer is over: a Section tab, a column and height of the cut, or nothing. */
  const targetAt = (hold: SlabHold, clientX: number, clientY: number): SlabDropTarget | null => {
    const tab = document.elementFromPoint(clientX, clientY)?.closest?.("[data-drop-section]");
    setOverTab(Boolean(tab));
    if (tab) {
      const section = tab.getAttribute("data-drop-section") as Section;
      armSpring(section);
      return section === hold.source.section ? null : { kind: "cell", section, subSection: hold.source.subSection };
    }
    disarmSpring();
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || clientX < box.left || clientX > box.right || clientY < box.top || clientY > box.bottom) return null;
    const v = toView(clientX, clientY);
    const col = Math.min(Math.max(Math.floor((v.x - frame.x0) / frame.colW), 0), SUB_SECTIONS.length - 1);
    const cell = { section: cut.section, subSection: SUB_SECTIONS[col] };
    return slabTargetAt(cell, cellBands(slabs, cell), (frame.floor - v.y) / frame.ky);
  };

  /**
   * Write a move: the selection follows the pouch, the cut follows it to
   * another Section, and Undo is the x-ray's — an inverse applied only while
   * the move is still the last thing that happened (one toast id for both views).
   */
  const commit = (before: PillowPlacement[], r: Extract<MoveResult, { ok: true }>, source: PieceRef & { itemId: number }) => {
    if (!onPlacementsChange) return;
    onPlacementsChange(r.placements);
    const nextKey = keyOf(r.ref);
    setSelectedKey(nextKey);
    pendingFocus.current = nextKey;
    if (r.ref.section !== cut.section) onCutChange?.({ section: r.ref.section });
    const layer = cellLayers(r.placements, r.ref).findIndex((l) => l.some((p) => p.slot === r.ref.slot));
    toast.success(`Moved ${labelOf(source.itemId)} to ${r.ref.section} ${r.ref.subSection}, layer ${layer + 1}`, {
      id: "xray-move",
      action: {
        label: "Undo",
        onClick: () => {
          if (placementsRef.current !== r.placements) {
            toast.error("Undo unavailable — the mix changed after the move");
            return;
          }
          onPlacementsChange(before);
          setSelectedKey(keyOf(source));
          if (source.section !== r.ref.section) onCutChange?.({ section: source.section });
        },
      },
    });
  };

  const slabHit = (slab: AlongSlab, label: string): SlabHitProps => {
    const ref = refOf(slab.key);
    const source = { ...ref, itemId: slab.itemId };
    const where = `${ref.section} ${ref.subSection}, layer ${slab.depth + 1}`;
    return {
      tabIndex: 0,
      role: "button",
      "aria-label": `${label || labelOf(slab.itemId)}, ${where}. Drag, or use arrow keys to move.`,
      "data-slab-hit": "",
      "data-slab-key": slab.key,
      style: { cursor: "grab", outline: "none", touchAction: "none" },
      onPointerEnter: () => setHoverKey(slab.key),
      onPointerLeave: () => setHoverKey((k) => (k === slab.key ? null : k)),
      onFocus: () => setSelectedKey(slab.key),
      onBlur: () => setSelectedKey((k) => (k === slab.key && !pendingFocus.current ? null : k)),
      onPointerDown: (e) => {
        if (!editable || e.button !== 0) return;
        svgRef.current?.setPointerCapture(e.pointerId);
        const box = slabBox(slab, frame);
        const subtype = itemSubtypes.get(slab.itemId) ?? null;
        holdRef.current = {
          source,
          key: slab.key,
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          // Held, it is a cushion about one column wide, centred on the pointer — where it points is where it goes.
          ghost: {
            w: Math.min(box.w, frame.colW * 0.86),
            h: Math.max(box.h, 10),
            roll: fillingVisual(subtype).shape === "pill",
            puff: 1,
            subtype,
            label,
          },
          at: { x: 0, y: 0 },
          active: false,
          target: null,
        };
      },
      onKeyDown: (e) => {
        if (!placements || e.altKey || e.ctrlKey || e.metaKey) return;
        let r: MoveResult | null = null;
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          const dir = e.key === "ArrowLeft" ? -1 : 1;
          if (e.shiftKey) {
            const a = SECTIONS.indexOf(ref.section) + dir;
            if (a >= 0 && a < SECTIONS.length) r = applySlabDrop(placements, ref, { kind: "cell", section: SECTIONS[a], subSection: ref.subSection });
          } else {
            const b = SUB_SECTIONS.indexOf(ref.subSection) + dir;
            if (b >= 0 && b < SUB_SECTIONS.length) r = applySlabDrop(placements, ref, { kind: "cell", section: ref.section, subSection: SUB_SECTIONS[b] });
          }
        } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !e.shiftKey) {
          r = stepSlabLayer(placements, ref, e.key === "ArrowUp" ? -1 : 1);
        } else if (e.key === "Escape") {
          (e.currentTarget as SVGGElement).blur();
          e.stopPropagation();
          return;
        } else return;
        // The cut owns its arrows: not the page's scroll, not the x-ray's selected pouch.
        e.preventDefault();
        e.stopPropagation();
        if (!r) return;
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        if (r.placements === placements) return;
        commit(placements, r, source);
      },
    };
  };

  const svgHandlers: React.SVGProps<SVGSVGElement> = {
    onPointerMove: (e) => {
      const hold = holdRef.current;
      if (!hold || hold.pointerId !== e.pointerId) return;
      if (!hold.active && Math.hypot(e.clientX - hold.startX, e.clientY - hold.startY) < DRAG_THRESHOLD_PX) return;
      const v = toView(e.clientX, e.clientY);
      ghostRef.current?.setAttribute("transform", `translate(${r1(v.x)} ${r1(v.y)})`);
      const target = targetAt(hold, e.clientX, e.clientY);
      if (!hold.active) {
        hold.active = true;
        hold.target = target;
        hold.at = v;
        setHeld({ ...hold });
        setDropTarget(target);
        setHoverKey(null);
        return;
      }
      if (slabTargetKey(target) !== slabTargetKey(hold.target)) {
        hold.target = target;
        setDropTarget(target);
      }
    },
    onPointerUp: (e) => {
      const hold = holdRef.current;
      if (!hold || hold.pointerId !== e.pointerId) return;
      endHold();
      if (!hold.active) {
        // A tap selects the pouch, ready for the keys.
        svgRef.current?.querySelector<SVGGElement>(`[data-slab-key="${CSS.escape(hold.key)}"]`)?.focus({ preventScroll: true });
        return;
      }
      if (!hold.target || !placements) return;
      const r = applySlabDrop(placements, hold.source, hold.target);
      if (!r) return;
      if (!r.ok) {
        toast.error(r.error); // cap feedback, the add's path
        return;
      }
      commit(placements, r, hold.source);
    },
    onPointerCancel: (e) => {
      if (holdRef.current?.pointerId === e.pointerId) endHold();
    },
    onLostPointerCapture: (e) => {
      if (holdRef.current?.pointerId === e.pointerId) endHold();
    },
  };

  // What the held pouch would do, for the drawing and the line under it.
  // A drop that changes nothing shows the pouch staying put; no target shows its place lifted.
  const landingKey = preview?.result?.ok ? keyOf(preview.result.ref) : preview && !preview.result && held ? held.key : null;
  const targetColumn =
    dropTarget && dropTarget.section === cut.section ? dropTarget.subSection : null;
  const previewColumn = preview?.fit && dropTarget ? preview.fit.sections[dropTarget.section].columns[dropTarget.subSection] : null;
  const tone: NonNullable<CutEditorView["drag"]>["tone"] =
    preview?.result && !preview.result.ok ? "refused" : previewColumn?.status === "over" ? "over" : previewColumn?.status === "compressed" ? "compressed" : "ok";

  const editor: CutEditorView | undefined = editable
    ? {
        svgRef: attachSvg,
        ghostRef,
        svgHandlers,
        slabHit,
        selectedKey,
        hoveredKey: hoverKey,
        drag: held
          ? {
              sourceKey: held.key,
              landingKey,
              column: targetColumn,
              tone,
              ghost: { ...held.ghost, at: held.at },
              overTab,
            }
          : null,
      }
    : undefined;

  // The line under the cut: the drop while a pouch is held, else why the pointed-at pouch is as thick as it is.
  const readout = (() => {
    if (!onCutChange) return null;
    if (held) {
      if (!dropTarget) return { tone: "muted" as const, text: "Move over a column, a layer or a Section tab — release elsewhere to leave it." };
      if (preview?.result && !preview.result.ok) return { tone: "over" as const, text: preview.result.error };
      if (!preview?.result) return { tone: "muted" as const, text: "Leaves it where it is." };
      const layers = cellLayers(placements ?? [], dropTarget).length;
      const col = previewColumn;
      const loft = col ? ` · ${Math.round(col.loftMm)} / ${Math.round(col.maxLoftMm)} mm${statusSuffix(col.status, " · ")}` : "";
      return {
        tone: col?.status === "over" ? ("over" as const) : col?.status === "compressed" ? ("compressed" as const) : ("drop" as const),
        text: `Drop ${describeSlabTarget(dropTarget, layers, held.source.section)}${loft}`,
      };
    }
    const key = (hoverKey && slabs.some((s) => s.key === hoverKey) ? hoverKey : null) ?? (selectedKey && slabs.some((s) => s.key === selectedKey) ? selectedKey : null);
    const slab = key ? slabs.find((s) => s.key === key) : undefined;
    if (slab) {
      const ref = refOf(slab.key);
      return {
        tone: "muted" as const,
        text: `${labelOf(slab.itemId)} · ${ref.section} ${ref.subSection} · layer ${slab.depth + 1} — ${slabThicknessNote(slab, fit.size, itemDims?.get(slab.itemId))}`,
      };
    }
    if (!editable) return null;
    return {
      tone: "muted" as const,
      text: isMobile
        ? "Drag a filling to another column or layer; hold it on a tab to open that Section."
        : "Drag a filling to another column or layer, or hold it on a Section tab. Keys: ← → front / back · ↑ ↓ layer · Shift ← → Section.",
    };
  })();

  const body = (
    <div className={`space-y-2 rounded-lg p-2 ${themed ? XRAY_THEME : ""}`} style={xrayColorVarStyle(colorOverrides)} data-xray-cross-section-panel>
      {onCutChange && (
        <CutControls
          cut={cut}
          onCutChange={onCutChange}
          fit={fit}
          dragging={Boolean(held)}
          springSection={springSection}
          dropSection={dropTarget && dropTarget.section !== cut.section ? dropTarget.section : null}
        />
      )}
      <CrossSectionSvg
        fit={preview?.fit ?? fit}
        cut={cut}
        itemSubtypes={itemSubtypes}
        itemSizes={itemSizes}
        compact={isMobile}
        scaleMm={held ? tallest : undefined}
        editor={editor}
        softBody={softBody}
      />
      {readout && <CutReadout tone={readout.tone}>{readout.text}</CutReadout>}
    </div>
  );
  if (collapsible && isMobile) {
    return (
      <Collapsible className={className} data-xray-cross-section-disclosure>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border bg-background/90 px-3 py-2 text-sm font-medium [&[data-state=open]>svg]:rotate-180">
          Cross-section
          <ChevronDown className="size-4 transition-transform" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">{body}</CollapsibleContent>
      </Collapsible>
    );
  }
  return <div className={className}>{body}</div>;
}

const READOUT_TONE = {
  muted: "opacity-70",
  drop: "text-sky-500 dark:text-sky-300",
  compressed: "text-amber-600 dark:text-amber-300",
  over: "text-amber-600 dark:text-amber-300",
} as const;

/** One line under the cut, announced politely: the pending drop, or the thickness of the pouch in hand. */
function CutReadout({ tone, children }: { tone: keyof typeof READOUT_TONE; children: ReactNode }) {
  return (
    <p className={cn("min-h-8 px-1 text-[11px] leading-4 text-[color:var(--xray-shell,rgba(255,255,255,0.9))]", READOUT_TONE[tone])} aria-live="polite" data-xray-cut-readout>
      {children}
    </p>
  );
}

// --- Mbolster: end-on (slice 09) ---------------------------------------------

/**
 * The bolster seen end-on: a circle of the registry diameter with the
 * thickest pouch's slab inside at its settled, squeezed thickness — the one
 * that decides whether the bolster closes — and, under it, what the pack
 * stands at along the capsule. Same fit language as the pillow: hatched when
 * compressed, an amber shell when it cannot fit.
 */
export function BolsterCrossSectionSvg({
  fit,
  itemSubtypes,
  compact = false,
}: {
  fit: BolsterFit;
  itemSubtypes: ReadonlyMap<number, string | null>;
  /** Phones: the narrower view with larger type, as for the pillow. */
  compact?: boolean;
}) {
  const uid = useId();
  const L = compact ? COMPACT_LAYOUT : LAYOUT;
  const { width, height, padTop, padBottom } = L;
  const hatchId = `${uid}-bhatch`;
  const shadeId = `${uid}-bshade`;
  const thickest = fit.pieces.reduce<BolsterFit["pieces"][number] | null>(
    (best, p) => (best === null || p.settledThicknessMm > best.settledThicknessMm ? p : best),
    null,
  );
  const tallest = Math.max(fit.diameterMm, thickest?.settledThicknessMm ?? 0, 1);
  const plotH = height - padTop - padBottom;
  const ky = plotH / (tallest * 1.12);
  const r = (fit.diameterMm * ky) / 2;
  const cx = width / 2;
  const cy = padTop + plotH / 2;
  const slabH = thickest ? thickest.settledThicknessMm * ky : 0;
  const slabW = Math.max(r * 1.4, 1);
  const status = thickest?.thicknessStatus ?? "ok";
  const visual = thickest ? fillingVisual(itemSubtypes.get(thickest.itemId) ?? null) : null;
  const slabBoxEndOn = { x: cx - slabW / 2, y: cy - slabH / 2, w: slabW, h: Math.max(slabH, 1) };
  const puff = thickest ? puffOf(thickest.settledThicknessMm, thickest.thicknessMm) : 1;
  const body = puffyPath(slabBoxEndOn, puff);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      className="h-auto w-full"
      aria-label="Mbolster cross-section, end-on"
      data-xray-cross-section="bolster"
    >
      <defs>
        <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0 L0 6" stroke="rgba(255,255,255,0.55)" strokeWidth="2" />
        </pattern>
        <linearGradient id={shadeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="white" stopOpacity={0.4} />
          <stop offset="0.32" stopColor="white" stopOpacity={0.08} />
          <stop offset="0.6" stopColor="white" stopOpacity={0} />
          <stop offset="1" stopColor="black" stopOpacity={0.3} />
        </linearGradient>
      </defs>
      {/* The shell: the registry diameter. */}
      <circle cx={cx} cy={cy} r={r} fill={XRAY_INTERIOR_VAR} stroke={fit.status === "over" ? AMBER : XRAY_SHELL_VAR} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      {thickest && visual && (
        <g data-slab-status={status} data-item-subtype={itemSubtypes.get(thickest.itemId) ?? ""}>
          <path
            d={body}
            fill={`var(${visual.cssVar}, ${visual.defaultColor})`}
            fillOpacity={0.92}
            stroke="rgba(255,255,255,0.9)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
          <path d={body} fill={`url(#${shadeId})`} />
          {status !== "ok" && <path d={body} fill={`url(#${hatchId})`} />}
        </g>
      )}
      <text x={r1(cx + r + 6)} y={r1(cy - r + 4)} fontSize={L.maxFont} fill={XRAY_SHELL_VAR} className="select-none tabular-nums">
        Ø {Math.round(fit.diameterMm)} mm
      </text>
      <text x={cx} y={padTop + plotH + L.labelDy} textAnchor="middle" fontSize={L.labelFont} fontWeight={600} fill={XRAY_SHELL_VAR} className="select-none">
        end-on · {fit.length}
      </text>
      <text x={cx} y={padTop + plotH + L.valueDy} textAnchor="middle" fontSize={L.valueFont} fill={XRAY_SHELL_VAR} className="select-none tabular-nums">
        {fit.pieces.length === 0
          ? "empty"
          : `${thickest ? `${Math.round(thickest.settledThicknessMm)} mm thick` : ""} · ${Math.round(fit.usedMm)} / ${Math.round(fit.lengthMm)} mm along${L.statusDy === null ? (fit.status === "compressed" ? " · compressed" : fit.status === "over" ? " · cannot fit" : "") : ""}`}
      </text>
      {L.statusDy !== null && fit.pieces.length > 0 && fit.status !== "ok" && (
        <text x={cx} y={padTop + plotH + L.statusDy} textAnchor="middle" fontSize={L.valueFont} fill={XRAY_SHELL_VAR} className="select-none">
          {fit.status === "compressed" ? "compressed" : "cannot fit"}
        </text>
      )}
    </svg>
  );
}

export function BolsterCrossSection({
  fit,
  itemSubtypes,
  colorOverrides = [],
  themed = true,
  collapsible = true,
  className,
}: {
  fit: BolsterFit;
  itemSubtypes: ReadonlyMap<number, string | null>;
  colorOverrides?: ColorOverrideRow[];
  themed?: boolean;
  collapsible?: boolean;
  className?: string;
}) {
  const isMobile = useIsMobile();
  const body = (
    <div className={`space-y-2 rounded-lg p-2 ${themed ? XRAY_THEME : ""}`} style={xrayColorVarStyle(colorOverrides)} data-xray-cross-section-panel="bolster">
      <BolsterCrossSectionSvg fit={fit} itemSubtypes={itemSubtypes} compact={isMobile} />
    </div>
  );
  if (collapsible && isMobile) {
    return (
      <Collapsible className={className} data-xray-cross-section-disclosure>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border bg-background/90 px-3 py-2 text-sm font-medium [&[data-state=open]>svg]:rotate-180">
          Cross-section
          <ChevronDown className="size-4 transition-transform" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">{body}</CollapsibleContent>
      </Collapsible>
    );
  }
  return <div className={className}>{body}</div>;
}
