"use client";

import { useMemo } from "react";
import { Group } from "@visx/group";
import { scaleTime, scaleLinear } from "@visx/scale";
import { LinePath } from "@visx/shape";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows, GridColumns } from "@visx/grid";
import { useTooltip, TooltipWithBounds, defaultStyles } from "@visx/tooltip";
import { localPoint } from "@visx/event";
import { ParentSize } from "@visx/responsive";
import { addMonths, format, startOfMonth } from "date-fns";

type TimelineDataPoint = {
  date: Date;
  value: number;
  quantity?: number;
  avgPrice?: number;
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
  onViewModeChange: (mode: "parts" | "products") => void;
  dateRange: { from: Date; to: Date };
};

const palette = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"] as const;

const tooltipStyles = {
  ...defaultStyles,
  backgroundColor: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
  padding: "12px 12px",
  borderRadius: "10px",
  fontSize: "12px",
};

function Chart({
  width,
  height,
  products,
  dateRange,
  viewMode,
}: {
  width: number;
  height: number;
  products: ProductTimeline[];
  dateRange: { from: Date; to: Date };
  viewMode: "parts" | "products";
}) {
  const margin = useMemo(
    () => ({
      top: 16,
      right: 16,
      bottom: 44,
      left: 56,
    }),
    []
  );

  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = Math.max(10, height - margin.top - margin.bottom);

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
        total += match?.value ?? 0;
      }
      return total;
    });
  }, [months, products]);

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
    product: ProductTimeline;
    dataPoint: TimelineDataPoint;
    color: string;
    monthTotal: number;
  }>();

  const xScale = useMemo(
    () =>
      scaleTime<number>({
        domain: [dateRange.from, dateRange.to],
        range: [0, innerWidth],
      }),
    [dateRange, innerWidth]
  );

  const yScale = useMemo(() => {
    const allValues = products.flatMap((p) => p.data.map((d) => d.value));
    const maxValue = Math.max(...allValues, 0);
    return scaleLinear<number>({
      domain: [0, maxValue * 1.1],
      range: [innerHeight, 0],
      nice: true,
    });
  }, [products, innerHeight]);

  const handleMouseMove = (event: React.MouseEvent<SVGRectElement>) => {
    const point = localPoint(event);
    if (!point) return;

    const x = point.x - margin.left;
    const y = point.y - margin.top;
    const date = xScale.invert(x);

    let closestProduct: ProductTimeline | null = null;
    let closestPoint: TimelineDataPoint | null = null;
    let closestColor = palette[0];
    let minDistance = Infinity;

    products.forEach((product, idx) => {
      if (product.data.length === 0) return;
      const color = palette[idx % palette.length];

      product.data.forEach((dataPoint) => {
        const xPos = xScale(dataPoint.date);
        const yPos = yScale(dataPoint.value);
        const distance = Math.sqrt(Math.pow(x - xPos, 2) + Math.pow(y - yPos, 2));

        if (distance < minDistance) {
          minDistance = distance;
          closestProduct = product;
          closestPoint = dataPoint;
          closestColor = color;
        }
      });
    });

    // Don't show tooltip if we're far from any line.
    if (!closestProduct || !closestPoint || minDistance > 44) {
      hideTooltip();
      return;
    }

    showTooltip({
      tooltipData: {
        product: closestProduct,
        dataPoint: closestPoint,
        color: closestColor,
        monthTotal: products.reduce((sum, p) => {
          const month = startOfMonth(closestPoint.date);
          const match = p.data.find(
            (pt) => pt.date.getFullYear() === month.getFullYear() && pt.date.getMonth() === month.getMonth()
          );
          return sum + (match?.value ?? 0);
        }, 0),
      },
      tooltipLeft: xScale(date) + margin.left,
      tooltipTop: yScale(closestPoint.value) + margin.top,
    });
  };

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }),
    []
  );

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
            const color = palette[idx % palette.length];
            return (
              <LinePath
                key={product.id}
                data={product.data}
                x={(d) => xScale(d.date)}
                y={(d) => yScale(d.value)}
                stroke={color}
                strokeWidth={2.5}
                strokeOpacity={0.95}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}

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
            tickFormat={(date) => format(date as Date, "MMM")}
          />

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
            tickFormat={(value) =>
              new Intl.NumberFormat("en-US", {
                notation: "compact",
                maximumFractionDigits: 0,
              }).format(value as number)
            }
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
                fontSize={11}
                fontFamily="ui-sans-serif, system-ui"
                textAnchor="middle"
                style={{ pointerEvents: "none" }}
              >
                {compactNumber.format(total)}
              </text>
            );
          });
        })()}
      </svg>

      {/* Legend (below chart) */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {products.slice(0, 5).map((product, idx) => {
          const color = palette[idx % palette.length];
          return (
            <div key={product.id} className="flex items-center gap-2">
              <div className="size-2 rounded-sm" style={{ backgroundColor: color }} />
              <span className="text-muted-foreground">{product.name}</span>
            </div>
          );
        })}
        {products.length > 5 && <span className="text-muted-foreground">+{products.length - 5} more</span>}
      </div>

      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          key={`${tooltipData.product.id}-${tooltipData.dataPoint.date.toISOString()}-${viewMode}`}
          top={tooltipTop}
          left={tooltipLeft}
          style={tooltipStyles}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold">{tooltipData.product.name}</div>
              <div className="h-2 w-10 rounded" style={{ backgroundColor: tooltipData.color }} />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Date:</span>
                <span>{format(tooltipData.dataPoint.date, "MMM yyyy")}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Month total:</span>
                <span className="font-medium">{currencyFormatter.format(tooltipData.monthTotal)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Value:</span>
                <span className="font-medium">{currencyFormatter.format(tooltipData.dataPoint.value)}</span>
              </div>
              {tooltipData.dataPoint.quantity !== undefined && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Quantity:</span>
                  <span>{tooltipData.dataPoint.quantity} units</span>
                </div>
              )}
              {tooltipData.dataPoint.avgPrice !== undefined && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Avg Price:</span>
                  <span>{currencyFormatter.format(tooltipData.dataPoint.avgPrice)}</span>
                </div>
              )}
            </div>
          </div>
        </TooltipWithBounds>
      )}
    </div>
  );
}

export function ProductTimelineVisx({
  products,
  viewMode,
  onViewModeChange,
  dateRange,
}: ProductTimelineVisxProps) {
  const filteredProducts = useMemo(() => {
    return products.map((product) => ({
      ...product,
      data: product.data.filter(
        (d) => d.date >= dateRange.from && d.date <= dateRange.to
      ),
    })).filter((product) => product.data.length > 0);
  }, [products, dateRange]);

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
    <div className="w-full">
      <ParentSize>
        {({ width }) =>
          width < 10 ? null : (
            <Chart width={width} height={320} products={filteredProducts} dateRange={dateRange} viewMode={viewMode} />
          )
        }
      </ParentSize>
    </div>
  );
}
