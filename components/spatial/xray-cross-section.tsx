"use client";

/**
 * Cross-section view (X-ray pillow UX slice 05, ADR 0019): a live cut of the
 * pillow beside every x-ray: front, middle, back of one Section inside the
 * designer's side profile. Pure SVG from the fit the host already computed —
 * one slab per piece at its compressed thickness, clipped to the shell,
 * coloured by family through the same CSS variables the pouches use, hatched
 * when compressed, red when the stack cannot close; a Neck support is a round
 * roll. No slab animation in v1 (guardrail 4;
 * ponytail: a scaleY transition is one CSS line if it ever wants to breathe).
 */

import { useId } from "react";
import { ChevronDown } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import { xrayColorVarStyle, type ColorOverrideRow } from "@/lib/spatial-fillings/color-overrides";
import { SECTIONS, type Section } from "@/lib/spatial-fillings/core";
import type { PillowSize } from "@/lib/spatial-fillings/dimensions";
import { alongSlabs, crossSectionSlabs, cutLabel, type Cut } from "@/lib/spatial-fillings/cross-section";
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
/** The inset at each end of a piece, so two pouches that meet still read as two. */
const SLAB_GAP = 2;
const OVER = "#ef4444";

/** The cut state hook lives with the other host hooks so a page can lazy-load this component and still hold the state. */
export { useCut } from "./use-pillow-fit";

const r1 = (n: number) => Math.round(n * 10) / 10;

/** "compressed" / "cannot close" after a separator, or nothing when the column fits. */
const statusSuffix = (status: string, sep: string) =>
  status === "compressed" ? `${sep}compressed` : status === "over" ? `${sep}cannot close` : "";

/** A rounded slab as a path (no rects on the x-ray family of drawings). */
function slabPath(x: number, y: number, w: number, h: number, maxR = 6): string {
  const r = Math.min(maxR, h / 2, w / 2);
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

/** A Neck support seen side-on: a round roll, centred in its box. */
function rollPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(w, h) / 2;
  const cx = x + w / 2;
  const cy = y + h - r;
  return `M${r1(cx - r)} ${r1(cy)} A${r1(r)} ${r1(r)} 0 1 0 ${r1(cx + r)} ${r1(cy)} A${r1(r)} ${r1(r)} 0 1 0 ${r1(cx - r)} ${r1(cy)} Z`;
}

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

function profileFor(size: PillowSize, section: Section): Profile {
  if (section !== "center") return PROFILES.sides;
  return size === "XS" ? PROFILES.centerXs : PROFILES.center;
}

/** Fits a profile to x0…x1 on the baseline, its peak `h` tall, flat edge down. */
function profileTransform(p: Profile, x0: number, x1: number, baseline: number, h: number): string {
  const sx = (x1 - x0) / (p.maxX - p.minX);
  const dir = p.peakY < p.flatY ? 1 : -1;
  const sy = h / Math.abs(p.flatY - p.peakY);
  return `translate(${r1(x0 - p.minX * sx)} ${r1(baseline - dir * p.flatY * sy)}) scale(${sx.toFixed(4)} ${(dir * sy).toFixed(4)})`;
}

const TAB_CLASS = "rounded px-2 py-0.5 text-[11px] leading-5 capitalize";
const TAB_ON = "bg-primary text-primary-foreground";
const TAB_OFF = "bg-background hover:bg-accent";

function CutControls({ cut, onCutChange }: { cut: Cut; onCutChange: (cut: Cut) => void }) {
  return (
    <div className="flex overflow-hidden rounded border shadow-sm w-fit" role="group" aria-label="Section" data-xray-cut-controls>
      {SECTIONS.map((section) => (
        <button
          key={section}
          type="button"
          aria-pressed={cut.section === section}
          className={`${TAB_CLASS} ${cut.section === section ? TAB_ON : TAB_OFF}`}
          onClick={() => onCutChange({ section })}
        >
          {section}
        </button>
      ))}
    </div>
  );
}

/** One filling slab: family colour, hatched when compressed, red when it cannot close. */
function SlabShape({
  d,
  itemId,
  status,
  hatched,
  hatchId,
  itemSubtypes,
  pieceKey,
}: {
  d: string;
  itemId: number;
  status: string;
  hatched: boolean;
  hatchId: string;
  itemSubtypes: ReadonlyMap<number, string | null>;
  pieceKey?: string;
}) {
  const subtype = itemSubtypes.get(itemId) ?? null;
  const visual = fillingVisual(subtype);
  return (
    <g data-item-subtype={subtype ?? ""} data-slab-status={status} data-piece={pieceKey}>
      <path
        d={d}
        fill={`var(${visual.cssVar}, ${visual.defaultColor})`}
        fillOpacity={0.9}
        stroke={status === "over" ? OVER : "rgba(255,255,255,0.9)"}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      {hatched && <path d={d} fill={`url(#${hatchId})`} />}
      {status === "over" && <path d={d} fill={OVER} fillOpacity={0.35} />}
    </g>
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
  const profile = profileFor(fit.size, cut.section);
  // The side profile peaks at full gusset height (the side Sections' max loft); headroom for an over stack.
  const profileMm = fit.sections.left.maxLoftMm;
  const tallest = Math.max(1, profileMm, ...columns.map((c) => Math.max(c.maxLoftMm, c.loftMm)));
  const ky = plotH / (tallest * 1.12);
  const totalW = columns.reduce((s, c) => s + c.widthMm, 0) || 1;
  const kx = (width - 2 * PAD_X) / totalW;
  const hatchId = `${uid}-hatch`;
  const shellId = `${uid}-shell`;
  const shell = profileTransform(profile, PAD_X, width - PAD_X, baseline, profileMm * ky);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      className="h-auto w-full"
      aria-label={`Cross-section ${cutLabel(cut)}`}
      data-xray-cross-section="along"
    >
      <defs>
        <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0 L0 6" stroke="rgba(255,255,255,0.55)" strokeWidth="2" />
        </pattern>
        <clipPath id={shellId}>
          <path d={profile.d} transform={shell} />
        </clipPath>
      </defs>
      <path d={profile.d} transform={shell} fill={XRAY_INTERIOR_VAR} data-xray-profile={profile.key} />
      {/* Each piece once, over the length it settles to, resting on what lies under it, inside the shell. */}
      <g clipPath={`url(#${shellId})`}>
        {alongSlabs(fit, cut.section).map((slab) => {
          const x = PAD_X + slab.startMm * kx + SLAB_GAP;
          const w = Math.max((slab.endMm - slab.startMm) * kx - 2 * SLAB_GAP, 1);
          const h = Math.max(slab.heightMm * ky - 2, 1);
          const y = baseline - slab.bottomMm * ky - h - 1;
          const roll = fillingVisual(itemSubtypes.get(slab.itemId) ?? null).shape === "pill";
          return (
            <SlabShape
              key={slab.key}
              d={roll ? rollPath(x, y, w, h) : slabPath(x, y, w, h, 14)}
              itemId={slab.itemId}
              status={slab.status}
              hatched={slab.hatched}
              hatchId={hatchId}
              itemSubtypes={itemSubtypes}
              pieceKey={slab.key}
            />
          );
        })}
      </g>
      <path d={profile.d} transform={shell} fill="none" stroke={XRAY_SHELL_VAR} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      {columns.map((col, i) => {
        const w = col.widthMm * kx;
        const x0 = PAD_X + i * w;
        const loftY = baseline - col.maxLoftMm * ky;
        return (
          <g key={col.key} data-column={col.key} data-status={col.status}>
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
