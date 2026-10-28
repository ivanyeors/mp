"use client";

import { useCallback, useMemo, type CSSProperties } from "react";
import { Group } from "@visx/group";
import { scaleTime, scaleLinear } from "@visx/scale";
import { LinePath } from "@visx/shape";
import { curveMonotoneX } from "@visx/curve";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows, GridColumns } from "@visx/grid";
import { useTooltip, TooltipWithBounds, defaultStyles } from "@visx/tooltip";
import { localPoint } from "@visx/event";
import { ParentSize } from "@visx/responsive";
import { addMonths, format, startOfMonth } from "date-fns";

type TimelineDataPoint = {
  date: Date;
  units: number;
  revenue: number;
};

type ProductTimeline = {
  id: string;
  name: string;
  category: string;
  data: TimelineDataPoint[];
  color?: string;
};

type ProductTimelineVisxProps = {
  products: ProductTimeline[];
  viewMode: "parts" | "products";
  dateRange: { from: Date; to: Date };
  metric: "units" | "revenue";
  currency?: string | null;
};

const palette = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"] as const;

/** Series drawn on their own; the rest fold into one, so no colour is ever reused. */
const NAMED_SERIES = palette.length - 1;

const tooltipStyles: CSSProperties = {
  ...(defaultStyles as CSSProperties),
  backgroundColor: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
  padding: "12px 12px",
  borderRadius: "10px",
  fontSize: "12px",
  position: "fixed",
  zIndex: 1000,
};

