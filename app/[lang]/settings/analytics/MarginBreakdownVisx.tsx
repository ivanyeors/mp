"use client";

import React, { useId, useMemo, useState } from "react";
import { Group } from "@visx/group";
import { Bar } from "@visx/shape";
import { AxisBottom } from "@visx/axis";
import { GridColumns } from "@visx/grid";
import { scaleLinear } from "@visx/scale";
import { ParentSize } from "@visx/responsive";
import { useTooltip } from "@visx/tooltip";
import { Button } from "@/components/ui/button";

/** One row of a sales breakdown, as `buildSalesReport` returns it. */
export type MarginBreakdownRow = {
  key: string;
  label: string;
  parent: string | null;
  revenue: number;
  costedRevenue: number;
  uncostedRevenue: number;
  cogs: number;
  grossMargin: number;
  marginPct: number | null;
  units: number;
};

const COST_COLOR = "var(--chart-2)";
const REVENUE_COLOR = "var(--chart-1)";

const legend = [
  { key: "cogs", label: "Cost (COGS)", swatch: { background: COST_COLOR } },
  { key: "revenue", label: "Revenue", swatch: { background: REVENUE_COLOR } },
  {
    key: "uncosted",
    label: "Revenue with no cost",
    swatch: {
      background: `repeating-linear-gradient(135deg, ${REVENUE_COLOR} 0 2px, transparent 2px 5px)`,
      boxShadow: `inset 0 0 0 1px ${REVENUE_COLOR}`,
    },
  },
];

const BAR_HEIGHT = 14;
const INNER_BAR_GAP = 2;
const ROW_GAP = 14;
const GROUP_HEIGHT = BAR_HEIGHT * 2 + INNER_BAR_GAP;
const ROW_STEP = GROUP_HEIGHT + ROW_GAP;
const MARGIN = { top: 8, bottom: 32 };

