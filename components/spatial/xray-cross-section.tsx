"use client";

/**
 * Cross-section view (X-ray pillow UX slice 05, ADR 0019): a live cut of the
 * pillow beside every x-ray. Across (default): left, center, right at one
 * sub-section; along: front, middle, back of one Section. Pure SVG from the
 * fit the host already computed — slabs per Layer at their compressed
 * thickness, coloured by family through the same CSS variables the pouches
 * use, hatched when compressed, drawn through the loft line in red when the
 * stack cannot close; a lens per Section whose height is that Section's max
 * loft (the centre lens is lower). No slab animation in v1 (guardrail 4;
 * ponytail: a scaleY transition is one CSS line if it ever wants to breathe).
 */

import { useId } from "react";
import { ChevronDown } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import { xrayColorVarStyle, type ColorOverrideRow } from "@/lib/spatial-fillings/color-overrides";
import { SECTIONS, SUB_SECTIONS, type Section } from "@/lib/spatial-fillings/core";
import { crossSectionSlabs, cutLabel, type Cut } from "@/lib/spatial-fillings/cross-section";
import type { BolsterFit, PillowFit } from "@/lib/spatial-fillings/fit";
import { fillingVisual } from "@/lib/spatial-fillings/visuals";
import { XRAY_INTERIOR_VAR, XRAY_SHELL_VAR, XRAY_THEME } from "./xray-theme";

export const CROSS_SECTION_VIEW = { width: 664, height: 220 } as const;

/**
 * Text and spacing for the two layouts. The drawing scales to its container,
 * so at a phone's ~330 px the 664-unit view halves every label — the 9-unit
 * "max … mm" drew at 4–5 px (slice 10's 360 px check). Phones draw a narrower
 * view with larger type instead, ~10–13 px on screen, and put the status on a
 * line of its own so it fits a narrow column.
 */
type CutLayout = {
  width: number;
  height: number;
  padTop: number;
  padBottom: number;
  maxFont: number;
  labelFont: number;
  valueFont: number;
  labelDy: number;
  valueDy: number;
  /** The status ("compressed" / "cannot close") on its own line, at this offset; inline when null. */
  statusDy: number | null;
};
const LAYOUT: CutLayout = { ...CROSS_SECTION_VIEW, padTop: 22, padBottom: 30, maxFont: 9, labelFont: 11, valueFont: 10, labelDy: 13, valueDy: 25, statusDy: null };
const COMPACT_LAYOUT: CutLayout = { width: 380, height: 250, padTop: 26, padBottom: 54, maxFont: 12, labelFont: 15, valueFont: 14, labelDy: 17, valueDy: 33, statusDy: 49 };

const PAD_X = 8;
const COLUMN_GAP = 14;
const SLAB_INSET = 8;
const OVER = "#ef4444";

/** The cut state hook lives with the other host hooks so a page can lazy-load this component and still hold the state. */
export { useCut } from "./use-pillow-fit";

const r1 = (n: number) => Math.round(n * 10) / 10;

/** "compressed" / "cannot close" after a separator, or nothing when the column fits. */
const statusSuffix = (status: string, sep: string) =>
  status === "compressed" ? `${sep}compressed` : status === "over" ? `${sep}cannot close` : "";

/** A rounded slab as a path (no rects on the x-ray family of drawings). */
function slabPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(6, h / 2, w / 2);
  return [
    `M${r1(x + r)} ${r1(y)}`,
    `L${r1(x + w - r)} ${r1(y)}`,
    `Q${r1(x + w)} ${r1(y)} ${r1(x + w)} ${r1(y + r)}`,
    `L${r1(x + w)} ${r1(y + h - r)}`,
    `Q${r1(x + w)} ${r1(y + h)} ${r1(x + w - r)} ${r1(y + h)}`,
    `L${r1(x + r)} ${r1(y + h)}`,
    `Q${r1(x)} ${r1(y + h)} ${r1(x)} ${r1(y + h - r)}`,
    `L${r1(x)} ${r1(y + r)}`,
    `Q${r1(x)} ${r1(y)} ${r1(x + r)} ${r1(y)}`,
    "Z",
  ].join(" ");
}

