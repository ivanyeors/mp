"use client";

import React, { useMemo, useRef, useState } from "react";
import { Group } from "@visx/group";
import { BarGroupHorizontal, Bar } from "@visx/shape";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridColumns } from "@visx/grid";
import { scaleBand, scaleLinear, scaleOrdinal } from "@visx/scale";
import { ParentSize } from "@visx/responsive";
import { useTooltip } from "@visx/tooltip";
import { Button } from "@/components/ui/button";

export type CategoryStackDatum = {
  category: string;
  label: string;
  costValue: number;
  msrpValue: number;
  weightedMarginPct: number | null; // still useful for insight text
  pricedItems: number;
  totalOnHand: number;
};

export type ItemStackDatum = {
  id: number;
  category: string;
  label: string;
  onHand: number;
  cost: number;
  msrp: number;
  costValue: number;
  msrpValue: number;
};

const defaultMargin = { top: 16, right: 20, bottom: 32, left: 170 };

type TooltipDatum = {
  label: string;
  segment: "Cost value" | "MSRP value";
  costValue: number;
  msrpValue: number;
  impliedMarginValue: number;
  impliedMarginPct: number | null;
  pricedItems?: number;
  onHand?: number;
  insight: string;
  costLabel: string;
  msrpLabel: string;
  impliedMarginLabel: string;
};

const formatCompactCurrency = (() => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    });
  } catch {
    return null;
  }
})();

function insightForMarginPct(marginPct: number | null) {
  if (marginPct === null || Number.isNaN(marginPct)) return "Missing MSRP or cost for some items.";
  if (marginPct < 25) return "Very thin margin: verify costs and consider repricing.";
  if (marginPct < 40) return "Below 40% target: review cost inputs and MSRP.";
  if (marginPct < 55) return "Near target: small price/cost adjustments could help.";
  return "Healthy margin: keep an eye on cost creep and stock mix.";
}

const seriesKeys = ["costValue", "msrpValue"] as const;
type SeriesKey = (typeof seriesKeys)[number];

const legend = [
  { key: "costValue" as const, label: "Cost value", color: "var(--chart-2)" },
  { key: "msrpValue" as const, label: "MSRP value", color: "var(--chart-1)" },
];

function asMoney(value: number) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "$0";
  return formatCompactCurrency ? formatCompactCurrency.format(n) : String(n.toFixed(0));
}

