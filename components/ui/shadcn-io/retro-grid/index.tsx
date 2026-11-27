import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

const PERSPECTIVE = 200;
const CELL = 80;
const ROWS_PER_HALF = 10;
const FAN_LINES_PER_SIDE = 40;
const FAN_REACH = FAN_LINES_PER_SIDE * CELL;
const GRADIENT_ID = "retro-grid-brand";

type Rgb = [number, number, number];
type BrandStop = { fromHorizon: number; rgb: Rgb; alpha: number };

export const RETRO_GRID_BRAND_STOPS: BrandStop[] = [
  { fromHorizon: 0.2, rgb: [0, 23, 54], alpha: 0 },
  { fromHorizon: 0.45, rgb: [24, 71, 143], alpha: 0.3 },
  { fromHorizon: 0.7, rgb: [43, 105, 188], alpha: 0.5 },
  { fromHorizon: 1, rgb: [18, 152, 255], alpha: 0.65 },
];

function mix(from: number, to: number, share: number): number {
  return from + (to - from) * share;
}

export function retroGridBrandAt(fromHorizon: number): { rgb: Rgb; alpha: number } {
  const stops = RETRO_GRID_BRAND_STOPS;
  if (fromHorizon <= stops[0].fromHorizon) return stops[0];
  for (let i = 1; i < stops.length; i++) {
    const far = stops[i - 1];
    const near = stops[i];
    if (fromHorizon <= near.fromHorizon) {
      const share = (fromHorizon - far.fromHorizon) / (near.fromHorizon - far.fromHorizon);
      return {
        rgb: [
          Math.round(mix(far.rgb[0], near.rgb[0], share)),
          Math.round(mix(far.rgb[1], near.rgb[1], share)),
          Math.round(mix(far.rgb[2], near.rgb[2], share)),
        ],
        alpha: mix(far.alpha, near.alpha, share),
      };
    }
  }
  return stops[stops.length - 1];
}

type RowEnd = { depth: number; scale: number; fromHorizon: number; alpha: number };
export type RetroGridRow = { far: RowEnd; near: RowEnd; rgb: Rgb };

function rowEndAt(depth: number): RowEnd {
  const fromHorizon = PERSPECTIVE / (PERSPECTIVE + depth);
  return { depth, scale: 1 / fromHorizon, fromHorizon, alpha: retroGridBrandAt(fromHorizon).alpha };
}

export const RETRO_GRID_ROWS: RetroGridRow[] = Array.from({ length: ROWS_PER_HALF }, (_, index) => {
  const far = rowEndAt((index + 1) * CELL);
  const near = rowEndAt(index * CELL);
  return { far, near, rgb: retroGridBrandAt((far.fromHorizon + near.fromHorizon) / 2).rgb };
});

const FAN_PATH = Array.from({ length: FAN_LINES_PER_SIDE * 2 + 1 }, (_, index) => {
  const x = (index - FAN_LINES_PER_SIDE) * CELL;
  return `M${-x} -1L${x} 1`;
}).join("");

const FAN_STOPS = [
  ...[...RETRO_GRID_BRAND_STOPS].reverse().map((stop) => ({ ...stop, offset: (1 - stop.fromHorizon) / 2 })),
  ...RETRO_GRID_BRAND_STOPS.map((stop) => ({ ...stop, offset: (1 + stop.fromHorizon) / 2 })),
];

function rowStyle(row: RetroGridRow): CSSProperties {
  return {
    backgroundColor: `rgb(${row.rgb.join(" ")})`,
    "--z0": `${-row.far.depth}px`,
    "--s0": row.far.scale,
    "--o0": row.far.alpha.toFixed(3),
    "--z1": `${-row.near.depth}px`,
    "--s1": row.near.scale,
    "--o1": row.near.alpha.toFixed(3),
  } as CSSProperties;
}

const SPEED_STYLE: Record<RetroGridSpeed, CSSProperties> = {
  slow: {},
  steady: { "--retro-grid-duration": "2s" } as CSSProperties,
  fast: { "--retro-grid-duration": "0.4s" } as CSSProperties,
  reverse: { "--retro-grid-duration": "0.4s", "--retro-grid-direction": "reverse" } as CSSProperties,
};

export type RetroGridSpeed = "slow" | "steady" | "fast" | "reverse";

export function retroGridStillSvg(width: number, height: number, pixelRatio: number): string {
  const centreX = width / 2;
  const centreY = height / 2;
  const rows = RETRO_GRID_ROWS.flatMap(({ far, rgb }) =>
    [-1, 1].map(
      (side) =>
        `<path d="M0 ${(centreY + side * centreY * far.fromHorizon).toFixed(2)}H${width}" stroke="rgb(${rgb.join(",")})" stroke-opacity="${far.alpha.toFixed(3)}"/>`,
    ),
  );
  const fan = Array.from({ length: FAN_LINES_PER_SIDE * 2 + 1 }, (_, index) => {
    const x = (index - FAN_LINES_PER_SIDE) * CELL * pixelRatio;
    return `M${centreX - x} 0L${centreX + x} ${height}`;
  }).join("");
  const stops = FAN_STOPS.map(
    (stop) => `<stop offset="${stop.offset}" stop-color="rgb(${stop.rgb.join(",")})" stop-opacity="${stop.alpha}"/>`,
  ).join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" stroke-width="${pixelRatio}">` +
    `<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${height}">${stops}</linearGradient></defs>` +
    `<path d="${fan}" stroke="url(#g)"/>${rows.join("")}</svg>`
  );
}

export interface RetroGridProps {
  className?: string;
  speed?: RetroGridSpeed;
}

export function RetroGrid({ className, speed = "slow" }: RetroGridProps) {
  return (
    <div
      aria-hidden
      data-retro-grid
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      style={{ perspective: PERSPECTIVE, ...SPEED_STYLE[speed] }}
    >
      <svg
        className="absolute left-1/2 top-0 h-full"
        style={{ width: FAN_REACH * 2, marginLeft: -FAN_REACH }}
        viewBox={`${-FAN_REACH} -1 ${FAN_REACH * 2} 2`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={GRADIENT_ID} gradientUnits="userSpaceOnUse" x1="0" y1="-1" x2="0" y2="1">
            {FAN_STOPS.map((stop) => (
              <stop
                key={stop.offset}
                offset={stop.offset}
                stopColor={`rgb(${stop.rgb.join(" ")})`}
                stopOpacity={stop.alpha}
              />
            ))}
          </linearGradient>
        </defs>
        <path
          d={FAN_PATH}
          fill="none"
          stroke={`url(#${GRADIENT_ID})`}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {(["-top-px", "-bottom-px"] as const).map((edge) =>
        RETRO_GRID_ROWS.map((row) => (
          <div
            key={`${edge}${row.far.depth}`}
            className={cn(
              "retro-grid-row absolute inset-x-0 h-[3px] border-y border-transparent bg-clip-padding",
              edge,
            )}
            style={rowStyle(row)}
          />
        )),
      )}
    </div>
  );
}
