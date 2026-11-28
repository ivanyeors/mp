"use client";

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
import type { FitStatus, PillowFit } from "@/lib/spatial-fillings/fit";
import { fillingItemsToSunburst, fillingLabel, pieceLabelLines } from "@/lib/spatial-fillings/filling-groups";
import { draftSoftBody, HELD_EASE_MS, padWellOf, SOFT_BODY_DEFAULTS, type SoftBodySettings } from "@/lib/spatial-fillings/soft-body-settings";
import { fillingVisual } from "@/lib/spatial-fillings/visuals";
import { cn } from "@/lib/utils";
import { pouchPath, puffOf, rollPath, shellPolygon, smoothClosedPath, wellDip, type PouchShaping, type ShellPolygon, type ShellTransform, type SlabBox } from "./slab-shape";
import { useSoftCut, type SoftCutInput } from "./soft-cut";
import { landingText, SNAP_WORDS } from "./drag-badge";
import { badgeFontFor, buzz, HeldGhost, pastThreshold, pickUp, stepHold, svgScale, useHeldGhost, type HeldGhostHandle } from "./held-pouch";
import { clearXrayDraft, placementsSignature, publishXrayDraft, useXrayDraft, type XrayDraft } from "./xray-link";
import { XRAY_INTERIOR_VAR, XRAY_PIECE_EDGE_VAR, XRAY_SHELL_VAR, XRAY_THEME } from "./xray-theme";

type CutLayout = {
  width: number;
  maxShellH: number;
  cutPadTop: number;
  cutPadBottom: number;
  labelFont: number;
  labelDy: number;
  pieceFont: number;
  minPieceFont: number;
};
const LAYOUT: CutLayout = { width: 664, maxShellH: 200, cutPadTop: 8, cutPadBottom: 18, labelFont: 11, labelDy: 13, pieceFont: 10, minPieceFont: 7 };
const COMPACT_LAYOUT: CutLayout = { width: 380, maxShellH: 170, cutPadTop: 10, cutPadBottom: 24, labelFont: 15, labelDy: 17, pieceFont: 13, minPieceFont: 9 };

const PAD_X = 8;
const SHELL_MARGIN = 3;
const FLOOR = SHELL_MARGIN + 1;
const SLAB_GAP = 2;
const AMBER = "#f59e0b";
const DROP = "#38bdf8";
const SPRING_MS = 450;
const TWEEN_MS = 220;

export { useCut } from "./use-pillow-fit";

const r1 = (n: number) => Math.round(n * 10) / 10;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpBox = (a: SlabBox, b: SlabBox, t: number): SlabBox => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) });
const sameBox = (a: SlabBox, b: SlabBox) =>
  Math.abs(a.x - b.x) < 0.05 && Math.abs(a.y - b.y) < 0.05 && Math.abs(a.w - b.w) < 0.05 && Math.abs(a.h - b.h) < 0.05;
const prefersReducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function refOf(key: string): PieceRef {
  const [section, subSection, slot] = key.split("/");
  return { section: section as Section, subSection: subSection as SubSection, slot: Number(slot) };
}
const keyOf = (ref: PieceRef) => `${ref.section}/${ref.subSection}/${ref.slot}`;

const statusSuffix = (status: string, sep: string) =>
  status === "compressed" ? `${sep}compressed` : status === "over" ? `${sep}cannot close` : "";

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

const aspectOf = (p: Profile) => (p.maxX - p.minX) / Math.abs(p.flatY - p.peakY);

function profileTransform(p: Profile, x0: number, w: number, baseline: number): ShellTransform {
  const k = w / (p.maxX - p.minX);
  const dir = p.peakY < p.flatY ? 1 : -1;
  return { tx: x0 - p.minX * k, ty: baseline - dir * p.flatY * k, sx: k, sy: dir * k };
}

const transformAttr = (t: ShellTransform) => `translate(${r1(t.tx)} ${r1(t.ty)}) scale(${t.sx.toFixed(4)} ${t.sy.toFixed(4)})`;

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

function tallestMm(columns: readonly CrossSectionColumn[]): number {
  return Math.max(1, ...columns.map((c) => Math.max(c.maxLoftMm, c.loftMm)));
}

type Frame = {
  L: CutLayout;
  profile: Profile;
  x0: number;
  drawW: number;
  shellH: number;
  baseline: number;
  floor: number;
  ky: number;
  kx: number;
  colW: number;
  height: number;
};

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

