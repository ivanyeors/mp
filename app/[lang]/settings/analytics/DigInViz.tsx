"use client";

import {
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTooltip, TooltipWithBounds, defaultStyles } from "@visx/tooltip";
import {
  binDwellHistogram,
  type DwellHistogramBin,
} from "@/lib/analytics/journey/chrome";

const tipStyles: CSSProperties = {
  ...(defaultStyles as CSSProperties),
  backgroundColor: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
  padding: "8px 10px",
  borderRadius: "8px",
  fontSize: "11px",
  position: "fixed",
  zIndex: 10_000,
  pointerEvents: "none",
  maxWidth: 280,
};

function formatDwell(ms: number | null) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function binRangeLabel(b: DwellHistogramBin): string {
  if (b.overflow) return "≥10m";
  const end = b.endMs ?? b.startMs + 10_000;
  return `${formatDwell(b.startMs)}–${formatDwell(end)}`;
}

function DigInTip({
  open,
  left,
  top,
  children,
}: {
  open: boolean;
  left?: number;
  top?: number;
  children: ReactNode;
}) {
  if (!open || left == null || top == null || typeof document === "undefined") {
    return null;
  }
  return createPortal(
    <TooltipWithBounds top={top} left={left} style={tipStyles}>
      {children}
    </TooltipWithBounds>,
    document.body,
  );
}

export function TimeOnPageChart({
  samplesMs = [],
}: {
  samplesMs?: number[];
}) {
  const { bins, medianMs, meanMs, maxAxisMs } = useMemo(
    () => binDwellHistogram(samplesMs),
    [samplesMs],
  );
  const {
    tooltipOpen,
    tooltipData,
    tooltipLeft,
    tooltipTop,
    showTooltip,
    hideTooltip,
  } = useTooltip<{ label: string; count: number }>();

  if (samplesMs.length === 0 || bins.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">No dwell samples yet.</p>
    );
  }
  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  const w = 260;
  const h = 72;
  const padL = 4;
  const padR = 4;
  const padT = 6;
  const padB = 16;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const xAt = (ms: number) =>
    padL + (Math.min(ms, maxAxisMs) / maxAxisMs) * plotW;
  const yAt = (c: number) => padT + plotH - (c / maxCount) * plotH;

  const points = bins
    .map((b) => {
      const mid = b.overflow
        ? maxAxisMs
        : (b.startMs + (b.endMs ?? b.startMs + 10_000)) / 2;
      return `${xAt(mid).toFixed(1)},${yAt(b.count).toFixed(1)}`;
    })
    .join(" ");

  const medX = medianMs != null ? xAt(medianMs) : null;
  const meanX = meanMs != null ? xAt(meanMs) : null;

  return (
    <div className="relative space-y-1">
      <svg
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        className="overflow-visible"
        role="img"
        aria-label="Time on page histogram"
      >
        <line
          x1={padL}
          y1={padT + plotH}
          x2={padL + plotW}
          y2={padT + plotH}
          className="stroke-border"
          strokeWidth={1}
        />
        <polyline
          fill="none"
          points={points}
          className="stroke-[var(--chart-3)]"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          pointerEvents="none"
        />
        {bins.map((b, i) => {
          const mid = b.overflow
            ? maxAxisMs
            : (b.startMs + (b.endMs ?? b.startMs + 10_000)) / 2;
          const cx = xAt(mid);
          const cy = yAt(b.count);
          return (
            <g key={i}>
              <circle
                cx={cx}
                cy={cy}
                r={8}
                fill="transparent"
                onPointerMove={(ev) => {
                  showTooltip({
                    tooltipLeft: ev.clientX + 12,
                    tooltipTop: ev.clientY + 12,
                    tooltipData: {
                      label: binRangeLabel(b),
                      count: b.count,
                    },
                  });
                }}
                onPointerLeave={hideTooltip}
              />
              <circle
                cx={cx}
                cy={cy}
                r={2}
                className="fill-[var(--chart-3)]"
                pointerEvents="none"
              />
            </g>
          );
        })}
        {medX != null ? (
          <line
            x1={medX}
            y1={padT}
            x2={medX}
            y2={padT + plotH}
            className="stroke-foreground"
            strokeWidth={1.25}
            pointerEvents="none"
          />
        ) : null}
        {meanX != null ? (
          <line
            x1={meanX}
            y1={padT}
            x2={meanX}
            y2={padT + plotH}
            className="stroke-muted-foreground"
            strokeWidth={1.25}
            strokeDasharray="2 2"
            pointerEvents="none"
          />
        ) : null}
        <text x={padL} y={h - 2} className="fill-muted-foreground text-[8px]">
          0
        </text>
        <text
          x={padL + plotW}
          y={h - 2}
          textAnchor="end"
          className="fill-muted-foreground text-[8px]"
        >
          {bins.some((b) => b.overflow) ? "≥10m" : formatDwell(maxAxisMs)}
        </text>
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 border-t-2 border-foreground" />
          median {formatDwell(medianMs)}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 border-t border-dashed border-muted-foreground" />
          mean {formatDwell(meanMs)}
        </span>
      </div>
      <DigInTip open={tooltipOpen && !!tooltipData} left={tooltipLeft} top={tooltipTop}>
        {tooltipData ? (
          <>
            <p className="font-medium tabular-nums">{tooltipData.label}</p>
            <p className="mt-0.5 text-muted-foreground">
              {tooltipData.count} visit{tooltipData.count === 1 ? "" : "s"}
            </p>
          </>
        ) : null}
      </DigInTip>
    </div>
  );
}