/** The shell lens: flat on the bed, arched to the Section's max loft. */
function lensPath(x: number, baseline: number, w: number, h: number): string {
  const top = baseline - h;
  return `M${r1(x)} ${r1(baseline)} C${r1(x)} ${r1(top)} ${r1(x + w)} ${r1(top)} ${r1(x + w)} ${r1(baseline)} Z`;
}

const TAB_CLASS = "rounded px-2 py-0.5 text-[11px] leading-5 capitalize";
const TAB_ON = "bg-primary text-primary-foreground";
const TAB_OFF = "bg-background hover:bg-accent";

function CutControls({ cut, onCutChange }: { cut: Cut; onCutChange: (cut: Cut) => void }) {
  const tabs = cut.axis === "across" ? SUB_SECTIONS : SECTIONS;
  const current = cut.axis === "across" ? cut.subSection : cut.section;
  return (
    <div className="flex flex-wrap items-center gap-2" data-xray-cut-controls>
      <div className="flex overflow-hidden rounded border shadow-sm" role="group" aria-label="Cut direction">
        {(["across", "along"] as const).map((axis) => (
          <button
            key={axis}
            type="button"
            aria-pressed={cut.axis === axis}
            className={`${TAB_CLASS} ${cut.axis === axis ? TAB_ON : TAB_OFF}`}
            onClick={() =>
              onCutChange(axis === "across" ? { axis, subSection: "middle" } : { axis, section: "center" })
            }
          >
            {axis}
          </button>
        ))}
      </div>
      <div className="flex overflow-hidden rounded border shadow-sm" role="group" aria-label={cut.axis === "across" ? "Sub-section" : "Section"}>
        {tabs.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={current === key}
            className={`${TAB_CLASS} ${current === key ? TAB_ON : TAB_OFF}`}
            onClick={() =>
              onCutChange(
                cut.axis === "across"
                  ? { axis: "across", subSection: key as (typeof SUB_SECTIONS)[number] }
                  : { axis: "along", section: key as Section },
              )
            }
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CrossSectionSvg({
  fit,
  cut,
  itemSubtypes,
  compact = false,
}: {
  fit: PillowFit;
  cut: Cut;
  itemSubtypes: ReadonlyMap<number, string | null>;
  /** Phones: the narrower view with larger type (`COMPACT_LAYOUT`). */
  compact?: boolean;
}) {
  const uid = useId();
  const columns = crossSectionSlabs(fit, cut);
  const L = compact ? COMPACT_LAYOUT : LAYOUT;
  const { width, height } = L;
  const baseline = height - L.padBottom;
  const plotH = baseline - L.padTop;
  // One vertical scale for every column, with headroom for an over stack.
  const tallest = Math.max(1, ...columns.map((c) => Math.max(c.maxLoftMm, c.loftMm)));
  const ky = plotH / (tallest * 1.12);
  const totalW = columns.reduce((s, c) => s + c.widthMm, 0) || 1;
  const kx = (width - 2 * PAD_X - COLUMN_GAP * (columns.length - 1)) / totalW;
  const hatchId = `${uid}-hatch`;
  // Column origins and each slab's top, as prefix sums (pure — nothing is
  // reassigned while rendering).
  const origins = columns.reduce<number[]>((acc, c, i) => {
    acc.push(i === 0 ? PAD_X : acc[i - 1] + columns[i - 1].widthMm * kx + COLUMN_GAP);
    return acc;
  }, []);
  const slabTops = (col: (typeof columns)[number]) =>
    col.slabs.reduce<number[]>((acc, slab, i) => {
      const below = i === 0 ? baseline : acc[i - 1];
      acc.push(below - slab.heightMm * ky);
      return acc;
    }, []);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      className="h-auto w-full"
      aria-label={`Cross-section ${cutLabel(cut)}`}
      data-xray-cross-section={cut.axis}
    >
      <defs>
        <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0 L0 6" stroke="rgba(255,255,255,0.55)" strokeWidth="2" />
        </pattern>
      </defs>
      {columns.map((col, i) => {
        const w = col.widthMm * kx;
        const x0 = origins[i];
        const loftY = baseline - col.maxLoftMm * ky;
        const tops = slabTops(col);
        return (
          <g key={col.key} data-column={col.key} data-status={col.status}>
            {/* The shell lens: this Section's max loft, the centre lower than the sides. */}
            <path d={lensPath(x0, baseline, w, col.maxLoftMm * ky)} fill={XRAY_INTERIOR_VAR} stroke={XRAY_SHELL_VAR} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            {/* Slabs, deepest at the bottom, each its compressed thickness. */}
            {col.slabs.map((slab, j) => {
              const h = slab.heightMm * ky;
              const y = tops[j];
              const subtype = itemSubtypes.get(slab.itemId) ?? null;
              const visual = fillingVisual(subtype);
              const d = slabPath(x0 + SLAB_INSET, y + 1, w - 2 * SLAB_INSET, Math.max(h - 2, 1));
              return (
                <g key={slab.depth} data-item-subtype={subtype ?? ""} data-slab-status={slab.status}>
                  <path
                    d={d}
                    fill={`var(${visual.cssVar}, ${visual.defaultColor})`}
                    fillOpacity={0.9}
                    stroke={slab.status === "over" ? OVER : "rgba(255,255,255,0.9)"}
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                  {slab.hatched && <path d={d} fill={`url(#${hatchId})`} />}
                  {slab.status === "over" && <path d={d} fill={OVER} fillOpacity={0.35} />}
                </g>
              );
            })}
            {/* The loft line, with its mm. */}
            <path
              d={`M${r1(x0)} ${r1(loftY)} L${r1(x0 + w)} ${r1(loftY)}`}
              fill="none"
              stroke={col.status === "over" ? OVER : XRAY_SHELL_VAR}
              strokeWidth={1}
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
            />
            <text x={r1(x0 + w - 2)} y={r1(loftY - 3)} textAnchor="end" fontSize={L.maxFont} fill={XRAY_SHELL_VAR} className="select-none tabular-nums">
              max {Math.round(col.maxLoftMm)} mm
            </text>
            {/* The column and what it stands at. */}
            <text x={r1(x0 + w / 2)} y={baseline + L.labelDy} textAnchor="middle" fontSize={L.labelFont} fontWeight={600} fill={XRAY_SHELL_VAR} className="select-none capitalize">
              {col.label}
            </text>
            <text x={r1(x0 + w / 2)} y={baseline + L.valueDy} textAnchor="middle" fontSize={L.valueFont} fill={col.status === "over" ? OVER : XRAY_SHELL_VAR} className="select-none tabular-nums">
              {col.slabs.length === 0
                ? "empty"
                : `${Math.round(col.loftMm)} mm${L.statusDy === null ? statusSuffix(col.status, " · ") : ""}`}
            </text>
            {L.statusDy !== null && col.slabs.length > 0 && col.status !== "ok" && (
              <text x={r1(x0 + w / 2)} y={baseline + L.statusDy} textAnchor="middle" fontSize={L.valueFont} fill={col.status === "over" ? OVER : XRAY_SHELL_VAR} className="select-none">
                {statusSuffix(col.status, "")}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function XrayCrossSection({
  fit,
  cut,
  onCutChange,
  itemSubtypes,
  colorOverrides = [],
  themed = true,
  collapsible = true,
  className,
}: {
  fit: PillowFit;
  cut: Cut;
  /** Omit for the read-only variant (the shopper preview): no toggle, no tabs. */
  onCutChange?: (cut: Cut) => void;
  itemSubtypes: ReadonlyMap<number, string | null>;
  /** Product Builder colour overrides, applied as the same CSS variables the pouches read. */
  colorOverrides?: ColorOverrideRow[];
  /** Admin pages theme the shell for light/dark; the configurator's dark stage keeps the defaults. */
  themed?: boolean;
  /** Phones collapse it under a "Cross-section" disclosure, closed by default. */
  collapsible?: boolean;
  className?: string;
}) {
  const isMobile = useIsMobile();
  const body = (
    <div className={`space-y-2 rounded-lg p-2 ${themed ? XRAY_THEME : ""}`} style={xrayColorVarStyle(colorOverrides)} data-xray-cross-section-panel>
      {onCutChange && <CutControls cut={cut} onCutChange={onCutChange} />}
      <CrossSectionSvg fit={fit} cut={cut} itemSubtypes={itemSubtypes} compact={isMobile} />
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

// --- Mbolster: end-on (slice 09) ---------------------------------------------

/**
 * The bolster seen end-on: a circle of the registry diameter with the
 * thickest pouch's slab inside at its settled, squeezed thickness — the one
 * that decides whether the bolster closes — and, under it, what the pack
 * stands at along the capsule. Same fit language as the pillow: hatched when
 * compressed, red through the shell when it cannot fit.
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
      <circle cx={cx} cy={cy} r={r} fill={XRAY_INTERIOR_VAR} stroke={fit.status === "over" ? OVER : XRAY_SHELL_VAR} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      {thickest && visual && (
        <g data-slab-status={status} data-item-subtype={itemSubtypes.get(thickest.itemId) ?? ""}>
          <path
            d={slabPath(cx - slabW / 2, cy - slabH / 2, slabW, Math.max(slabH, 1))}
            fill={`var(${visual.cssVar}, ${visual.defaultColor})`}
            fillOpacity={0.9}
            stroke={status === "over" ? OVER : "rgba(255,255,255,0.9)"}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
          {status !== "ok" && <path d={slabPath(cx - slabW / 2, cy - slabH / 2, slabW, Math.max(slabH, 1))} fill={`url(#${hatchId})`} />}
          {status === "over" && <path d={slabPath(cx - slabW / 2, cy - slabH / 2, slabW, Math.max(slabH, 1))} fill={OVER} fillOpacity={0.35} />}
        </g>
      )}
      <text x={r1(cx + r + 6)} y={r1(cy - r + 4)} fontSize={L.maxFont} fill={XRAY_SHELL_VAR} className="select-none tabular-nums">
        Ø {Math.round(fit.diameterMm)} mm
      </text>
      <text x={cx} y={padTop + plotH + L.labelDy} textAnchor="middle" fontSize={L.labelFont} fontWeight={600} fill={XRAY_SHELL_VAR} className="select-none">
        end-on · {fit.length}
      </text>
      <text x={cx} y={padTop + plotH + L.valueDy} textAnchor="middle" fontSize={L.valueFont} fill={fit.status === "over" ? OVER : XRAY_SHELL_VAR} className="select-none tabular-nums">
        {fit.pieces.length === 0
          ? "empty"
          : `${thickest ? `${Math.round(thickest.settledThicknessMm)} mm thick` : ""} · ${Math.round(fit.usedMm)} / ${Math.round(fit.lengthMm)} mm along${L.statusDy === null ? (fit.status === "compressed" ? " · compressed" : fit.status === "over" ? " · cannot fit" : "") : ""}`}
      </text>
      {L.statusDy !== null && fit.pieces.length > 0 && fit.status !== "ok" && (
        <text x={cx} y={padTop + plotH + L.statusDy} textAnchor="middle" fontSize={L.valueFont} fill={fit.status === "over" ? OVER : XRAY_SHELL_VAR} className="select-none">
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