const compactCurrency = new Intl.NumberFormat("en-SG", {
  style: "currency",
  currency: "SGD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const currency = new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("en-SG");

function pct(value: number | null): string {
  return value == null || Number.isNaN(value) ? "—" : `${value.toFixed(1)}%`;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function Chart({
  width,
  rows,
  onRowClick,
}: {
  width: number;
  rows: MarginBreakdownRow[];
  onRowClick?: (row: MarginBreakdownRow) => void;
}) {
  const labelFontSize = width < 420 ? 11 : 12;
  const longest = rows.reduce((max, r) => Math.max(max, r.label.length), 0);
  const left = clamp(Math.ceil(longest * labelFontSize * 0.58) + 16, width < 420 ? 96 : 120, width < 420 ? 140 : 200);
  const right = width < 420 ? 12 : 20;
  const innerWidth = Math.max(10, width - left - right);
  const innerHeight = Math.max(10, rows.length * ROW_STEP - ROW_GAP);
  const height = innerHeight + MARGIN.top + MARGIN.bottom;
  const [hovered, setHovered] = useState<string | null>(null);
  const hatchId = `uncosted-hatch-${useId().replace(/:/g, "")}`;
  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } =
    useTooltip<MarginBreakdownRow>();

  const xScale = useMemo(() => {
    const max = Math.max(...rows.map((r) => Math.max(r.revenue, r.cogs)), 0);
    return scaleLinear<number>({ domain: [0, Math.max(1, max * 1.05)], range: [0, innerWidth], nice: true });
  }, [rows, innerWidth]);

  const onMove = (evt: React.MouseEvent<SVGElement>, row: MarginBreakdownRow) => {
    setHovered(row.key);
    showTooltip({ tooltipData: row, tooltipLeft: evt.clientX + 12, tooltipTop: evt.clientY + 12 });
  };
  const onLeave = () => {
    setHovered(null);
    hideTooltip();
  };

  return (
    <div className="relative" onMouseLeave={onLeave}>
      <svg width={width} height={height} role="img" aria-label="Revenue and cost by row">
        <defs>
          <pattern id={hatchId} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="5" height="5" fill="var(--card)" />
            <rect width="2" height="5" fill={REVENUE_COLOR} />
          </pattern>
        </defs>
        <Group top={MARGIN.top} left={left}>
          <GridColumns scale={xScale} height={innerHeight} stroke="var(--border)" strokeOpacity={0.6} strokeDasharray="3 3" />
          {rows.map((row, i) => {
            const y = i * ROW_STEP;
            const costW = xScale(row.cogs);
            const costedW = xScale(row.costedRevenue);
            const uncostedW = Math.max(0, xScale(row.revenue) - costedW);
            const clickable = Boolean(onRowClick);
            const dim = hovered != null && hovered !== row.key;
            return (
              <Group
                key={row.key}
                top={y}
                opacity={dim ? 0.55 : 1}
                style={{ cursor: clickable ? "pointer" : "default" }}
                onClick={() => onRowClick?.(row)}
                onMouseMove={(evt) => onMove(evt, row)}
              >
                {/* Hit target: the whole row, not only the thin bars. */}
                <rect x={-left} y={-ROW_GAP / 2} width={left + innerWidth} height={ROW_STEP} fill="transparent" />
                <Bar x={0} y={0} width={costW} height={BAR_HEIGHT} rx={4} fill={COST_COLOR} />
                <Bar x={0} y={BAR_HEIGHT + INNER_BAR_GAP} width={costedW} height={BAR_HEIGHT} rx={4} fill={REVENUE_COLOR} />
                {uncostedW > 0 && (
                  <Bar
                    x={costedW + (costedW > 0 ? 2 : 0)}
                    y={BAR_HEIGHT + INNER_BAR_GAP}
                    width={Math.max(0, uncostedW - (costedW > 0 ? 2 : 0))}
                    height={BAR_HEIGHT}
                    rx={4}
                    fill={`url(#${hatchId})`}
                    stroke={REVENUE_COLOR}
                    strokeWidth={1}
                  />
                )}
                <text
                  x={-8}
                  y={GROUP_HEIGHT / 2}
                  dy="0.33em"
                  textAnchor="end"
                  fontSize={labelFontSize}
                  fill={hovered === row.key ? "var(--foreground)" : "var(--muted-foreground)"}
                  style={{ textDecoration: clickable && hovered === row.key ? "underline" : "none", userSelect: "none" }}
                >
                  {row.label}
                </text>
              </Group>
            );
          })}
          <AxisBottom
            top={innerHeight}
            scale={xScale}
            hideAxisLine
            tickStroke="var(--border)"
            numTicks={Math.max(2, Math.floor(innerWidth / 90))}
            tickFormat={(v) => compactCurrency.format(Number(v))}
            tickLabelProps={() => ({
              fill: "var(--muted-foreground)",
              fontSize: width < 420 ? 10 : 11,
              textAnchor: "middle",
              dy: "0.6em",
            })}
          />
        </Group>
      </svg>

      {tooltipOpen && tooltipData && (
        <div
          className="pointer-events-none fixed z-50 max-w-[300px] rounded-[10px] border bg-popover px-3 py-2.5 text-popover-foreground shadow-lg"
          style={{ left: tooltipLeft, top: tooltipTop }}
        >
          <div className="text-sm font-semibold">{tooltipData.label}</div>
          <dl className="mt-1.5 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-xs">
            <dt className="text-muted-foreground">Revenue</dt>
            <dd className="text-right font-medium tabular-nums">{currency.format(tooltipData.revenue)}</dd>
            <dt className="text-muted-foreground">Cost (COGS)</dt>
            <dd className="text-right font-medium tabular-nums">{currency.format(tooltipData.cogs)}</dd>
            <dt className="text-muted-foreground">Gross margin</dt>
            <dd className="text-right font-medium tabular-nums">{currency.format(tooltipData.grossMargin)}</dd>
            <dt className="text-muted-foreground">Margin %</dt>
            <dd className="text-right font-medium tabular-nums">{pct(tooltipData.marginPct)}</dd>
            <dt className="text-muted-foreground">Units</dt>
            <dd className="text-right font-medium tabular-nums">{integer.format(tooltipData.units)}</dd>
          </dl>
          {tooltipData.uncostedRevenue > 0 && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {currency.format(tooltipData.uncostedRevenue)} of revenue has no cost, so it is left out of the margin.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function BreakdownTable({ rows }: { rows: MarginBreakdownRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Name</th>
            <th className="py-2 pr-3 text-right font-medium">Units</th>
            <th className="py-2 pr-3 text-right font-medium">Revenue</th>
            <th className="py-2 pr-3 text-right font-medium">Cost</th>
            <th className="py-2 pr-3 text-right font-medium">Gross margin</th>
            <th className="py-2 pr-3 text-right font-medium">Margin %</th>
            <th className="py-2 text-right font-medium">No cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b last:border-0">
              <td className="py-1.5 pr-3">{r.label}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{integer.format(r.units)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{currency.format(r.revenue)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{currency.format(r.cogs)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{currency.format(r.grossMargin)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{pct(r.marginPct)}</td>
              <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                {r.uncostedRevenue > 0 ? currency.format(r.uncostedRevenue) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Revenue against COGS, top level first; a top-level row drills into its
 * children. Margin is over costed revenue only, and revenue with no cost is
 * drawn hatched beside it, never counted as profit.
 */
export function MarginBreakdownVisx({
  rows,
  emptyText,
  drillHint,
  drillTitle = () => "by item",
}: {
  rows: MarginBreakdownRow[];
  emptyText: string;
  drillHint: string;
  /** What a drilled row's children are, e.g. "by size". */
  drillTitle?: (parentKey: string) => string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  const top = useMemo(() => rows.filter((r) => r.parent == null), [rows]);
  const selectedRow = selected ? top.find((r) => r.key === selected) ?? null : null;
  const visible = useMemo(
    () => (selectedRow ? rows.filter((r) => r.parent === selectedRow.key) : top).slice(0, 15),
    [rows, top, selectedRow],
  );

  if (top.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-muted-foreground">
          {selectedRow ? `${selectedRow.label}: ${drillTitle(selectedRow.key)}` : drillHint}
        </div>
        <div className="flex gap-2">
          {selectedRow && (
            <Button type="button" variant="outline" size="sm" onClick={() => setSelected(null)}>
              Back
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowTable((v) => !v)}>
            {showTable ? "Show chart" : "Show table"}
          </Button>
        </div>
      </div>

      {showTable ? (
        <BreakdownTable rows={visible} />
      ) : (
        <div className="w-full overflow-x-auto">
          <div className="min-w-[360px]">
            <ParentSize debounceTime={50}>
              {({ width }) =>
                width < 10 ? (
                  <div style={{ height: visible.length * ROW_STEP + MARGIN.top + MARGIN.bottom }} />
                ) : (
                  <Chart
                    width={width}
                    rows={visible}
                    onRowClick={selectedRow ? undefined : (row) => setSelected(row.key)}
                  />
                )
              }
            </ParentSize>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground sm:text-xs">
        {legend.map((l) => (
          <div key={l.key} className="flex items-center gap-2">
            <span className="inline-block size-3 rounded-sm" style={l.swatch} />
            <span>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