export type RouteRow = { pathSeq: string[]; count: number };

export function RoutesChart({
  routes = [],
  labelPath,
}: {
  routes?: RouteRow[];
  labelPath: (path: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = routes.slice(0, expanded ? 10 : 5);
  const canExpand = routes.length > 5;
  const {
    tooltipOpen,
    tooltipData,
    tooltipLeft,
    tooltipTop,
    showTooltip,
    hideTooltip,
  } = useTooltip<{ label: string; count: number }>();

  if (routes.length === 0) {
    return <p className="text-[11px] text-muted-foreground">No routes yet.</p>;
  }

  const maxCount = Math.max(1, ...shown.map((r) => r.count));

  return (
    <div className="relative space-y-1">
      <ul className="space-y-1">
        {shown.map((r, i) => {
          const label = r.pathSeq.map(labelPath).join(" → ");
          return (
            <li
              key={i}
              className="flex items-center gap-1.5"
              onPointerMove={(ev) => {
                showTooltip({
                  tooltipLeft: ev.clientX + 12,
                  tooltipTop: ev.clientY + 12,
                  tooltipData: { label, count: r.count },
                });
              }}
              onPointerLeave={hideTooltip}
            >
              <span className="w-3 shrink-0 text-right tabular-nums text-[10px] text-muted-foreground">
                {i + 1}
              </span>
              <div className="h-3.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-muted/60">
                <div
                  className="h-full rounded-sm bg-[var(--chart-3)]/70"
                  style={{ width: `${(r.count / maxCount) * 100}%` }}
                />
              </div>
              <span className="w-5 shrink-0 text-right tabular-nums text-[10px] font-medium">
                {r.count}
              </span>
            </li>
          );
        })}
      </ul>
      {canExpand ? (
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          {expanded ? "Show top 5" : "Show top 10"}
        </button>
      ) : null}
      <DigInTip open={tooltipOpen && !!tooltipData} left={tooltipLeft} top={tooltipTop}>
        {tooltipData ? (
          <>
            <p className="font-medium leading-snug">{tooltipData.label}</p>
            <p className="mt-0.5 tabular-nums text-muted-foreground">
              {tooltipData.count} visit{tooltipData.count === 1 ? "" : "s"}
            </p>
          </>
        ) : null}
      </DigInTip>
    </div>
  );
}

export function timeOnPageBlockH(sampleCount: number): number {
  return sampleCount === 0 ? 16 : 96;
}

export function routesBlockH(routeCount: number): number {
  if (routeCount === 0) return 16;
  const n = Math.min(routeCount, 10);
  return n * 18 + (routeCount > 5 ? 18 : 0);
}
