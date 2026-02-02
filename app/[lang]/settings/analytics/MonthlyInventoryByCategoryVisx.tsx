"use client";

import React, { useMemo, useRef } from "react";
import { ParentSize } from "@visx/responsive";
import { Group } from "@visx/group";
import { scaleBand, scaleLinear, scaleOrdinal } from "@visx/scale";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { BarStack } from "@visx/shape";
import { useTooltip, TooltipWithBounds, defaultStyles } from "@visx/tooltip";
import { format } from "date-fns";

export type MonthlyInventoryDatum = {
  month: Date;
  totalsByCategory: Record<string, number>;
};

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

const palette = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"] as const;

function Chart({
  width,
  height,
  data,
  categories,
  categoryLabel,
}: {
  width: number;
  height: number;
  data: MonthlyInventoryDatum[];
  categories: string[];
  categoryLabel: (category: string) => string;
}) {
  const margin = useMemo(() => ({ top: 14, right: 16, bottom: 44, left: 56 }), []);
  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = Math.max(10, height - margin.top - margin.bottom);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const debugHoverLoggedRef = useRef(false);
  const debugTooltipLoggedRef = useRef(false);

  const months = useMemo(() => data.map((d) => d.month.toISOString()), [data]);

  const chartData = useMemo(() => {
    return data.map((d) => {
      const row: Record<string, number | string> = { month: d.month.toISOString() };
      for (const cat of categories) {
        row[cat] = Math.max(0, Math.floor(d.totalsByCategory[cat] ?? 0));
      }
      return row;
    });
  }, [data, categories]);

  const xScale = useMemo(
    () =>
      scaleBand<string>({
        domain: months,
        range: [0, innerWidth],
        padding: 0.2,
      }),
    [months, innerWidth]
  );

  const maxY = useMemo(() => {
    let max = 0;
    for (const d of chartData) {
      let sum = 0;
      for (const cat of categories) sum += Number(d[cat] ?? 0);
      max = Math.max(max, sum);
    }
    return max;
  }, [chartData, categories]);

  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, maxY * 1.12],
        range: [innerHeight, 0],
        nice: true,
      }),
    [innerHeight, maxY]
  );

  const colorScale = useMemo(
    () =>
      scaleOrdinal<string, string>({
        domain: categories,
        range: categories.map((_, idx) => palette[idx % palette.length]),
      }),
    [categories]
  );

  const compactNumber = useMemo(
    () => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 0 }),
    []
  );

  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } = useTooltip<{
    month: Date;
    category: string;
    value: number;
    total: number;
  }>();

  return (
    <div ref={wrapperRef} className="relative" onMouseLeave={() => hideTooltip()}>
      {/* #region agent log: monthly-inventory tooltip render */}
      {(() => {
        if (!tooltipOpen || !tooltipData) return null;
        if (debugTooltipLoggedRef.current) return null;
        debugTooltipLoggedRef.current = true;
        const containerRect = wrapperRef.current?.getBoundingClientRect();
        fetch("http://127.0.0.1:7242/ingest/d787aaa1-a660-4d72-a0b3-a32ef9e8db35", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId: "pre-fix",
            hypothesisId: "H2",
            location: "MonthlyInventoryByCategoryVisx.tsx:tooltip-render",
            message: "Tooltip rendered (first time)",
            data: {
              tooltipLeft,
              tooltipTop,
              containerRect: containerRect
                ? {
                    left: containerRect.left,
                    top: containerRect.top,
                    width: containerRect.width,
                    height: containerRect.height,
                  }
                : null,
              month: tooltipData.month.toISOString(),
              category: tooltipData.category,
              value: tooltipData.value,
              total: tooltipData.total,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        return null;
      })()}
      {/* #endregion */}
      <svg width={width} height={height} style={{ width: "100%", height: "100%" }} className="block">
        <Group left={margin.left} top={margin.top}>
          <GridRows
            scale={yScale}
            width={innerWidth}
            strokeDasharray="3 3"
            stroke="var(--border)"
            strokeOpacity={0.45}
          />

          <BarStack
            data={chartData}
            keys={categories}
            x={(d) => String(d.month)}
            xScale={xScale}
            yScale={yScale}
            color={(key) => colorScale(key)}
          >
            {(barStacks) =>
              barStacks.map((barStack) =>
                barStack.bars.map((bar) => {
                  const monthIso = String(bar.bar.data.month);
                  const month = new Date(monthIso);
                  const value = Number(bar.bar.data[bar.key] ?? 0);
                  const total = categories.reduce((sum, k) => sum + Number(bar.bar.data[k] ?? 0), 0);

                  return (
                    <rect
                      key={`bar-${barStack.index}-${bar.index}-${bar.key}`}
                      x={bar.x}
                      y={bar.y}
                      width={bar.width}
                      height={bar.height}
                      fill={bar.color}
                      rx={6}
                      onMouseMove={(evt) => {
                        const rect = evt.currentTarget.getBoundingClientRect();
                        const left = Math.min(window.innerWidth - 16, rect.left + rect.width / 2);
                        const top = Math.max(16, rect.top);
                        const containerRect = wrapperRef.current?.getBoundingClientRect();
                        const relativeLeft = containerRect ? rect.left - containerRect.left + rect.width / 2 : null;
                        const relativeTop = containerRect ? rect.top - containerRect.top : null;

                        // #region agent log: monthly-inventory tooltip hover
                        if (!debugHoverLoggedRef.current) {
                          debugHoverLoggedRef.current = true;
                          fetch("http://127.0.0.1:7242/ingest/d787aaa1-a660-4d72-a0b3-a32ef9e8db35", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              sessionId: "debug-session",
                              runId: "pre-fix",
                              hypothesisId: "H1",
                              location: "MonthlyInventoryByCategoryVisx.tsx:onMouseMove",
                              message: "First bar hover; tooltip coords computed",
                              data: {
                                bar: { x: bar.x, y: bar.y, width: bar.width, height: bar.height, key: bar.key },
                                evt: { clientX: evt.clientX, clientY: evt.clientY },
                                rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
                                containerRect: containerRect
                                  ? {
                                      left: containerRect.left,
                                      top: containerRect.top,
                                      width: containerRect.width,
                                      height: containerRect.height,
                                    }
                                  : null,
                                tooltipCoords: { left, top },
                                relativeCoords: { left: relativeLeft, top: relativeTop },
                                value,
                                total,
                              },
                              timestamp: Date.now(),
                            }),
                          }).catch(() => {});
                        }
                        // #endregion
                        showTooltip({
                          tooltipData: { month, category: bar.key, value, total },
                          tooltipLeft: left,
                          tooltipTop: top,
                        });
                      }}
                      onMouseLeave={() => hideTooltip()}
                      style={{ cursor: "default" }}
                    />
                  );
                })
              )
            }
          </BarStack>

          <AxisLeft
            scale={yScale}
            stroke="var(--border)"
            tickStroke="var(--border)"
            numTicks={Math.max(2, Math.floor(innerHeight / 44))}
            tickLabelProps={() => ({
              fill: "var(--muted-foreground)",
              fontSize: 11,
              fontFamily: "ui-sans-serif, system-ui",
              textAnchor: "end",
              dx: "-0.4em",
              dy: "0.33em",
            })}
            tickFormat={(v) => compactNumber.format(Number(v))}
          />

          <AxisBottom
            top={innerHeight}
            scale={xScale}
            stroke="var(--border)"
            tickStroke="var(--border)"
            numTicks={Math.max(2, Math.floor(innerWidth / 90))}
            tickLabelProps={() => ({
              fill: "var(--muted-foreground)",
              fontSize: 11,
              fontFamily: "ui-sans-serif, system-ui",
              textAnchor: "middle",
              dy: "0.6em",
            })}
            tickFormat={(iso) => format(new Date(String(iso)), "MMM")}
          />
        </Group>
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {categories.slice(0, 5).map((cat, idx) => (
          <div key={cat} className="flex items-center gap-2">
            <div className="size-2 rounded-sm" style={{ backgroundColor: palette[idx % palette.length] }} />
            <span className="text-muted-foreground">{categoryLabel(cat)}</span>
          </div>
        ))}
        {categories.length > 5 && <span className="text-muted-foreground">+{categories.length - 5} more</span>}
      </div>

      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          top={tooltipTop}
          left={tooltipLeft}
          style={tooltipStyles}
        >
          <div className="space-y-1">
            <div className="font-semibold">{format(tooltipData.month, "MMM yyyy")}</div>
            <div className="flex justify-between gap-6">
              <span className="text-muted-foreground">{categoryLabel(tooltipData.category)}:</span>
              <span className="font-medium">{compactNumber.format(tooltipData.value)}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-muted-foreground">Total:</span>
              <span className="font-medium">{compactNumber.format(tooltipData.total)}</span>
            </div>
          </div>
        </TooltipWithBounds>
      )}
    </div>
  );
}

export function MonthlyInventoryByCategoryVisx({
  rows,
  categories,
  categoryLabel,
  height = 320,
}: {
  rows: MonthlyInventoryDatum[];
  categories: string[];
  categoryLabel: (category: string) => string;
  height?: number;
}) {
  const data = useMemo(() => rows, [rows]);

  return (
    <div className="w-full">
      <ParentSize>
        {({ width }) => (width < 10 ? null : <Chart width={width} height={height} data={data} categories={categories} categoryLabel={categoryLabel} />)}
      </ParentSize>
    </div>
  );
}