function Chart({
  width,
  height,
  products,
  dateRange,
  viewMode,
  metric,
  currency,
}: {
  width: number;
  height: number;
  products: ProductTimeline[];
  dateRange: { from: Date; to: Date };
  viewMode: "parts" | "products";
  metric: "units" | "revenue";
  currency?: string | null;
}) {
  const margin =
    width < 420
      ? { top: 12, right: 12, bottom: 36, left: 44 }
      : { top: 16, right: 16, bottom: 44, left: 56 };
  const axisFontSize = width < 420 ? 10 : 11;

  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = Math.max(10, height - margin.top - margin.bottom);

  const valueForMetric = useCallback(
    (d: TimelineDataPoint) => (metric === "revenue" ? d.revenue : d.units),
    [metric]
  );

  const months = useMemo(() => {
    const start = startOfMonth(dateRange.from);
    const end = startOfMonth(dateRange.to);
    const acc: Date[] = [];
    for (let d = start; d <= end; d = addMonths(d, 1)) {
      acc.push(d);
    }
    return acc;
  }, [dateRange.from, dateRange.to]);

  const monthTotals = useMemo(() => {
    return months.map((month) => {
      let total = 0;
      for (const product of products) {
        const match = product.data.find(
          (pt) => pt.date.getFullYear() === month.getFullYear() && pt.date.getMonth() === month.getMonth()
        );
        total += match ? valueForMetric(match) : 0;
      }
      return total;
    });
  }, [months, products, valueForMetric]);

  const compactNumber = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    []
  );

  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<{
    month: Date;
    monthTotal: number;
    breakdown: Array<{
      id: string;
      name: string;
      color: string;
      value: number;
      units: number;
      revenue: number;
    }>;
  }>();

  // Points sit on each month's 1st, so the axis runs first month to last month;
  // ending at the range's last day left an empty month after the last point.
  const xScale = useMemo(() => {
    const first = months[0] ?? startOfMonth(dateRange.from);
    const last = months[months.length - 1] ?? first;
    const domain: [Date, Date] =
      first.getTime() === last.getTime()
        ? [addMonths(first, -1), addMonths(first, 1)]
        : [first, last];
    return scaleTime<number>({ domain, range: [0, innerWidth] });
  }, [months, dateRange.from, innerWidth]);

  // One tick per month (thinned to fit), never several ticks inside one month.
  const monthTicks = useMemo(() => {
    const step = Math.max(1, Math.ceil(months.length / Math.max(2, Math.floor(innerWidth / 70))));
    return months.filter((_, idx) => idx % step === 0);
  }, [months, innerWidth]);
  const spansYears =
    months.length > 0 && months[0].getFullYear() !== months[months.length - 1].getFullYear();

  const yScale = useMemo(() => {
    const allValues = products.flatMap((p) => p.data.map((d) => valueForMetric(d)));
    const maxValue = Math.max(...allValues, 0);
    return scaleLinear<number>({
      domain: [0, maxValue * 1.1],
      range: [innerHeight, 0],
      nice: true,
    });
  }, [products, innerHeight, valueForMetric]);

  const handleMouseMove = (event: React.MouseEvent<SVGRectElement>) => {
    const point = localPoint(event);
    if (!point) return;

    const x = point.x - margin.left;
    const date = xScale.invert(x);

    // Find nearest month bucket and show a month-level tooltip (works anywhere in the plot area).
    const nearestMonth = months.reduce<Date | null>((best, month) => {
      if (!best) return month;
      const dt = Math.abs(date.getTime() - month.getTime());
      const bt = Math.abs(date.getTime() - best.getTime());
      return dt < bt ? month : best;
    }, null);
    if (!nearestMonth) {
      hideTooltip();
      return;
    }

    const monthStart = startOfMonth(nearestMonth);
    const monthIndex = months.findIndex(
      (m) => m.getFullYear() === monthStart.getFullYear() && m.getMonth() === monthStart.getMonth()
    );
    const monthTotal = monthIndex >= 0 ? (monthTotals[monthIndex] ?? 0) : 0;

    const breakdown = products
      .map((product, idx) => {
        const color = product.color ?? palette[Math.min(idx, palette.length - 1)];
        const match =
          product.data.find(
            (pt) =>
              pt.date.getFullYear() === monthStart.getFullYear() && pt.date.getMonth() === monthStart.getMonth()
          ) ?? null;
        return {
          id: product.id,
          name: product.name,
          color,
          value: match ? valueForMetric(match) : 0,
          units: match ? match.units : 0,
          revenue: match ? match.revenue : 0,
        };
      })
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value);

    showTooltip({
      tooltipData: {
        month: monthStart,
        monthTotal,
        breakdown,
      },
      tooltipLeft: event.clientX + 12,
      tooltipTop: event.clientY + 12,
    });
  };

  const currencyFormatter = useMemo(() => {
    const cur = (currency ?? "SGD").toUpperCase();
    return new Intl.NumberFormat("en-SG", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 0,
    });
  }, [currency]);

  const yTickFormatter = useMemo(() => {
    if (metric === "revenue") {
      return (value: unknown) => currencyFormatter.format(Number(value));
    }
    const fmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 0 });
    return (value: unknown) => fmt.format(Number(value));
  }, [currencyFormatter, metric]);

  return (
    <div className="w-full">
      <svg width={width} height={height} style={{ width: "100%", height: "100%" }} className="block">
        <Group left={margin.left} top={margin.top}>
          <GridRows
            scale={yScale}
            width={innerWidth}
            strokeDasharray="3 3"
            stroke="var(--border)"
            strokeOpacity={0.45}
          />
          <GridColumns
            scale={xScale}
            height={innerHeight}
            strokeDasharray="3 3"
            stroke="var(--border)"
            strokeOpacity={0.45}
          />

          {products.map((product, idx) => {
            const color = product.color ?? palette[Math.min(idx, palette.length - 1)];
            return (
              <LinePath
                key={product.id}
                data={product.data}
                x={(d) => xScale(d.date)}
                y={(d) => yScale(valueForMetric(d))}
                stroke={color}
                strokeWidth={2}
                strokeOpacity={0.95}
                strokeLinecap="round"
                strokeLinejoin="round"
                curve={curveMonotoneX}
              />
            );
          })}

          <AxisBottom
            top={innerHeight}
            scale={xScale}
            stroke="var(--border)"
            tickStroke="var(--border)"
            tickValues={monthTicks}
            tickLabelProps={() => ({
              fill: "var(--muted-foreground)",
              fontSize: axisFontSize,
              textAnchor: "middle",
              dy: "0.6em",
            })}
            tickFormat={(date) => format(date as Date, spansYears ? "MMM yy" : "MMM")}
          />

          <AxisLeft
            scale={yScale}
            stroke="var(--border)"
            tickStroke="var(--border)"
            numTicks={Math.max(2, Math.floor(innerHeight / 44))}
            tickLabelProps={() => ({
              fill: "var(--muted-foreground)",
              fontSize: axisFontSize,
              textAnchor: "end",
              dx: "-0.4em",
              dy: "0.33em",
            })}
            tickFormat={yTickFormatter}
          />

          <rect
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            onMouseMove={handleMouseMove}
            onMouseLeave={hideTooltip}
          />
        </Group>

        {/* Monthly annotations (total across series), drawn in SVG space to avoid clipping */}
        {(() => {
          const desired = Math.max(2, Math.floor(innerWidth / 110));
          const step = Math.max(1, Math.ceil(months.length / desired));
          const y = Math.max(10, margin.top - 8);

          return months.map((month, idx) => {
            if (idx % step !== 0 && idx !== months.length - 1) return null;
            const x = xScale(month) + margin.left;
            const total = monthTotals[idx] ?? 0;
            return (
              <text
                key={month.toISOString()}
                x={x}
                y={y}
                fill="var(--muted-foreground)"
                fontSize={axisFontSize}
                textAnchor="middle"
                style={{ pointerEvents: "none" }}
              >
                {metric === "revenue" ? currencyFormatter.format(total) : compactNumber.format(total)}
              </text>
            );
          });
        })()}
      </svg>

      {/* Legend (below chart) */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:gap-x-4 sm:text-xs">
        {products.map((product, idx) => {
          const color = product.color ?? palette[Math.min(idx, palette.length - 1)];
          return (
            <div key={product.id} className="flex items-center gap-2">
              <div className="size-2 rounded-sm" style={{ backgroundColor: color }} />
              <span className="text-muted-foreground">{product.name}</span>
            </div>
          );
        })}
      </div>

      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          key={`${tooltipData.month.toISOString()}-${viewMode}-${metric}`}
          top={tooltipTop}
          left={tooltipLeft}
          style={tooltipStyles}
        >
          <div className="space-y-2">
            <div className="font-semibold">{format(tooltipData.month, "MMM yyyy")}</div>
            <div className="space-y-1">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Total:</span>
                <span className="font-medium">
                  {metric === "revenue"
                    ? currencyFormatter.format(tooltipData.monthTotal)
                    : compactNumber.format(tooltipData.monthTotal)}
                </span>
              </div>
            </div>

            {tooltipData.breakdown.length > 0 ? (
              <div className="space-y-1">
                <div className="text-[11px] text-muted-foreground">
                  {viewMode === "products" ? "Products" : "Parts"} (top {Math.min(8, tooltipData.breakdown.length)})
                </div>
                {tooltipData.breakdown.slice(0, 8).map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 text-[12px]">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="inline-block size-2 rounded-[3px]" style={{ backgroundColor: row.color }} />
                      <span className="truncate text-muted-foreground">{row.name}</span>
                    </div>
                    <div className="shrink-0 font-medium tabular-nums">
                      {metric === "revenue" ? currencyFormatter.format(row.value) : compactNumber.format(row.value)}
                    </div>
                  </div>
                ))}
                {tooltipData.breakdown.length > 8 ? (
                  <div className="text-[11px] text-muted-foreground">+{tooltipData.breakdown.length - 8} more</div>
                ) : null}
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground">No series values for this month.</div>
            )}
          </div>
        </TooltipWithBounds>
      )}
    </div>
  );
}

