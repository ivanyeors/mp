"use client";

/**
 * Cross-section view (X-ray pillow UX slice 05, ADR 0019): a live cut of the
 * pillow beside every x-ray: front, middle, back of one Section inside the
 * designer's side profile, drawn at its own proportions on every screen. Pure
 * SVG from the fit the host already computed — one pouch per piece at its
 * compressed thickness, coloured by family through the same CSS variables the
 * pouches use, hatched when compressed; a stack that cannot close pokes out of
 * the case (never red: Ivan, 1-11-2026); a Neck support is a round roll; an Ear Comfort Pad
 * is a cushion whose top dips into its sewn well between two rims. A pouch draws as a stuffed
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

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";

import type { FillingItem } from "@/components/configurator/staff-assist-panel";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SunburstMenu } from "@/components/ui/sunburst-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { cellLayers, type Cell, type MoveResult, type PieceRef } from "@/lib/configurator/staff-assist";
import { addAtSlabTarget, applySlabDrop, asMove, cellBands, describeSlabTarget, nudgeSlab, placeSlabDrop, previewSlabDrop, slabTargetAt, slabTargetKey, stepSlabLayer, type SlabDropTarget, type SlabPlaceResult } from "@/lib/dnd/slab-drag";
import { nudgeKeyFor } from "@/lib/configurator/move-keys";
import type { FineDrag } from "@/lib/dnd/fine-drag";
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
import { fillingItemsToSunburst, fillingLabel, pieceLabelLines } from "@/lib/spatial-fillings/filling-groups";
import { draftSoftBody, HELD_EASE_MS, padWellOf, SOFT_BODY_DEFAULTS, type SoftBodySettings } from "@/lib/spatial-fillings/soft-body-settings";
import { fillingVisual } from "@/lib/spatial-fillings/visuals";
import { cn } from "@/lib/utils";
import { pouchPath, puffOf, puffyPath, rollPath, shellPolygon, smoothClosedPath, wellDip, type PouchShaping, type ShellPolygon, type ShellTransform, type SlabBox } from "./slab-shape";
import { useSoftCut, type SoftCutInput } from "./soft-cut";
import { landingText, SNAP_WORDS } from "./drag-badge";
import { badgeFontFor, buzz, HeldGhost, pastThreshold, pickUp, stepHold, svgScale, useHeldGhost, type HeldGhostHandle } from "./held-pouch";
import { clearXrayDraft, placementsSignature, publishXrayDraft, useXrayDraft, type XrayDraft } from "./xray-link";
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
    isPad: (itemId) => fillingVisual(itemSubtypes.get(itemId) ?? null).shape === "ear",
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

type SvgIds = { hatch: string };

function slabOutline(box: SlabBox, roll: boolean, puff: number, shaping?: PouchShaping): string {
  return roll ? rollPath(box) : pouchPath(box, puff, shaping);
}

/**
 * One filling, side-on: a cushion in flat family colour, as the top view
 * draws it, hatched when compressed or when it cannot close;
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
  // An ear pad's label sits in the fill under its well, not in the dip above it.
  const wellDy = shaping?.well ? (wellDip(0.5, shaping.well) * box.h) / 2 : 0;
  const labelDy = roll ? 0 : (mid(shaping?.sag) + mid(shaping?.sagTop ?? shaping?.sag)) / 2 + wellDy;
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
  /** The held filling's ghost and badge (`held-pouch.tsx`, shared with the top view). */
  held: HeldGhostHandle;
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
    /** Where it would land, mm from the front (and the snap that put it there): over the held pouch, clear of a finger. */
    badge?: string | null;
    /** The badge's type, view units: the same size on screen as the top view's. */
    badgeFont: number;
    /** A snap's line: the edge or middle it lined the pouch up with, view x. */
    guideX?: number | null;
  } | null;
  /** A tap on a column adds a filling there: the cursor says so. */
  addable?: boolean;
  /** The column a tap would add to (hovered), or whose add menu is open: lightly marked. */
  addColumn?: SubSection | null;
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
  live = false,
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
  /** A pouch is in hand in the other view, and this cut follows its preview: settled quickly, never eased. */
  live?: boolean;
}) {
  const uid = useId();
  const columns = crossSectionSlabs(fit, cut);
  const f = frameFor(fit, cut, compact, scaleMm ?? tallestMm(columns));
  const { L, ky, profile } = f;
  const { width } = L;
  const height = f.height;
  const ids: SvgIds = { hatch: `${uid}-hatch` };
  const shellId = `${uid}-shell`;
  const transform = profileTransform(profile, f.x0, f.drawW, f.baseline);
  const shell = transformAttr(transform);
  const polygon = casePolygon(profile, transform);
  const drag = editor?.drag ?? null;
  // The soft cut: every piece settled as a soft body inside the cloth case, from the fit's own spans and Layers.
  // The hook keys the settle by value, so a fresh input each render settles only when something it reads changed.
  // While a pouch is in hand (here or in the top view) every pointer step settles again: a shorter settle keeps up with it.
  const inHand = live || drag !== null;
  const settleWith = inHand ? draftSoftBody(softBody) : softBody;
  const soft = useSoftCut(softBody.enabled ? softInputOf(fit, cut, f, polygon, itemSubtypes, settleWith) : null, softBody.animate, softReplay, inHand ? HELD_EASE_MS : undefined);
  const clothD = soft ? smoothClosedPath(soft.case) : null;
  const well = padWellOf(softBody);
  const wellOf = (subtype: string | null) => (fillingVisual(subtype).shape === "ear" ? well : undefined);
  const labelOf = (itemId: number) => pieceLabelLines(itemSubtypes.get(itemId) ?? null, itemSizes?.get(itemId) ?? null).join(" ");
  const dropX0 = drag?.column ? f.x0 + SUB_SECTIONS.indexOf(drag.column) * f.colW : null;
  const addColumn = !drag ? (editor?.addColumn ?? null) : null;
  const addX0 = addColumn ? f.x0 + SUB_SECTIONS.indexOf(addColumn) * f.colW : null;
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
      well: wellOf(subtype),
      sag: slab.sagMm.map((mm) => mm * ky),
      sagTop: slab.sagTopMm.map((mm) => mm * ky),
      shell: over ? undefined : { polygon, margin: SHELL_MARGIN },
    };
    // A held pouch keeps its identity while it previews elsewhere, so it glides there.
    const key = landing ? drag!.sourceKey : slab.key;
    const ring = soft?.rings.get(slab.key);
    const spot = ring ? soft!.labels.get(slab.key) : undefined;
    // Under a well there is less fill to write on.
    const fontBox = shaping.well ? { ...box, h: box.h * (1 - wellDip(0.5, shaping.well)) } : box;
    const font = spot ? pieceFontFor(label, { x: 0, y: 0, w: spot.r * 2.6, h: spot.r * 2 }, L) : pieceFontFor(label, fontBox, L);
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
      style={drag ? { overflow: "visible", touchAction: "none" } : editor?.addable ? { cursor: "pointer" } : undefined}
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
        {addX0 !== null && (
          <path
            d={`M${r1(addX0)} 0 H${r1(addX0 + f.colW)} V${r1(f.baseline)} H${r1(addX0)} Z`}
            fill={DROP}
            fillOpacity={0.1}
            pointerEvents="none"
            data-xray-add-column={addColumn}
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
            <text x={r1(cx)} y={r1(f.baseline + L.labelDy)} textAnchor="middle" fontSize={L.labelFont} fontWeight={600} fill={drag?.column === col.key ? toneColor : addColumn === col.key ? DROP : XRAY_SHELL_VAR} className="select-none capitalize">
              {col.label}
            </text>
          </g>
        );
      })}
      {/* The held pouch, under the pointer, over everything (even the tabs above the cut). */}
      {/* A snap's line: the column edge or middle the held pouch is lined up with. */}
      {drag?.guideX != null && (
        <path
          d={`M${r1(drag.guideX)} ${r1(top)} V${r1(f.baseline)}`}
          stroke={DROP}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
          data-xray-snap-guide
        />
      )}
      {/* The held pouch, under the pointer where it was picked up, over everything (even the tabs above the cut):
          a light shape, so where it lands — drawn solid in the cut — reads through it. */}
      {drag && editor && (() => {
        const g = drag.ghost;
        const box = { x: -g.w / 2, y: -g.h / 2, w: g.w, h: g.h };
        const visual = fillingVisual(g.subtype);
        return (
          <HeldGhost
            handle={editor.held}
            d={slabOutline(box, g.roll, g.puff, { well: wellOf(g.subtype) })}
            fill={`var(${visual.cssVar}, ${visual.defaultColor})`}
            halfH={g.h / 2}
            badge={drag.badge}
            badgeFont={drag.badgeFont}
            bounds={[0, width, 0]}
            shrink={drag.overTab}
            label={g.label}
            labelFont={pieceFontFor(g.label, box, L)}
          />
        );
      })()}
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
  /** Where the held pouch's centre is, view units: the ghost's first frame (each move after writes its transform directly). */
  at: { x: number; y: number };
  active: boolean;
  target: SlabDropTarget | null;
  /** Where on the pouch it was picked up, view units from its centre: it stays under the pointer there, never jumps. */
  grab: { x: number; y: number };
  /** Front ↔ back, precise by default (`fine-drag.ts`): a creeping hand moves it a fraction of its travel. */
  fine: FineDrag;
  /** The last placement asked for: where its centre goes (mm from the front) and the snap radius then. The release reuses it. */
  along: { mm: number; snapMm: number } | null;
  /** Screen px a view unit when it was picked up: the snap's reach and the badge's size read it. */
  pxPerView: number;
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
  tabs = true,
  title,
  compact,
  onReadout,
  onDropSection,
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
  /**
   * The Section tabs. Off for a cut pinned to one Section beside its two
   * siblings (`XrayCrossSectionStrip`): it still edits, and a pouch dropped on
   * a sibling panel moves to that Section, as onto its tab.
   */
  tabs?: boolean;
  /** Drawn where the tabs would be when they are off: the pinned Section's name. */
  title?: ReactNode;
  /** The narrow layout with larger type; phones by default, and any cut drawn in a narrow column. */
  compact?: boolean;
  /**
   * Hand the line under the cut to the host instead of drawing it — the strip
   * shows one line for all three. The idle hint is not reported (null).
   */
  onReadout?: (readout: CutReadoutValue | null) => void;
  /** The other Section a held pouch would drop into (a sibling panel or tab), so the host can mark it. */
  onDropSection?: (section: Section | null) => void;
  className?: string;
}) {
  const isMobile = useIsMobile();
  const compactLayout = compact ?? isMobile;
  const editable = Boolean(placements && onPlacementsChange && onCutChange);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const heldGhost = useHeldGhost();
  const holdRef = useRef<SlabHold | null>(null);
  const placementsRef = useRef(placements);
  const pendingFocus = useRef<string | null>(null);
  const spring = useRef<{ section: Section; timer: number } | null>(null);
  const [held, setHeld] = useState<SlabHold | null>(null);
  const [dropTarget, setDropTarget] = useState<SlabDropTarget | null>(null);
  // Where along the cut the held pouch would be centred (whole mm from the Section's front) and how far a snap
  // reaches then: the landing follows it.
  const [dropAlong, setDropAlong] = useState<{ mm: number; snapMm: number } | null>(null);
  // Where the last preview's snap stood the pouch (view x of its centre): a hand that slows there creeps on from it.
  const snappedAt = useRef<number | null>(null);
  const [springSection, setSpringSection] = useState<Section | null>(null);
  const [overTab, setOverTab] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  // Tap to add (Ivan, 9-11-2026): a tap on a column — beside its pouches, above or under the stack, or on its
  // name — blooms the fillings there, and the pick lands where the tap was (`addAtSlabTarget`), as a drop there
  // would. A tap on a pouch still selects it.
  const canAdd = editable && Boolean(items?.length);
  const fillingTree = useMemo(() => fillingItemsToSunburst(items ?? []), [items]);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const tapRef = useRef<{ pointerId: number; x: number; y: number; closing: boolean } | null>(null);
  // Each kept with the Section it was on, so another Section shown drops it without an effect.
  const [addState, setAddAt] = useState<{ target: SlabDropTarget; left: number; top: number } | null>(null);
  const addAt = addState?.target.section === cut.section ? addState : null;
  // Read when a press starts: a tap that closes the open menu does not open another.
  const addOpen = useRef(false);
  useEffect(() => {
    addOpen.current = addAt !== null;
  }, [addAt]);
  const [hoverState, setHoverColumn] = useState<Cell | null>(null);
  const hoverColumn = hoverState?.section === cut.section ? hoverState.subSection : null;

  useEffect(() => {
    placementsRef.current = placements;
  }, [placements]);

  // The committed cut: what hit-testing reads, so the zones never move while a preview reflows.
  const columns = useMemo(() => crossSectionSlabs(fit, cut), [fit, cut]);
  const slabs = useMemo(() => alongSlabs(fit, cut.section), [fit, cut.section]);
  const tallest = tallestMm(columns);
  const frame = frameFor(fit, cut, compactLayout, tallest);

  const labelOf = useCallback(
    (itemId: number) => {
      const item = items?.find((i) => i.id === itemId);
      if (item) return fillingLabel(item);
      return pieceLabelLines(itemSubtypes.get(itemId) ?? null, itemSizes?.get(itemId) ?? null).join(" ") || `Item #${itemId}`;
    },
    [items, itemSubtypes, itemSizes],
  );

  // The drop, applied, placed and fitted through the same pure moves the commit uses — once per target and
  // millimetre, not per pointer move: on the cut the landing follows the pointer front ↔ back, on a tab it lands home.
  const heldSource = held?.source ?? null;
  const fitCtx = useMemo(() => ({ size: fit.size, dims: itemDims, loftAllowance: fit.loftAllowance }), [fit.size, itemDims, fit.loftAllowance]);
  const placedAt = dropTarget && dropTarget.section === cut.section && dropAlong ? dropAlong.mm : undefined;
  const snapMm = dropAlong?.snapMm ?? 0;
  const preview = useMemo(() => {
    if (!heldSource || !dropTarget || !placements) return null;
    return previewSlabDrop(placements, heldSource, dropTarget, fitCtx, placedAt, snapMm);
  }, [heldSource, dropTarget, placements, fitCtx, placedAt, snapMm]);

  // Where the preview lands the held pouch, and the snap that put it there: the badge, the guide and the hold read it.
  const heldKey = held?.key ?? null;
  const landing = useMemo(() => {
    const r = preview?.result;
    if (!r || !r.ok || !preview?.fit) {
      // Nowhere to go from here (or a refused drop): where it already stands, so the badge still says.
      if (!heldKey || (r && !r.ok)) return null;
      const section = heldKey.split("/")[0] as Section;
      const p = fit.sections[section].pieces.find((q) => q.key === heldKey);
      return p ? { startMm: p.startMm, endMm: p.endMm, snap: null, section } : null;
    }
    const p = preview.fit.sections[r.ref.section].pieces.find((q) => q.key === keyOf(r.ref));
    return p ? { startMm: p.startMm, endMm: p.endMm, snap: r.snap ?? null, section: r.ref.section } : null;
  }, [preview, heldKey, fit]);
  const snapGuideMm = landing?.snap ? (landing.snap === "front edge" ? landing.startMm : landing.snap === "back edge" ? landing.endMm : (landing.startMm + landing.endMm) / 2) : null;
  useEffect(() => {
    snappedAt.current = landing?.snap ? frame.x0 + ((landing.startMm + landing.endMm) / 2) * frame.kx : null;
  }, [landing, frame.x0, frame.kx]);
  // A snap taking hold is felt as well as seen, where the device can (a phone's short buzz).
  const snapKind = landing?.snap ?? null;
  useEffect(() => {
    if (snapKind && holdRef.current) buzz();
  }, [snapKind]);

  // Linked views: what this cut previews, the top view draws too; while the top view holds a pouch, this cut follows it.
  const linked = useXrayDraft(placements);
  // Any draft this cut does not hold itself: the top view's, or a sibling cut's (the Result page pins three).
  const following: XrayDraft | null = linked && !held ? linked : null;
  const lastSignature = useRef("");
  useEffect(() => {
    const r = preview?.result;
    if (!held || !r || !r.ok || !preview?.fit) {
      lastSignature.current = "";
      clearXrayDraft(placements, "cut");
      return;
    }
    const signature = placementsSignature(r.placements);
    if (signature === lastSignature.current) return;
    lastSignature.current = signature;
    publishXrayDraft(placements, { placements: r.placements, fit: preview.fit, key: keyOf(r.ref), from: "cut" });
  }, [preview, held, placements]);
  useEffect(() => () => clearXrayDraft(placementsRef.current, "cut"), []);

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
    setDropAlong(null);
    snappedAt.current = null;
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

  /** A view x on the cut as whole mm from the Section's front. */
  const alongMmAt = (x: number) => Math.round((x - frame.x0) / frame.kx);

  /** The cell a point on the cut is in (its column of this Section), or null outside the pillow's length. */
  const cellAt = (clientX: number, clientY: number) => {
    const v = toView(clientX, clientY);
    const col = Math.floor((v.x - frame.x0) / frame.colW);
    if (col < 0 || col >= SUB_SECTIONS.length) return null;
    return { cell: { section: cut.section, subSection: SUB_SECTIONS[col] }, v };
  };

  /** Bloom the fillings where the tap was: in the column, at the place a drop there would take. */
  const openAdd = (clientX: number, clientY: number) => {
    const at = cellAt(clientX, clientY);
    const box = bodyRef.current?.getBoundingClientRect();
    if (!at || !box) return;
    const { cell, v } = at;
    // On the column's name, under the case: the add rule. In the column: above, between or under its Layers.
    const target: SlabDropTarget =
      v.y > frame.floor ? { kind: "cell", ...cell } : slabTargetAt(cell, cellBands(slabs, cell), (frame.floor - v.y) / frame.ky);
    setHoverColumn(null);
    setAddAt({ target, left: clientX - box.left, top: clientY - box.top });
  };

  /** Add the picked filling where the tap named; Undo while it is still the last thing that happened. */
  const addHere = (target: SlabDropTarget, itemId: number) => {
    if (!placements || !onPlacementsChange) return;
    const before = placements;
    const r = addAtSlabTarget(before, target, itemId);
    if (!r.ok) {
      toast.error(r.error); // cap feedback, the add's path
      return;
    }
    onPlacementsChange(r.placements);
    const cell = { section: target.section, subSection: target.subSection };
    const isNew = (p: PillowPlacement) => !before.some((q) => q.section === p.section && q.subSection === p.subSection && q.slot === p.slot);
    const layer = cellLayers(r.placements, cell).findIndex((l) => l.some(isNew));
    toast.success(`Added ${labelOf(itemId)} to ${cell.section} ${cell.subSection}${layer >= 0 ? `, layer ${layer + 1}` : ""}`, {
      id: "xray-move",
      action: {
        label: "Undo",
        onClick: () => {
          if (placementsRef.current !== r.placements) {
            toast.error("Undo unavailable — the mix changed after the add");
            return;
          }
          onPlacementsChange(before);
        },
      },
    });
  };

  /** Rest on a tab long enough and the cut opens that Section, so the drop can be placed there exactly. */
  const armSpring = (section: Section) => {
    // A pinned cut has no tab to open: its siblings are already on screen.
    if (!tabs) return;
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

  /**
   * What the held pouch is over: a Section tab (under the pointer), or the column and height of the cut its
   * centre is at — so picking a pouch up by its edge never changes where it goes — or nothing.
   */
  const targetAt = (hold: SlabHold, clientX: number, clientY: number, centre: { x: number; y: number }): SlabDropTarget | null => {
    const hit = document.elementFromPoint(clientX, clientY)?.closest?.("[data-drop-section]");
    // A strip panel is a drop target for its siblings; this cut's own panel is the cut itself.
    const tab = hit && svgRef.current && hit.contains(svgRef.current) ? null : hit;
    setOverTab(Boolean(tab));
    if (tab) {
      const section = tab.getAttribute("data-drop-section") as Section;
      armSpring(section);
      return section === hold.source.section ? null : { kind: "cell", section, subSection: hold.source.subSection };
    }
    disarmSpring();
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || clientX < box.left || clientX > box.right || clientY < box.top || clientY > box.bottom) return null;
    const col = Math.min(Math.max(Math.floor((centre.x - frame.x0) / frame.colW), 0), SUB_SECTIONS.length - 1);
    const cell = { section: cut.section, subSection: SUB_SECTIONS[col] };
    return slabTargetAt(cell, cellBands(slabs, cell), (frame.floor - centre.y) / frame.ky);
  };

  /**
   * Write a move: the selection follows the pouch, the cut follows it to
   * another Section, and Undo is the x-ray's — an inverse applied only while
   * the move is still the last thing that happened (one toast id for both views).
   */
  const commit = (before: PillowPlacement[], r: Extract<MoveResult, { ok: true }>, source: PieceRef & { itemId: number }, within = false) => {
    if (!onPlacementsChange) return;
    onPlacementsChange(r.placements);
    const nextKey = keyOf(r.ref);
    setSelectedKey(nextKey);
    pendingFocus.current = nextKey;
    if (r.ref.section !== cut.section) onCutChange?.({ section: r.ref.section });
    const layer = cellLayers(r.placements, r.ref).findIndex((l) => l.some((p) => p.slot === r.ref.slot));
    // A nudge reads as the top view's: within its cell.
    const where = within ? `within ${r.ref.section} ${r.ref.subSection}` : `to ${r.ref.section} ${r.ref.subSection}, layer ${layer + 1}`;
    toast.success(`Moved ${labelOf(source.itemId)} ${where}`, {
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
      "aria-label": `${label || labelOf(slab.itemId)}, ${where}. Drag, or use arrow keys to move; Alt + left / right nudges it.`,
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
        const centre = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
        const v = toView(e.clientX, e.clientY);
        holdRef.current = {
          source,
          key: slab.key,
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          // Held, it keeps its own size and stays under the pointer where it was picked up.
          ghost: {
            w: box.w,
            h: Math.max(box.h, 10),
            roll: fillingVisual(subtype).shape === "pill",
            puff: 1,
            subtype,
            label,
          },
          at: centre,
          active: false,
          target: null,
          grab: { x: v.x - centre.x, y: v.y - centre.y },
          // The same millimetres a creeping pixel as the top view, whatever this cut's size on screen.
          fine: pickUp([centre.x, centre.y], e, svgRef.current),
          along: null,
          pxPerView: svgScale(svgRef.current).pxPerView,
        };
      },
      onKeyDown: (e) => {
        if (!placements || e.ctrlKey || e.metaKey) return;
        if (e.altKey) {
          // Alt + ← / →: the top view's fine nudge, side-on — a few mm toward the front / back, within its columns.
          const step = nudgeKeyFor(e);
          if (!step?.xMm) return;
          e.preventDefault();
          e.stopPropagation();
          const n = nudgeSlab(placements, ref, step.xMm, fitCtx);
          if (!n) {
            toast(`No room to nudge ${labelOf(slab.itemId)} further ${step.xMm < 0 ? "to the front" : "to the back"}`, { id: "xray-move" });
            return;
          }
          if (n.ok) commit(placements, n, source, true);
          return;
        }
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
    onPointerDown: (e) => {
      // A pouch's own press starts its hold; anywhere else on the cut a press may be a tap that adds.
      if (!canAdd || e.button !== 0 || holdRef.current || following) return;
      if (e.target instanceof Element && e.target.closest("[data-slab-hit]")) return;
      tapRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, closing: addOpen.current };
    },
    onPointerLeave: () => setHoverColumn(null),
    onPointerMove: (e) => {
      const hold = holdRef.current;
      if (!hold || hold.pointerId !== e.pointerId) {
        // A mouse over a column, off its pouches, marks where a click would add.
        if (canAdd && e.pointerType === "mouse" && !addOpen.current && !holdRef.current) {
          const onPouch = e.target instanceof Element && e.target.closest("[data-slab-hit]");
          const next = onPouch ? null : (cellAt(e.clientX, e.clientY)?.cell ?? null);
          setHoverColumn((c) => (c?.section === next?.section && c?.subSection === next?.subSection ? c : next));
        }
        return;
      }
      if (!hold.active && !pastThreshold([hold.startX, hold.startY], e)) return;
      const v = toView(e.clientX, e.clientY);
      // Front ↔ back is precise by default (`held-pouch.tsx`, the top view's too): a creeping hand moves it a fraction
      // of its travel, and slowing on a snap creeps on from it. Up and down is the pointer's own: the Layers are steps.
      const direct = [v.x - hold.grab.x, v.y - hold.grab.y] as const;
      const step = stepHold(hold.fine, direct, e, snappedAt.current === null ? null : [snappedAt.current, hold.fine.at[1]], hold.pxPerView);
      hold.fine = step.fine;
      if (step.leftSnap) snappedAt.current = null;
      const centre = { x: hold.fine.at[0], y: direct[1] };
      heldGhost.place([centre.x, centre.y]);
      const target = targetAt(hold, e.clientX, e.clientY, centre);
      const along = { mm: alongMmAt(centre.x), snapMm: step.snapView / frame.kx };
      hold.along = along;
      setDropAlong((a) => (a && a.mm === along.mm && a.snapMm === along.snapMm ? a : along));
      if (!hold.active) {
        hold.active = true;
        hold.target = target;
        hold.at = centre;
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
      const tap = tapRef.current;
      if (tap && tap.pointerId === e.pointerId) {
        tapRef.current = null;
        // A tap, not a scroll or a press that wandered; one that closed the open menu opens no other.
        if (!tap.closing && !pastThreshold([tap.x, tap.y], e)) openAdd(e.clientX, e.clientY);
        return;
      }
      const hold = holdRef.current;
      if (!hold || hold.pointerId !== e.pointerId) return;
      endHold();
      if (!hold.active) {
        // A tap selects the pouch, ready for the keys.
        svgRef.current?.querySelector<SVGGElement>(`[data-slab-key="${CSS.escape(hold.key)}"]`)?.focus({ preventScroll: true });
        return;
      }
      if (!hold.target || !placements) return;
      // Dropped on the cut, the pouch lands where it was held (as far as there is room) — the last preview's own
      // millimetre and snap, so what was shown is what lands; on a Section tab, at home there.
      const r: SlabPlaceResult | null =
        hold.target.section === cut.section && hold.along
          ? placeSlabDrop(placements, hold.source, hold.target, hold.along.mm, fitCtx, hold.along.snapMm)
          : asMove(applySlabDrop(placements, hold.source, hold.target));
      if (!r) return;
      if (!r.ok) {
        toast.error(r.error); // cap feedback, the add's path
        return;
      }
      commit(placements, r, hold.source, r.within);
    },
    onPointerCancel: (e) => {
      if (tapRef.current?.pointerId === e.pointerId) tapRef.current = null;
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

  // Following another view: the cut shows the Section the held pouch is over (a cut pinned to one Section keeps
  // its own), the pouch picked out.
  const followSection = following ? (following.key.split("/")[0] as Section) : null;
  const shownCut: Cut = tabs && followSection && followSection !== cut.section ? { section: followSection } : cut;

  const editor: CutEditorView | undefined = editable
    ? {
        svgRef: attachSvg,
        held: heldGhost,
        svgHandlers,
        slabHit,
        selectedKey: following ? following.key : selectedKey,
        hoveredKey: following ? null : hoverKey,
        drag: held
          ? {
              sourceKey: held.key,
              landingKey,
              column: targetColumn,
              tone,
              ghost: { ...held.ghost, at: held.at },
              overTab,
              badge: landing && landing.section === cut.section ? landingText(landing.startMm, landing.endMm, landing.snap) : null,
              badgeFont: badgeFontFor(held.pxPerView),
              guideX: snapGuideMm !== null && landing?.section === cut.section ? frame.x0 + snapGuideMm * frame.kx : null,
            }
          : null,
        addable: canAdd && !held && !following,
        addColumn: addAt ? (addAt.target.section === shownCut.section ? addAt.target.subSection : null) : hoverColumn,
      }
    : undefined;

  // The line under the cut: the drop while a pouch is held, else why the pointed-at pouch is as thick as it is.
  const readout = (() => {
    if (!onCutChange) return null;
    if (held) {
      if (!dropTarget) return { tone: "muted" as const, text: "Move over a column, a layer or a Section tab — release elsewhere to leave it." };
      const r = preview?.result;
      if (r && !r.ok) return { tone: "over" as const, text: r.error };
      if (!r) return { tone: "muted" as const, text: "Leaves it where it is." };
      const layers = cellLayers(placements ?? [], dropTarget).length;
      const col = previewColumn;
      const loft = col ? ` · ${Math.round(col.loftMm)} / ${Math.round(col.maxLoftMm)} mm${statusSuffix(col.status, " · ")}` : "";
      return {
        tone: col?.status === "over" ? ("over" as const) : col?.status === "compressed" ? ("compressed" as const) : ("drop" as const),
        // Sliding within its own cell and Layer is a slide, not a drop "side by side".
        text: `${r.ok && r.within ? `Slide within ${r.ref.section} ${r.ref.subSection}` : `Drop ${describeSlabTarget(dropTarget, layers, held.source.section)}`}${landedAt(preview?.fit, keyOf(r.ref))}${r.ok && r.snap ? ` · ${SNAP_WORDS[r.snap]}` : ""}${loft}`,
      };
    }
    if (addAt) {
      const layers = cellLayers(placements ?? [], addAt.target).length;
      return { tone: "drop" as const, text: `Add a filling: ${describeSlabTarget(addAt.target, layers).replace(/ — side by side$/, ", side by side")}` };
    }
    // A sibling cut holding a pouch says where it lands itself (the strip shows one line for all three).
    if (following?.from === "cut") return null;
    if (following) {
      // The top view holds a pouch: say where it would land, as this cut draws it.
      const piece = following.fit.sections[followSection ?? shownCut.section].pieces.find((p) => p.key === following.key);
      const ref = refOf(following.key);
      const layer = cellLayers(following.placements, ref).findIndex((l) => l.some((p) => p.slot === ref.slot));
      return {
        tone: "drop" as const,
        text: `${piece ? labelOf(piece.itemId) : "Filling"} · ${ref.section} ${ref.subSection}, layer ${layer + 1}${landedAt(following.fit, following.key)}`,
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
    // The idle hint is the host's to show when it draws the line itself.
    if (!editable || onReadout) return null;
    return {
      tone: "muted" as const,
      text: isMobile
        ? `${canAdd ? "Tap Front, Middle or Back to add a filling. " : ""}Drag a filling and it lands where you let go; hold it on a tab to open that Section.`
        : `${canAdd ? "Click a column to add a filling. " : ""}Drag a filling and it lands where you let go — in its column, another column or layer — or hold it on a Section tab. Keys: ← → front / back · Alt ← → nudge (+ Shift: 1 mm) · ↑ ↓ layer · Shift ← → Section.`,
    };
  })();

  // Reported by value, so a re-render with the same line does not re-render the host.
  const readoutTone = readout?.tone ?? null;
  const readoutText = readout?.text ?? null;
  useEffect(() => {
    if (!onReadout) return;
    onReadout(readoutTone && readoutText ? { tone: readoutTone, text: readoutText } : null);
  }, [onReadout, readoutTone, readoutText]);
  const dropSection = dropTarget && dropTarget.section !== cut.section ? dropTarget.section : null;
  useEffect(() => {
    onDropSection?.(dropSection);
  }, [onDropSection, dropSection]);

  const body = (
    <div ref={bodyRef} className={`relative space-y-2 rounded-lg p-2 ${themed ? XRAY_THEME : ""}`} style={xrayColorVarStyle(colorOverrides)} data-xray-cross-section-panel>
      {onCutChange && tabs ? (
        <CutControls
          cut={shownCut}
          onCutChange={onCutChange}
          fit={fit}
          dragging={Boolean(held)}
          springSection={springSection}
          dropSection={dropSection}
        />
      ) : (
        title
      )}
      <CrossSectionSvg
        fit={following?.fit ?? preview?.fit ?? fit}
        cut={shownCut}
        itemSubtypes={itemSubtypes}
        itemSizes={itemSizes}
        compact={compactLayout}
        // Pinned while a pouch is in hand, in either view, so a preview never resizes the cut under it.
        scaleMm={held ? tallest : following ? tallestMm(crossSectionSlabs(fit, shownCut)) : undefined}
        editor={editor}
        softBody={softBody}
        live={following !== null}
      />
      {readout && !onReadout && <CutReadout tone={readout.tone}>{readout.text}</CutReadout>}
      {/* The add menu blooms where the tap was (portalled by the menu, so no panel clips it); a phone centres it
          across the panel, so a bloom off a column at the edge stays on the screen, with thumb-sized wedges. */}
      {addAt && (
        <div
          className="absolute z-40 -translate-x-1/2 -translate-y-1/2"
          style={{ left: isMobile ? "50%" : addAt.left, top: addAt.top, width: isMobile ? "100%" : 240 }}
          data-xray-cut-add
        >
          <SunburstMenu
            open
            root={fillingTree}
            display="text"
            size={isMobile ? 280 : 220}
            ringWidth={isMobile ? 48 : 40}
            holeRadius={isMobile ? 26 : 18}
            centerIcon={Plus}
            ariaLabel={`Add filling to ${addAt.target.section} ${addAt.target.subSection}`}
            onOpenChange={(o) => {
              if (!o) setAddAt(null);
            }}
            onSelect={(leaf) => addHere(addAt.target, Number(leaf.id))}
          />
        </div>
      )}
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

/** Where a pouch stands in a fit, for the line under the cut: " · 85–165 mm from the front". */
function landedAt(fit: PillowFit | null | undefined, key: string): string {
  const section = key.split("/")[0] as Section;
  const p = fit?.sections[section]?.pieces.find((q) => q.key === key);
  return p ? ` · ${Math.round(p.startMm)}–${Math.round(p.endMm)} mm from the front` : "";
}

const READOUT_TONE = {
  muted: "opacity-70",
  drop: "text-sky-500 dark:text-sky-300",
  compressed: "text-amber-600 dark:text-amber-300",
  over: "text-amber-600 dark:text-amber-300",
} as const;

/** The line under a cut: the pending drop, or why the pouch in hand is as thick as it draws. */
export type CutReadoutValue = { tone: keyof typeof READOUT_TONE; text: string };

/** One line under the cut, announced politely: the pending drop, or the thickness of the pouch in hand. */
export function CutReadout({ tone, children }: { tone: keyof typeof READOUT_TONE; children: ReactNode }) {
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
