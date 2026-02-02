"use client";

import React, { useMemo } from "react";
import { Group } from "@visx/group";
import { GridColumns } from "@visx/grid";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { scaleBand, scaleLinear, scaleOrdinal } from "@visx/scale";
import { ParentSize } from "@visx/responsive";
import { Bar, BarGroupHorizontal } from "@visx/shape";
import { useTooltip } from "@visx/tooltip";

export type UnitMarginRow = {
  id: number;
  label: string;
  unitMargin: number;
  cost?: number;
  msrp?: number;
  onHand?: number;
  opportunityValue?: number;
};

const defaultMargin = { top: 14, right: 18, bottom: 34, left: 210 };

type TooltipDatum = {
  label: string;
  barType: "cost" | "msrp" | "onHand";
  cost: number;
  msrp: number;
  onHand: number;
  unitMargin: number;
};

const seriesKeys = ["cost", "msrp", "onHand"] as const;
type SeriesKey = (typeof seriesKeys)[number];

const legend = [
  { key: "cost" as const, label: "Cost", color: "var(--chart-2)" },
  { key: "msrp" as const, label: "MSRP", color: "var(--chart-1)" },
  { key: "onHand" as const, label: "On hand", color: "var(--chart-3)" },
];

function Chart({
  width,
  height,
  rows,
  formatMoney,
  formatMoneyLong,
}: {
  width: number;
  height: number;
  rows: UnitMarginRow[];
  formatMoney: (value: number) => string;
  formatMoneyLong: (value: number) => string;
}) {
  const margin = defaultMargin;
  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = Math.max(10, height - margin.top - margin.bottom);

  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } =
    useTooltip<TooltipDatum>();

  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        label: r.label,
        cost: Number(r.cost ?? 0),
        msrp: Number(r.msrp ?? 0),
        onHand: Number(r.onHand ?? 0),
        unitMargin: Number(r.unitMargin ?? 0),
      })),
    [rows]
  );

  const xMax = useMemo(() => {
    const max = Math.max(
      ...chartData.flatMap((d) => [d.cost, d.msrp, d.onHand]),
      1
    );
    return max * 1.12;
  }, [chartData]);

  const y0Scale = useMemo(
    () =>
      scaleBand<string>({
        domain: chartData.map((d) => d.label),
        range: [0, innerHeight],
        padding: 0.2,
      }),
    [innerHeight, chartData]
  );

  const y1Scale = useMemo(
    () =>
      scaleBand<string>({
        domain: seriesKeys as unknown as string[],
        range: [0, y0Scale.bandwidth()],
        padding: 0.1,
      }),
    [y0Scale]
  );

  const xScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, xMax],
        range: [0, innerWidth],
        nice: true,
      }),
    [innerWidth, xMax]
  );

  const colorScale = useMemo(
    () =>
      scaleOrdinal<SeriesKey, string>({
        domain: seriesKeys as unknown as SeriesKey[],
        range: ["var(--chart-2)", "var(--chart-1)", "var(--chart-3)"],
      }),
    []
  );

  return (
    <div className="relative" onMouseLeave={() => hideTooltip()}>
      <svg width={width} height={height} style={{ width: "100%", height: "100%" }}>
        <Group top={margin.top} left={margin.left}>
          <GridColumns
            scale={xScale}
            height={innerHeight}
            stroke="var(--border)"
            strokeOpacity={0.6}
            strokeDasharray="3 3"
          />

          <BarGroupHorizontal
            data={chartData}
            keys={seriesKeys as unknown as string[]}
            width={innerWidth}
            y0={(d) => d.label}
            y0Scale={y0Scale}
            y1Scale={y1Scale}
            xScale={xScale}
            color={(key) => colorScale(key as SeriesKey)}
          >
            {(barGroups) =>
              barGroups.map((barGroup) => (
                <Group key={`bar-group-${barGroup.index}-${barGroup.y0}`} top={barGroup.y0}>
                  {barGroup.bars.map((bar) => {
                    const row = chartData[barGroup.index];
                    const barType = bar.key as "cost" | "msrp" | "onHand";
                    return (
                      <Bar
                        key={`${barGroup.index}-${bar.index}-${bar.key}`}
                        x={bar.x}
                        y={bar.y}
                        width={bar.width}
                        height={bar.height}
                        fill={bar.color}
                        rx={6}
                        style={{ cursor: "default" }}
                        onMouseMove={(evt) => {
                          const el = evt.currentTarget as unknown as Element;
                          const bounds = el.getBoundingClientRect();
                          const left = Math.min(window.innerWidth - 16, bounds.right + 12);
                          const top = Math.min(
                            window.innerHeight - 16,
                            Math.max(16, bounds.top + bounds.height / 2)
                          );
                          showTooltip({
                            tooltipData: {
                              label: row.label,
                              barType,
                              cost: row.cost,
                              msrp: row.msrp,
                              onHand: row.onHand,
                              unitMargin: row.unitMargin,
                            },
                            tooltipLeft: left,
                            tooltipTop: top,
                          });
                        }}
                        onMouseLeave={() => hideTooltip()}
                      />
                    );
                  })}
                </Group>
              ))
            }
          </BarGroupHorizontal>

          <AxisLeft
            scale={y0Scale}
            hideAxisLine
            hideTicks
            tickLabelProps={() => ({
              fill: "var(--foreground)",
              fontSize: 12,
              fontFamily: "ui-sans-serif, system-ui",
              textAnchor: "end",
              dx: "-0.4em",
              dy: "0.33em",
            })}
          />

          <AxisBottom
            top={innerHeight}
            scale={xScale}
            hideAxisLine
            tickStroke="var(--border)"
            stroke="var(--border)"
            tickFormat={(v) => {
              const num = Number(v);
              // For onHand values, show as integer without currency
              if (num < 100 && num === Math.floor(num)) return String(num);
              return formatMoney(num);
            }}
            tickLabelProps={() => ({
              fill: "var(--muted-foreground)",
              fontSize: 11,
              fontFamily: "ui-sans-serif, system-ui",
              textAnchor: "middle",
              dy: "0.6em",
            })}
          />
        </Group>
      </svg>

      {tooltipOpen && tooltipData && (
        <div
          style={{
            position: "fixed",
            left: tooltipLeft,
            top: tooltipTop,
            transform: "translateY(-50%)",
            zIndex: 50,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              background: "var(--popover)",
              color: "var(--popover-foreground)",
              border: "1px solid var(--border)",
              boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
              borderRadius: 10,
              padding: "10px 12px",
              maxWidth: 340,
            }}
          >
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 600 }}>{tooltipData.label}</div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                Hovered bar:{" "}
                <span style={{ fontWeight: 700 }}>
                  {tooltipData.barType === "cost"
                    ? "Cost"
                    : tooltipData.barType === "msrp"
                      ? "MSRP"
                      : "On hand"}
                </span>
              </div>
              <div style={{ display: "grid", gap: 2, fontSize: 12 }}>
                <div>
                  <span style={{ color: "var(--muted-foreground)" }}>Cost:</span>{" "}
                  <span style={{ fontWeight: 600 }}>{formatMoneyLong(tooltipData.cost)}</span>
                </div>
                <div>
                  <span style={{ color: "var(--muted-foreground)" }}>MSRP:</span>{" "}
                  <span style={{ fontWeight: 600 }}>{formatMoneyLong(tooltipData.msrp)}</span>
                </div>
                <div>
                  <span style={{ color: "var(--muted-foreground)" }}>On hand:</span>{" "}
                  <span style={{ fontWeight: 600 }}>{tooltipData.onHand}</span>
                </div>
                <div>
                  <span style={{ color: "var(--muted-foreground)" }}>Unit margin:</span>{" "}
                  <span style={{ fontWeight: 600 }}>{formatMoneyLong(tooltipData.unitMargin)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function UnitMarginBySkuVisx({
  rows,
  height = 360,
  formatMoney,
  formatMoneyLong,
}: {
  rows: UnitMarginRow[];
  height?: number;
  formatMoney: (value: number) => string;
  formatMoneyLong: (value: number) => string;
}) {
  // Filter out negative margin items
  const filteredRows = useMemo(
    () => rows.filter((row) => row.unitMargin >= 0),
    [rows]
  );

  return (
    <div className="w-full space-y-3">
      <div className="h-[360px] w-full">
        <ParentSize>
          {({ width }) =>
            width < 10 ? null : (
              <Chart
                width={width}
                height={height}
                rows={filteredRows}
                formatMoney={formatMoney}
                formatMoneyLong={formatMoneyLong}
              />
            )
          }
        </ParentSize>
      </div>
      
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {legend.map((l) => (
          <div key={l.key} className="flex items-center gap-2">
            <span className="inline-block size-3 rounded-sm" style={{ background: l.color }} />
            <span>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