export function ProductTimelineVisx({
  products,
  viewMode,
  dateRange,
  metric,
  currency,
}: ProductTimelineVisxProps) {
  const filteredProducts = useMemo(() => {
    const inRange = products
      .map((product) => ({
        ...product,
        data: product.data.filter((d) => d.date >= dateRange.from && d.date <= dateRange.to),
      }))
      .filter((product) => product.data.length > 0);
    // Ranked by revenue over the range, whichever metric is shown, so switching
    // Units ⇄ Revenue never repaints a series. Past four, the rest fold into one
    // line in the last colour, so a colour never stands for two series.
    const total = (p: ProductTimeline) => p.data.reduce((sum, d) => sum + d.revenue, 0);
    const ranked = [...inRange].sort((a, b) => total(b) - total(a) || a.name.localeCompare(b.name));
    if (ranked.length <= palette.length) {
      return ranked.map((p, idx) => ({ ...p, color: palette[idx] }));
    }
    const named = ranked.slice(0, NAMED_SERIES).map((p, idx) => ({ ...p, color: palette[idx] }));
    const rest = ranked.slice(NAMED_SERIES);
    const folded: ProductTimeline = {
      id: "__rest__",
      name: `All others (${rest.length})`,
      category: "rest",
      color: palette[NAMED_SERIES],
      data: rest[0].data.map((pt, i) => ({
        date: pt.date,
        units: rest.reduce((sum, p) => sum + (p.data[i]?.units ?? 0), 0),
        revenue: rest.reduce((sum, p) => sum + (p.data[i]?.revenue ?? 0), 0),
      })),
    };
    return [...named, folded];
  }, [products, dateRange]);

  const months = useMemo(() => {
    const start = startOfMonth(dateRange.from);
    const end = startOfMonth(dateRange.to);
    const acc: Date[] = [];
    for (let d = start; d <= end; d = addMonths(d, 1)) {
      acc.push(d);
    }
    return acc;
  }, [dateRange.from, dateRange.to]);

  const minWidth = Math.max(520, months.length * 90);

  if (filteredProducts.length === 0) {
    return (
      <div className="flex h-[320px] items-center justify-center">
        <p className="text-sm text-muted-foreground">
          No data available for the selected date range.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[520px]" style={{ minWidth }}>
        <ParentSize>
          {({ width }) =>
            width < 10 ? null : (
              <Chart
                width={width}
                height={320}
                products={filteredProducts}
                dateRange={dateRange}
                viewMode={viewMode}
                metric={metric}
                currency={currency}
              />
            )
          }
        </ParentSize>
      </div>
    </div>
  );
}
