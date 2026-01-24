"use client";

import React, { useMemo, useRef } from "react";
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
  stockIn: number;
  stockOut: number;
  net: number;
};

type WaterfallRow = MovementRow & { start: number; end: number; cumulativeAfter: number };

const tooltipStyles = {
  ...defaultStyles,
  backgroundColor: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
  padding: "10px 12px",
  borderRadius: "10px",
  fontSize: "12px",
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
  const margin = useMemo(() => ({ top: 12, right: 16, bottom: 44, left: 220 }), []);
  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = Math.max(10, height - margin.top - margin.bottom);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const wfRows = useMemo<WaterfallRow[]>(() => {
    let cum = 0;
    return rows.map((r) => {
      const start = cum;
      const end = cum + r.net;
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

  const handleBarMove = (evt: React.MouseEvent<SVGRectElement>, row: WaterfallRow) => {
    const wrapperRect = wrapperRef.current?.getBoundingClientRect();
    if (!wrapperRect) return;
    showTooltip({
      tooltipData: { row },
      tooltipLeft: evt.clientX - wrapperRect.left,
      tooltipTop: evt.clientY - wrapperRect.top,
    });
  };

  return (
    <div ref={wrapperRef} className="relative">
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
            return (
              <text
                key={`label-${r.key}`}
                x={-12}
                y={y + yScale.bandwidth() / 2}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={12}
                fontFamily="ui-sans-serif, system-ui"
                fill={clickable ? "var(--foreground)" : "var(--muted-foreground)"}
                style={{ cursor: clickable ? "pointer" : "default", userSelect: "none" }}
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
            const x0 = xScale(Math.min(r.start, r.end));
            const x1 = xScale(Math.max(r.start, r.end));
            const w = Math.max(1, x1 - x0);
            const fill = r.net >= 0 ? "var(--chart-2)" : "var(--chart-5)";

            const next = wfRows[idx + 1];
            const connectorY = y + barH / 2;
            const connectorX = xScale(r.end);

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
                  onMouseMove={(evt) => handleBarMove(evt, r)}
                  onMouseLeave={() => hideTooltip()}
                />
                {/* Connector to next bar start */}
                {next && yScale(next.key) !== undefined && (
                  <line
                    x1={connectorX}
                    x2={xScale(next.start)}
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
              fontSize: 11,
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
              // If hovering background, hide tooltip to avoid stale popup.
              const p = localPoint(evt);
              if (!p) return;
              if (p.x < 0 || p.y < 0 || p.x > innerWidth || p.y > innerHeight) hideTooltip();
            }}
          />
        </Group>
      </svg>

      {tooltipOpen && tooltipData && (
        <TooltipWithBounds top={tooltipTop} left={tooltipLeft} style={tooltipStyles}>
          <div className="space-y-1">
            <div className="font-semibold">{tooltipData.row.label}</div>
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
    <div className="w-full">
      <ParentSize>
        {({ width }) => (width < 10 ? null : <Chart width={width} height={height} rows={rows} onLabelClick={onLabelClick} isLabelClickable={isLabelClickable} />)}
      </ParentSize>
    </div>
  );
}

