"use client";

import React, { useMemo } from "react";
import { scaleLinear } from "@visx/scale";

const PILLOW_VIEWBOX = { width: 664, height: 374 };

// From `public/pillow-shape.svg`
const PILLOW_PATH_D =
  "M441.322 14.7728C409.558 27.3692 379.727 35.5927 331.965 35.5927C284.202 35.5927 254.372 27.3692 222.607 14.7728C182.901 -0.972711 120.418 -7.80227 69.7585 31.9038C19.099 71.6098 -2.80784 127.746 1.29974 209.896C5.52474 294.395 33.4738 349.165 83.8767 349.165C134.28 349.165 132.251 315.979 160.907 298.148C183.771 283.922 213.925 285.205 229.723 298.148C251.964 316.368 255.062 333.726 263.277 352.894C269.849 368.229 295.474 372.828 331.271 372.828L332.658 372.828C368.455 372.828 394.08 368.229 400.652 352.894C408.867 333.726 411.966 316.368 434.206 298.148C450.005 285.205 480.158 283.922 503.022 298.148C531.678 315.979 529.65 349.165 580.052 349.165C630.455 349.165 658.404 294.395 662.629 209.896C666.737 127.746 644.83 71.6098 594.171 31.9038C543.511 -7.80226 481.029 -0.972712 441.322 14.7728Z";

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function slugifyId(input: string) {
  return String(input ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export type PillowHeatmapProps = {
  title: string;
  seed?: number;
  className?: string;
  palette?: { from: string; to: string };
  showOutline?: boolean;
  showTitle?: boolean;
};

export function PillowHeatmap({
  title,
  seed = 41,
  className,
  palette = { from: "hsl(142 76% 36%)", to: "hsl(24 95% 53%)" },
  showOutline = true,
  showTitle = true,
}: PillowHeatmapProps) {
  const id = useMemo(() => `pillow-heatmap-${seed}-${slugifyId(title) || "heat"}`, [seed, title]);

  const data = useMemo(() => {
    const rand = mulberry32(seed);
    // Rough density that reads well in the pillow silhouette.
    const cols = 24;
    const rows = 14;
    const paddingX = 44;
    const paddingY = 34;
    const innerW = PILLOW_VIEWBOX.width - paddingX * 2;
    const innerH = PILLOW_VIEWBOX.height - paddingY * 2;

    const points: Array<{ cx: number; cy: number; value: number }> = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const nx = cols <= 1 ? 0.5 : c / (cols - 1);
        const ny = rows <= 1 ? 0.5 : r / (rows - 1);
        const cx = paddingX + nx * innerW;
        const cy = paddingY + ny * innerH;

        // "Hotspot" pseudo field: center-weighted + a couple seeded bumps.
        const dx = nx - 0.5;
        const dy = ny - 0.52;
        const center = Math.exp(-(dx * dx * 5 + dy * dy * 6));
        const bump1 = Math.exp(-((nx - 0.72) ** 2 * 18 + (ny - 0.32) ** 2 * 22));
        const bump2 = Math.exp(-((nx - 0.28) ** 2 * 18 + (ny - 0.72) ** 2 * 20));
        const noise = rand() * 0.35;
        const value = clamp(center * 0.75 + bump1 * 0.6 + bump2 * 0.55 + noise, 0, 1);

        points.push({ cx, cy, value });
      }
    }
    return points;
  }, [seed]);

  const colorScale = useMemo(
    () =>
      scaleLinear<string>({
        domain: [0, 1],
        range: [palette.from, palette.to],
      }),
    [palette.from, palette.to]
  );

  const opacityScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, 1],
        range: [0.12, 0.98],
      }),
    []
  );

  const radiusScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, 1],
        range: [1.5, 8],
      }),
    []
  );

  return (
    <div className={className}>
      {showTitle && title.trim() !== "" && <div className="mb-2 text-sm font-medium">{title}</div>}
      <div className="overflow-hidden rounded-xl bg-card">
        <svg
          viewBox={`0 0 ${PILLOW_VIEWBOX.width} ${PILLOW_VIEWBOX.height}`}
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          className="block h-auto w-full"
          aria-label={title.trim() !== "" ? title : "Heatmap"}
        >
          <defs>
            <clipPath id={`${id}-clip`} clipPathUnits="userSpaceOnUse">
              <path d={PILLOW_PATH_D} />
            </clipPath>
          </defs>

          {/* transparent background (no fill) */}
          <rect width={PILLOW_VIEWBOX.width} height={PILLOW_VIEWBOX.height} fill="none" />

          <g clipPath={`url(#${id}-clip)`}>
            {data.map((p, idx) => {
              const fill = colorScale(p.value);
              const opacity = opacityScale(p.value);
              const r = radiusScale(p.value);
              return (
                <circle
                  key={idx}
                  cx={p.cx}
                  cy={p.cy}
                  r={r}
                  fill={fill}
                  fillOpacity={opacity}
                />
              );
            })}
          </g>

          {showOutline && (
            <path
              d={PILLOW_PATH_D}
              fill="none"
              stroke="var(--border)"
              strokeWidth={2}
              opacity={0.9}
            />
          )}
        </svg>
      </div>
    </div>
  );
}