function frameFor(fit: PillowFit, cut: Cut, compact: boolean, tallest: number): Frame {
  return cutFrame(compact, profileFor(fit.size, cut.section), fit.sections.left.maxLoftMm, tallest, fit.settle.cellLengthMm);
}

function slabBox(slab: AlongSlab, f: Frame): SlabBox {
  const h = Math.max(slab.heightMm * f.ky - 2, 1);
  return {
    x: f.x0 + slab.startMm * f.kx + SLAB_GAP,
    y: f.floor - slab.bottomMm * f.ky - h - 1,
    w: Math.max((slab.endMm - slab.startMm) * f.kx - 2 * SLAB_GAP, 1),
    h,
  };
}

function pieceFontFor(label: string, box: SlabBox, L: CutLayout): number {
  if (!label) return 0;
  const size = Math.min(L.pieceFont, (box.w - 10) / (label.length * 0.62), box.h * 0.75);
  return size >= L.minPieceFont ? r1(size) : 0;
}

function softInputOf(fit: PillowFit, cut: Cut, f: Frame, polygon: ShellPolygon, itemSubtypes: ReadonlyMap<number, string | null>, settings: SoftBodySettings): SoftCutInput {
  return {
    fit,
    section: cut.section,
    frame: { ...f, width: f.L.width, slabGap: SLAB_GAP, scale: f.drawW / Math.min(LAYOUT.width - 2 * PAD_X, LAYOUT.maxShellH * aspectOf(f.profile)) },
    casePolygon: polygon as SoftCutInput["casePolygon"],
    isRoll: (itemId) => fillingVisual(itemSubtypes.get(itemId) ?? null).shape === "pill",
    isPad: (itemId) => fillingVisual(itemSubtypes.get(itemId) ?? null).shape === "ear",
    settings,
  };
}

export function softCutInputFor(
  fit: PillowFit,
  cut: Cut,
  { compact = false, scaleMm, itemSubtypes, settings = SOFT_BODY_DEFAULTS }: { compact?: boolean; scaleMm?: number; itemSubtypes: ReadonlyMap<number, string | null>; settings?: SoftBodySettings },
): SoftCutInput {
  const f = frameFor(fit, cut, compact, scaleMm ?? tallestMm(crossSectionSlabs(fit, cut)));
  return softInputOf(fit, cut, f, casePolygon(f.profile, profileTransform(f.profile, f.x0, f.drawW, f.baseline)), itemSubtypes, settings);
}

type SlabHitProps = React.SVGProps<SVGGElement> & { [attr: `data-${string}`]: string };

type SlabMode = "solid" | "lifted" | "landing";

type SvgIds = { hatch: string };

function slabOutline(box: SlabBox, roll: boolean, puff: number, shaping?: PouchShaping): string {
  return roll ? rollPath(box) : pouchPath(box, puff, shaping);
}

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
  shaping?: PouchShaping;
  subtype: string | null;
  status: FitStatus;
  hatched: boolean;
  mode: SlabMode;
  selected: boolean;
  hovered?: boolean;
  label: string;
  font: number;
  ids: SvgIds;
  pieceKey: string;
  hit?: SlabHitProps;
  outline?: string;
  labelAt?: { x: number; y: number };
  still?: boolean;
}) {
  const visual = fillingVisual(subtype);
  const body = outline ?? slabOutline(box, roll, puff, shaping);
  const mid = (a?: readonly number[]) => (a && a.length ? a[Math.floor(a.length / 2)] : 0);
  const wellDy = shaping?.well ? (wellDip(0.5, shaping.well) * box.h) / 2 : 0;
  const labelDy = roll ? 0 : (mid(shaping?.sag) + mid(shaping?.sagTop ?? shaping?.sag)) / 2 + wellDy;
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
        stroke={hovered ? "white" : XRAY_PIECE_EDGE_VAR}
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

export type CutEditorView = {
  svgRef: Ref<SVGSVGElement>;
  held: HeldGhostHandle;
  svgHandlers: React.SVGProps<SVGSVGElement>;
  slabHit: (slab: AlongSlab, label: string) => SlabHitProps;
  selectedKey: string | null;
  hoveredKey: string | null;
  drag: {
    sourceKey: string;
    landingKey: string | null;
    column: SubSection | null;
    tone: "ok" | "compressed" | "over" | "refused";
    ghost: { w: number; h: number; roll: boolean; puff: number; subtype: string | null; label: string; at: { x: number; y: number } };
    overTab: boolean;
    badge?: string | null;
    badgeFont: number;
    guideX?: number | null;
  } | null;
  addable?: boolean;
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
  itemSizes?: ReadonlyMap<number, string | null>;
  compact?: boolean;
  scaleMm?: number;
  editor?: CutEditorView;
  softBody?: SoftBodySettings;
  softReplay?: number;
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
    const over = slab.status === "over";
    const shaping: PouchShaping = {
      contacts: slab.pressed,
      well: wellOf(subtype),
      sag: slab.sagMm.map((mm) => mm * ky),
      sagTop: slab.sagTopMm.map((mm) => mm * ky),
      shell: over ? undefined : { polygon, margin: SHELL_MARGIN },
    };
    const key = landing ? drag!.sourceKey : slab.key;
    const ring = soft?.rings.get(slab.key);
    const spot = ring ? soft!.labels.get(slab.key) : undefined;
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
          <path d={profile.d} transform={shell} fill="none" stroke={XRAY_SHELL_VAR} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" data-xray-sewn-outline />
          <path d={clothD} fill={XRAY_INTERIOR_VAR} data-xray-profile={profile.key} data-xray-cloth />
        </>
      ) : (
        <path d={profile.d} transform={shell} fill={XRAY_INTERIOR_VAR} data-xray-profile={profile.key} />
      )}
      <g clipPath={`url(#${shellId})`}>
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
        {slabs.filter((s) => !s.over).map((s) => s.el)}
      </g>
      {clothD ? (
        <path d={clothD} fill="none" stroke={XRAY_SHELL_VAR} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      ) : (
        <path d={profile.d} transform={shell} fill="none" stroke={XRAY_SHELL_VAR} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      )}
      {slabs.filter((s) => s.over).map((s) => s.el)}
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
  dragging?: boolean;
  springSection?: Section | null;
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

