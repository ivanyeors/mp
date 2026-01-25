"use client";

import React, { useMemo, useState, type CSSProperties } from "react";
import { ParentSize } from "@visx/responsive";
import { Group } from "@visx/group";
import { scaleBand, scaleLinear } from "@visx/scale";
import { AxisBottom } from "@visx/axis";
import { GridColumns } from "@visx/grid";
import { useTooltip, TooltipWithBounds, defaultStyles } from "@visx/tooltip";
import { localPoint } from "@visx/event";

export type MovementRow = {
  key: string;
  label: string;
  kind?: "total_start" | "total_end" | "delta";
  stockIn: number;
  stockOut: number;
  net: number;
  startQty: number;
  endQty: number;
};

type WaterfallRow = MovementRow & { start: number; end: number; cumulativeAfter: number };

const tooltipStyles: CSSProperties = {
  ...(defaultStyles as CSSProperties),
  backgroundColor: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
  padding: "10px 12px",
  borderRadius: "10px",
  fontSize: "12px",
  position: "fixed",
  zIndex: 1000,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const estimateLabelWidth = (labels: string[], fontSize: number) => {
  if (labels.length === 0) return 0;
  const longest = labels.reduce((max, label) => Math.max(max, label.length), 0);
  return Math.ceil(longest * fontSize * 0.58);
};

function Chart({
  width,
  height,
  rows,
  onLabelClick,
  isLabelClickable,
}: {
  width: number;
  height: number;
  rows: MovementRow[];
  onLabelClick?: (row: MovementRow) => void;
  isLabelClickable?: (row: MovementRow) => boolean;
}) {
  const labelFontSize = width < 420 ? 11 : 12;
  const axisFontSize = width < 420 ? 10 : 11;
  const estimatedLabelWidth = estimateLabelWidth(
    rows.map((row) => row.label),
    labelFontSize
  );
  const leftMin = width < 420 ? 100 : width < 640 ? 120 : 140;
  const leftMax = width < 420 ? 140 : width < 640 ? 170 : 200;
  const margin = {
    top: width < 420 ? 10 : 12,
    right: width < 420 ? 12 : 16,
    bottom: width < 420 ? 36 : width < 640 ? 40 : 44,
    left: clamp(estimatedLabelWidth + 16, leftMin, leftMax),
  };
  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = Math.max(10, height - margin.top - margin.bottom);
  const [hoveredLabelKey, setHoveredLabelKey] = useState<string | null>(null);

  const wfRows = useMemo<WaterfallRow[]>(() => {
    let cum = 0;
    return rows.map((r) => {
      if (r.kind === "total_start") {
        cum = Number(r.startQty ?? 0);
        return { ...r, start: 0, end: cum, cumulativeAfter: cum };
      }
      if (r.kind === "total_end") {
        cum = Number(r.endQty ?? 0);
        return { ...r, start: 0, end: cum, cumulativeAfter: cum };
      }
      const start = cum;
      const end = cum + Number(r.net ?? 0);
      cum = end;
      return { ...r, start, end, cumulativeAfter: cum };
    });
  }, [rows]);

  const yScale = useMemo(
    () =>
      scaleBand<string>({
        domain: wfRows.map((r) => r.key),
        range: [0, innerHeight],
        padding: 0.25,
      }),
    [wfRows, innerHeight]
  );

  const xDomain = useMemo(() => {
    const values = wfRows.flatMap((r) => [r.start, r.end, 0]);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const pad = Math.max(1, (max - min) * 0.08);
    return [min - pad, max + pad] as const;
  }, [wfRows]);

  const xScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: xDomain as unknown as [number, number],
        range: [0, innerWidth],
        nice: true,
      }),
    [xDomain, innerWidth]
  );

  const compactNumber = useMemo(
    () => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 0 }),
    []
  );

  const { tooltipOpen, tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip } = useTooltip<{
    row: WaterfallRow;
  }>();

  const showRowTooltip = (evt: React.MouseEvent<SVGElement, MouseEvent>, row: WaterfallRow) => {
    showTooltip({
      tooltipData: { row },
      tooltipLeft: evt.clientX + 12,
      tooltipTop: evt.clientY + 12,
    });
  };

  return (
    <div className="relative">
      <svg width={width} height={height} style={{ width: "100%", height: "100%" }} className="block">
        <Group left={margin.left} top={margin.top}>
          <GridColumns
            scale={xScale}
            height={innerHeight}
            strokeDasharray="3 3"
            stroke="var(--border)"
            strokeOpacity={0.45}
          />

          {/* Zero line */}
          <line
            x1={xScale(0)}
            x2={xScale(0)}
            y1={0}
            y2={innerHeight}
            stroke="var(--border)"
            strokeOpacity={0.9}
          />

          {/* Labels (clickable) */}
          {wfRows.map((r) => {
            const y = yScale(r.key);
            if (y === undefined) return null;
            const clickable = isLabelClickable ? isLabelClickable(r) : false;
            const hovered = clickable && hoveredLabelKey === r.key;
            return (
              <text
                key={`label-${r.key}`}
                x={-12}
                y={y + yScale.bandwidth() / 2}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={labelFontSize}
                fontFamily="ui-sans-serif, system-ui"
                fill={clickable ? "var(--foreground)" : "var(--muted-foreground)"}
                style={{
                  cursor: clickable ? "pointer" : "default",
                  userSelect: "none",
                  textDecoration: hovered ? "underline" : "none",
                  textUnderlineOffset: hovered ? "4px" : undefined,
                  textDecorationThickness: hovered ? "2px" : undefined,
                }}
                onMouseEnter={() => {
                  if (!clickable) return;
                  setHoveredLabelKey(r.key);
                }}
                onMouseLeave={() => {
                  setHoveredLabelKey((prev) => (prev === r.key ? null : prev));
                }}
                onClick={() => {
                  if (!clickable || !onLabelClick) return;
                  onLabelClick(r);
                }}
              >
                {r.label}
              </text>
            );
          })}

          {/* Bars */}
          {wfRows.map((r, idx) => {
            const y = yScale(r.key);
            if (y === undefined) return null;
            const barH = yScale.bandwidth();
            const isTotal = r.kind === "total_start" || r.kind === "total_end";
            const absValue = r.kind === "total_start" ? r.startQty : r.endQty;
            const startValue = isTotal ? 0 : r.start;
            const endValue = isTotal ? Number(absValue ?? 0) : r.end;
            const x0 = xScale(Math.min(startValue, endValue));
            const x1 = xScale(Math.max(startValue, endValue));
            const w = Math.max(1, x1 - x0);
            const fill = isTotal ? "var(--muted-foreground)" : r.net >= 0 ? "var(--chart-2)" : "var(--chart-5)";

            const next = wfRows[idx + 1];
            const connectorY = y + barH / 2;
            const connectorX = xScale(isTotal ? endValue : r.end);

            return (
              <g key={`row-${r.key}`}>
                <rect
                  x={x0}
                  y={y}
                  width={w}
                  height={barH}
                  rx={2}
                  fill={fill}
                  fillOpacity={0.9}
                  onMouseMove={(evt) => showRowTooltip(evt, r)}
                  onMouseLeave={() => hideTooltip()}
                />
                {/* Connector to next bar start */}
                {next && yScale(next.key) !== undefined && (
                  <line
                    x1={connectorX}
                    x2={xScale(next.kind === "total_start" || next.kind === "total_end" ? 0 : next.start)}
                    y1={connectorY}
                    y2={(yScale(next.key) as number) + yScale.bandwidth() / 2}
                    stroke="var(--border)"
                    strokeOpacity={0.6}
                    strokeDasharray="3 3"
                  />
                )}
              </g>
            );
          })}

          <AxisBottom
            top={innerHeight}
            scale={xScale}
            stroke="var(--border)"
            tickStroke="var(--border)"
            numTicks={Math.max(2, Math.floor(innerWidth / 100))}
            tickLabelProps={() => ({
              fill: "var(--muted-foreground)",
              fontSize: axisFontSize,
              fontFamily: "ui-sans-serif, system-ui",
              textAnchor: "middle",
              dy: "0.6em",
            })}
            tickFormat={(v) => compactNumber.format(Number(v))}
          />

          {/* Hover capture for empty areas */}
          <rect
            x={0}
            y={0}
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            onMouseLeave={() => hideTooltip()}
            onMouseMove={(evt) => {
              const p = localPoint(evt);
              if (!p) return;
              const x = p.x - margin.left;
              const y = p.y - margin.top;
              if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) {
                hideTooltip();
                return;
              }

              if (wfRows.length === 0) return;
              const step = yScale.step();
              const idx = step > 0 ? Math.floor(y / step) : 0;
              const clampedIdx = Math.max(0, Math.min(wfRows.length - 1, idx));
              const row = wfRows[clampedIdx];
              if (!row) return;
              showRowTooltip(evt, row);
            }}
          />
        </Group>
      </svg>

      {tooltipOpen && tooltipData && (
        <TooltipWithBounds top={tooltipTop} left={tooltipLeft} style={tooltipStyles}>
          <div className="space-y-1">
            <div className="font-semibold">{tooltipData.row.label}</div>
            <div className="flex justify-between gap-6">
              <span className="text-muted-foreground">Start qty:</span>
              <span className="font-medium">{compactNumber.format(tooltipData.row.startQty)}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-muted-foreground">End qty:</span>
              <span className="font-medium">{compactNumber.format(tooltipData.row.endQty)}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-muted-foreground">Stock in:</span>
              <span className="font-medium">{compactNumber.format(tooltipData.row.stockIn)}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-muted-foreground">Stock out:</span>
              <span className="font-medium">{compactNumber.format(tooltipData.row.stockOut)}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-muted-foreground">Net:</span>
              <span className="font-medium">{compactNumber.format(tooltipData.row.net)}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-muted-foreground">Cumulative:</span>
              <span className="font-medium">{compactNumber.format(tooltipData.row.cumulativeAfter)}</span>
            </div>
          </div>
        </TooltipWithBounds>
      )}
    </div>
  );
}

export function InventoryMovementWaterfallVisx({
  rows,
  height = 380,
  onLabelClick,
  isLabelClickable,
}: {
  rows: MovementRow[];
  height?: number;
  onLabelClick?: (row: MovementRow) => void;
  isLabelClickable?: (row: MovementRow) => boolean;
}) {
  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[440px]">
        <ParentSize>
          {({ width }) =>
            width < 10 ? null : (
              <Chart
                width={width}
                height={height}
                rows={rows}
                onLabelClick={onLabelClick}
                isLabelClickable={isLabelClickable}
              />
            )
          }
        </ParentSize>
      </div>
    </div>
  );
}