function Chart({
  width,
  height,
  rows,
  showBottomAxis = true,
  onRowClick,
}: {
  width: number;
  height: number;
  rows: Array<{ label: string; costValue: number; msrpValue: number; meta?: Record<string, unknown> }>;
  showBottomAxis?: boolean;
  onRowClick?: (label: string) => void;
}) {
  const margin = defaultMargin;
  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = Math.max(10, height - margin.top - margin.bottom);

  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } =
    useTooltip<TooltipDatum>();

  const xDomainMax = useMemo(() => {
    const max = Math.max(...rows.map((d) => Math.max(d.costValue ?? 0, d.msrpValue ?? 0)), 0);
    return Math.max(1, max * 1.08);
  }, [rows]);

  const y0Scale = useMemo(
    () =>
      scaleBand<string>({
        domain: rows.map((d) => d.label),
        range: [0, innerHeight],
        padding: 0.22,
      }),
    [innerHeight, rows]
  );

  const y1Scale = useMemo(
    () =>
      scaleBand<string>({
        domain: seriesKeys as unknown as string[],
        range: [0, y0Scale.bandwidth()],
        padding: 0.18,
      }),
    [y0Scale]
  );

  const xScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, xDomainMax],
        range: [0, innerWidth],
        nice: true,
      }),
    [innerWidth, xDomainMax]
  );

  const colorScale = useMemo(
    () =>
      scaleOrdinal<SeriesKey, string>({
        domain: seriesKeys as unknown as SeriesKey[],
        range: ["var(--chart-2)", "var(--chart-1)"],
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
            data={rows}
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
                    const row = rows[barGroup.index];
                    const segment = bar.key === "costValue" ? ("Cost value" as const) : ("MSRP value" as const);
                    const costValue = Number(row.costValue ?? 0);
                    const msrpValue = Number(row.msrpValue ?? 0);
                    const impliedMarginValue = Math.max(0, msrpValue - costValue);
                    const impliedMarginPct = msrpValue > 0 ? (impliedMarginValue / msrpValue) * 100 : null;

                    return (
                      <Bar
                        key={`${barGroup.index}-${bar.index}-${bar.key}`}
                        x={bar.x}
                        y={bar.y}
                        width={bar.width}
                        height={bar.height}
                        fill={bar.color}
                        rx={8}
                        style={{ cursor: onRowClick ? "pointer" : "default" }}
                        onClick={() => onRowClick?.(row.label)}
                        onMouseMove={(evt) => {
                          const el = evt.currentTarget as unknown as Element;
                          const bounds = el.getBoundingClientRect();
                          const left = Math.min(window.innerWidth - 16, bounds.right + 12);
                          const top = Math.min(window.innerHeight - 16, Math.max(16, bounds.top + bounds.height / 2));

                          showTooltip({
                            tooltipData: {
                              label: row.label,
                              segment,
                              costValue,
                              msrpValue,
                              impliedMarginValue,
                              impliedMarginPct,
                              insight: insightForMarginPct(impliedMarginPct),
                              costLabel: asMoney(costValue),
                              msrpLabel: asMoney(msrpValue),
                              impliedMarginLabel: asMoney(impliedMarginValue),
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
          {showBottomAxis && (
            <AxisBottom
              top={innerHeight}
              scale={xScale}
              hideAxisLine
              tickStroke="var(--border)"
              stroke="var(--border)"
              tickFormat={(v) => asMoney(Number(v))}
              tickLabelProps={() => ({
                fill: "var(--muted-foreground)",
                fontSize: 11,
                fontFamily: "ui-sans-serif, system-ui",
                textAnchor: "middle",
                dy: "0.6em",
              })}
            />
          )}
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
            maxWidth: 320,
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 600 }}>{tooltipData.label}</div>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{tooltipData.insight}</div>
            <div style={{ display: "grid", gap: 2, fontSize: 12 }}>
              <div>
                <span style={{ color: "var(--muted-foreground)" }}>Hovered segment:</span>{" "}
                <span style={{ fontWeight: 600 }}>{tooltipData.segment}</span>
              </div>
              <div>
                <span style={{ color: "var(--muted-foreground)" }}>Cost value:</span>{" "}
                <span style={{ fontWeight: 600 }}>{tooltipData.costLabel}</span>
              </div>
              <div>
                <span style={{ color: "var(--muted-foreground)" }}>MSRP value:</span>{" "}
                <span style={{ fontWeight: 600 }}>{tooltipData.msrpLabel}</span>
              </div>
              <div>
                <span style={{ color: "var(--muted-foreground)" }}>Implied margin:</span>{" "}
                <span style={{ fontWeight: 600 }}>{tooltipData.impliedMarginLabel}</span>
              </div>
              {tooltipData.impliedMarginPct !== null && (
                <div>
                  <span style={{ color: "var(--muted-foreground)" }}>Implied margin %:</span>{" "}
                  <span style={{ fontWeight: 600 }}>{tooltipData.impliedMarginPct.toFixed(1)}%</span>
                </div>
              )}
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function MarginByCategoryVisx({
  categories,
  items,
  height = 320,
}: {
  categories: CategoryStackDatum[];
  items: ItemStackDatum[];
  height?: number;
}) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categoryByLabel = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => m.set(c.label, c.category));
    return m;
  }, [categories]);

  const selectedLabel = useMemo(() => {
    if (!selectedCategory) return null;
    return categories.find((c) => c.category === selectedCategory)?.label ?? null;
  }, [categories, selectedCategory]);

  const summaryRows = useMemo(
    () =>
      categories
        .filter((c) => (c.costValue ?? 0) > 0 || (c.msrpValue ?? 0) > 0)
        .map((c) => ({
          label: c.label,
          costValue: c.costValue,
          msrpValue: c.msrpValue,
          meta: { category: c.category },
        })),
    [categories]
  );

  const drillRows = useMemo(() => {
    if (!selectedCategory) return [];
    return items
      .filter((it) => it.category === selectedCategory)
      .filter((it) => it.msrpValue > 0 || it.costValue > 0)
      .sort((a, b) => (b.msrpValue + b.costValue) - (a.msrpValue + a.costValue))
      .slice(0, 12)
      .map((it) => ({
        label: it.label,
        costValue: it.costValue,
        msrpValue: it.msrpValue,
        meta: { id: it.id, onHand: it.onHand },
      }));
  }, [items, selectedCategory]);

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {selectedCategory ? `Top parts in ${selectedLabel ?? "selected category"}` : "Click a category to drill down into parts."}
        </div>
        {selectedCategory && (
          <Button type="button" variant="outline" size="sm" onClick={() => setSelectedCategory(null)}>
            Back to categories
          </Button>
        )}
      </div>

      <div className="h-[320px] w-full">
        <ParentSize>
          {({ width }) =>
            width < 10 ? null : (
              <Chart
                width={width}
                height={height}
                rows={selectedCategory ? drillRows : summaryRows}
                showBottomAxis
                onRowClick={(label) => {
                  if (selectedCategory) return;
                  const key = categoryByLabel.get(label) ?? null;
                  if (key) setSelectedCategory(key);
                }}
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