type SlabHold = {
  source: PieceRef & { itemId: number };
  key: string;
  pointerId: number;
  startX: number;
  startY: number;
  ghost: { w: number; h: number; roll: boolean; puff: number; subtype: string | null; label: string };
  at: { x: number; y: number };
  active: boolean;
  target: SlabDropTarget | null;
  grab: { x: number; y: number };
  fine: FineDrag;
  along: { mm: number; snapMm: number } | null;
  pxPerView: number;
};

export function CrossSectionDisclosure({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <Collapsible className={className} defaultOpen data-xray-cross-section-disclosure>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border bg-background/90 px-3 py-2 text-sm font-medium [&[data-state=open]>svg]:rotate-180">
        {label}
        <ChevronDown className="size-4 transition-transform" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}

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
  onCutChange?: (cut: Cut) => void;
  itemSubtypes: ReadonlyMap<number, string | null>;
  itemSizes?: ReadonlyMap<number, string | null>;
  itemDims?: ReadonlyMap<number, ResolvedDims>;
  placements?: PillowPlacement[];
  onPlacementsChange?: (next: PillowPlacement[]) => void;
  items?: FillingItem[];
  colorOverrides?: ColorOverrideRow[];
  softBody?: SoftBodySettings;
  themed?: boolean;
  collapsible?: boolean;
  tabs?: boolean;
  title?: ReactNode;
  compact?: boolean;
  onReadout?: (readout: CutReadoutValue | null) => void;
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
  const [dropAlong, setDropAlong] = useState<{ mm: number; snapMm: number } | null>(null);
  const snappedAt = useRef<number | null>(null);
  const [springSection, setSpringSection] = useState<Section | null>(null);
  const [overTab, setOverTab] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const canAdd = editable && Boolean(items?.length);
  const fillingTree = useMemo(() => fillingItemsToSunburst(items ?? []), [items]);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const tapRef = useRef<{ pointerId: number; x: number; y: number; closing: boolean } | null>(null);
  const [addState, setAddAt] = useState<{ target: SlabDropTarget; left: number; top: number } | null>(null);
  const addAt = addState?.target.section === cut.section ? addState : null;
  const [hoverState, setHoverColumn] = useState<Cell | null>(null);
  const hoverColumn = hoverState?.section === cut.section ? hoverState.subSection : null;

  useEffect(() => {
    placementsRef.current = placements;
  }, [placements]);

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

  const heldSource = held?.source ?? null;
  const fitCtx = useMemo(() => ({ size: fit.size, dims: itemDims, loftAllowance: fit.loftAllowance }), [fit.size, itemDims, fit.loftAllowance]);
  const placedAt = dropTarget && dropTarget.section === cut.section && dropAlong ? dropAlong.mm : undefined;
  const snapMm = dropAlong?.snapMm ?? 0;
  const preview = useMemo(() => {
    if (!heldSource || !dropTarget || !placements) return null;
    return previewSlabDrop(placements, heldSource, dropTarget, fitCtx, placedAt, snapMm);
  }, [heldSource, dropTarget, placements, fitCtx, placedAt, snapMm]);

  const heldKey = held?.key ?? null;
  const landing = useMemo(() => {
    const r = preview?.result;
    if (!r || !r.ok || !preview?.fit) {
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
  const snapKind = landing?.snap ?? null;
  useEffect(() => {
    if (snapKind && holdRef.current) buzz();
  }, [snapKind]);

  const linked = useXrayDraft(placements);
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

  const sectionToDrop = (target: SlabDropTarget | null) => (target && target.section !== cut.section ? target.section : null);
  const aimAt = (target: SlabDropTarget | null) => {
    setDropTarget(target);
    onDropSection?.(sectionToDrop(target));
  };

  const endHold = useCallback(() => {
    holdRef.current = null;
    disarmSpring();
    setHeld(null);
    setDropTarget(null);
    onDropSection?.(null);
    setDropAlong(null);
    snappedAt.current = null;
    setOverTab(false);
  }, [disarmSpring, onDropSection]);

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
      onDropSection?.(null);
    };
  }, [onDropSection]);

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

  const alongMmAt = (x: number) => Math.round((x - frame.x0) / frame.kx);

  const cellAt = (clientX: number, clientY: number) => {
    const v = toView(clientX, clientY);
    const col = Math.floor((v.x - frame.x0) / frame.colW);
    if (col < 0 || col >= SUB_SECTIONS.length) return null;
    return { cell: { section: cut.section, subSection: SUB_SECTIONS[col] }, v };
  };

  const openAdd = (clientX: number, clientY: number) => {
    const at = cellAt(clientX, clientY);
    const box = bodyRef.current?.getBoundingClientRect();
    if (!at || !box) return;
    const { cell, v } = at;
    const target: SlabDropTarget =
      v.y > frame.floor ? { kind: "cell", ...cell } : slabTargetAt(cell, cellBands(slabs, cell), (frame.floor - v.y) / frame.ky);
    setHoverColumn(null);
    setAddAt({ target, left: clientX - box.left, top: clientY - box.top });
  };

  const addHere = (target: SlabDropTarget, itemId: number) => {
    if (!placements || !onPlacementsChange) return;
    const before = placements;
    const r = addAtSlabTarget(before, target, itemId);
    if (!r.ok) {
      toast.error(r.error);
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

  const armSpring = (section: Section) => {
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

  const targetAt = (hold: SlabHold, clientX: number, clientY: number, centre: { x: number; y: number }): SlabDropTarget | null => {
    const hit = document.elementFromPoint(clientX, clientY)?.closest?.("[data-drop-section]");
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

  const commit = (before: PillowPlacement[], r: Extract<MoveResult, { ok: true }>, source: PieceRef & { itemId: number }, within = false) => {
    if (!onPlacementsChange) return;
    onPlacementsChange(r.placements);
    const nextKey = keyOf(r.ref);
    setSelectedKey(nextKey);
    pendingFocus.current = nextKey;
    if (r.ref.section !== cut.section) onCutChange?.({ section: r.ref.section });
    const layer = cellLayers(r.placements, r.ref).findIndex((l) => l.some((p) => p.slot === r.ref.slot));
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
          fine: pickUp([centre.x, centre.y], e, svgRef.current),
          along: null,
          pxPerView: svgScale(svgRef.current).pxPerView,
        };
      },
      onKeyDown: (e) => {
        if (!placements || e.ctrlKey || e.metaKey) return;
        if (e.altKey) {
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
      if (!canAdd || e.button !== 0 || holdRef.current || following) return;
      if (e.target instanceof Element && e.target.closest("[data-slab-hit]")) return;
      tapRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, closing: addAt !== null };
    },
    onPointerLeave: () => setHoverColumn(null),
    onPointerMove: (e) => {
      const hold = holdRef.current;
      if (!hold || hold.pointerId !== e.pointerId) {
        if (canAdd && e.pointerType === "mouse" && addAt === null && !holdRef.current) {
          const onPouch = e.target instanceof Element && e.target.closest("[data-slab-hit]");
          const next = onPouch ? null : (cellAt(e.clientX, e.clientY)?.cell ?? null);
          setHoverColumn((c) => (c?.section === next?.section && c?.subSection === next?.subSection ? c : next));
        }
        return;
      }
      if (!hold.active && !pastThreshold([hold.startX, hold.startY], e)) return;
      const v = toView(e.clientX, e.clientY);
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
        aimAt(target);
        setHoverKey(null);
        return;
      }
      if (slabTargetKey(target) !== slabTargetKey(hold.target)) {
        hold.target = target;
        aimAt(target);
      }
    },
    onPointerUp: (e) => {
      const tap = tapRef.current;
      if (tap && tap.pointerId === e.pointerId) {
        tapRef.current = null;
        if (!tap.closing && !pastThreshold([tap.x, tap.y], e)) openAdd(e.clientX, e.clientY);
        return;
      }
      const hold = holdRef.current;
      if (!hold || hold.pointerId !== e.pointerId) return;
      endHold();
      if (!hold.active) {
        svgRef.current?.querySelector<SVGGElement>(`[data-slab-key="${CSS.escape(hold.key)}"]`)?.focus({ preventScroll: true });
        return;
      }
      if (!hold.target || !placements) return;
      const r: SlabPlaceResult | null =
        hold.target.section === cut.section && hold.along
          ? placeSlabDrop(placements, hold.source, hold.target, hold.along.mm, fitCtx, hold.along.snapMm)
          : asMove(applySlabDrop(placements, hold.source, hold.target));
      if (!r) return;
      if (!r.ok) {
        toast.error(r.error);
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

  const landingKey = preview?.result?.ok ? keyOf(preview.result.ref) : preview && !preview.result && held ? held.key : null;
  const targetColumn =
    dropTarget && dropTarget.section === cut.section ? dropTarget.subSection : null;
  const previewColumn = preview?.fit && dropTarget ? preview.fit.sections[dropTarget.section].columns[dropTarget.subSection] : null;
  const tone: NonNullable<CutEditorView["drag"]>["tone"] =
    preview?.result && !preview.result.ok ? "refused" : previewColumn?.status === "over" ? "over" : previewColumn?.status === "compressed" ? "compressed" : "ok";

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
        text: `${r.ok && r.within ? `Slide within ${r.ref.section} ${r.ref.subSection}` : `Drop ${describeSlabTarget(dropTarget, layers, held.source.section)}`}${landedAt(preview?.fit, keyOf(r.ref))}${r.ok && r.snap ? ` · ${SNAP_WORDS[r.snap]}` : ""}${loft}`,
      };
    }
    if (addAt) {
      const layers = cellLayers(placements ?? [], addAt.target).length;
      return { tone: "drop" as const, text: `Add a filling: ${describeSlabTarget(addAt.target, layers).replace(/ — side by side$/, ", side by side")}` };
    }
    if (following?.from === "cut") return null;
    if (following) {
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
    if (!editable || onReadout) return null;
    return {
      tone: "muted" as const,
      text: isMobile
        ? `${canAdd ? "Tap Front, Middle or Back to add a filling. " : ""}Drag a filling and it lands where you let go; hold it on a tab to open that Section.`
        : `${canAdd ? "Click a column to add a filling. " : ""}Drag a filling and it lands where you let go — in its column, another column or layer — or hold it on a Section tab. Keys: ← → front / back · Alt ← → nudge (+ Shift: 1 mm) · ↑ ↓ layer · Shift ← → Section.`,
    };
  })();

  const readoutTone = readout?.tone ?? null;
  const readoutText = readout?.text ?? null;
  useEffect(() => {
    if (!onReadout) return;
    onReadout(readoutTone && readoutText ? { tone: readoutTone, text: readoutText } : null);
  }, [onReadout, readoutTone, readoutText]);
  const dropSection = sectionToDrop(dropTarget);

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
        scaleMm={held ? tallest : following ? tallestMm(crossSectionSlabs(fit, shownCut)) : undefined}
        editor={editor}
        softBody={softBody}
        live={following !== null}
      />
      {readout && !onReadout && <CutReadout tone={readout.tone}>{readout.text}</CutReadout>}
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
      <CrossSectionDisclosure label="Cross-section" className={className}>
        {body}
      </CrossSectionDisclosure>
    );
  }
  return <div className={className}>{body}</div>;
}

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

export type CutReadoutValue = { tone: keyof typeof READOUT_TONE; text: string };

export function CutReadout({ tone, children }: { tone: keyof typeof READOUT_TONE; children: ReactNode }) {
  return (
    <p className={cn("min-h-8 px-1 text-[11px] leading-4 text-[color:var(--xray-shell,rgba(255,255,255,0.9))]", READOUT_TONE[tone])} aria-live="polite" data-xray-cut-readout>
      {children}
    </p>
  );
}
