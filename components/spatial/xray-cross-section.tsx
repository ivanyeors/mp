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

import { useCallback, useId, useState } from "react";
import { ChevronDown } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import { xrayColorVarStyle, type ColorOverrideRow } from "@/lib/spatial-fillings/color-overrides";
import { SECTIONS, SUB_SECTIONS, type Section } from "@/lib/spatial-fillings/core";
import { crossSectionSlabs, cutLabel, DEFAULT_CUT, type Cut } from "@/lib/spatial-fillings/cross-section";
import type { PillowFit } from "@/lib/spatial-fillings/fit";
import { fillingVisual } from "@/lib/spatial-fillings/visuals";
import { XRAY_INTERIOR_VAR, XRAY_SHELL_VAR, XRAY_THEME } from "./xray-theme";

export const CROSS_SECTION_VIEW = { width: 664, height: 220 } as const;

const PAD_X = 8;
const PAD_TOP = 22;
const PAD_BOTTOM = 30;
const COLUMN_GAP = 14;
const SLAB_INSET = 8;
const OVER = "#ef4444";

/** The cut a host holds: the cross-section's controls set it, the x-ray draws it, an along cut follows the dive. */
export function useCut(initial: Cut = DEFAULT_CUT) {
  const [cut, setCut] = useState<Cut>(initial);
  const onDiveChange = useCallback((section: Section | null) => {
    if (!section) return;
    setCut((c) => (c.axis === "along" && c.section !== section ? { axis: "along", section } : c));
  }, []);
  return { cut, setCut, onDiveChange };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

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
}: {
  fit: PillowFit;
  cut: Cut;
  itemSubtypes: ReadonlyMap<number, string | null>;
}) {
  const uid = useId();
  const columns = crossSectionSlabs(fit, cut);
  const { width, height } = CROSS_SECTION_VIEW;
  const baseline = height - PAD_BOTTOM;
  const plotH = baseline - PAD_TOP;
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
            <text x={r1(x0 + w - 2)} y={r1(loftY - 3)} textAnchor="end" fontSize={9} fill={XRAY_SHELL_VAR} className="select-none tabular-nums">
              max {Math.round(col.maxLoftMm)} mm
            </text>
            {/* The column and what it stands at. */}
            <text x={r1(x0 + w / 2)} y={baseline + 13} textAnchor="middle" fontSize={11} fontWeight={600} fill={XRAY_SHELL_VAR} className="select-none capitalize">
              {col.label}
            </text>
            <text x={r1(x0 + w / 2)} y={baseline + 25} textAnchor="middle" fontSize={10} fill={col.status === "over" ? OVER : XRAY_SHELL_VAR} className="select-none tabular-nums">
              {col.slabs.length === 0 ? "empty" : `${Math.round(col.loftMm)} mm${col.status === "compressed" ? " · compressed" : col.status === "over" ? " · cannot close" : ""}`}
            </text>
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
      <CrossSectionSvg fit={fit} cut={cut} itemSubtypes={itemSubtypes} />
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
