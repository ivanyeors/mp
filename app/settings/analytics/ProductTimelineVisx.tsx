"use client";

import { useMemo, useState } from "react";
import { Group } from "@visx/group";
import { scaleTime, scaleLinear } from "@visx/scale";
import { LinePath } from "@visx/shape";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows, GridColumns } from "@visx/grid";
import { useTooltip, TooltipWithBounds, defaultStyles } from "@visx/tooltip";
import { localPoint } from "@visx/event";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";

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
  color: string;
};

type ProductTimelineVisxProps = {
  products: ProductTimeline[];
  viewMode: "parts" | "products";
  onViewModeChange: (mode: "parts" | "products") => void;
};

const CATEGORY_COLORS: Record<string, string> = {
  cover: "hsl(217 91% 60%)",
  case: "hsl(262 83% 58%)",
  protector: "hsl(142 76% 36%)",
  filling: "hsl(24 95% 53%)",
  packaging: "hsl(43 96% 56%)",
  accessories: "hsl(300 76% 42%)",
  other: "hsl(0 0% 60%)",
  pillow: "hsl(221 83% 53%)",
  bolster: "hsl(262 83% 58%)",
};

const margin = { top: 20, right: 120, bottom: 50, left: 60 };
const tooltipStyles = {
  ...defaultStyles,
  backgroundColor: "hsl(0 0% 0% / 0.9)",
  color: "hsl(0 0% 100%)",
  padding: "12px",
  borderRadius: "8px",
  fontSize: "12px",
};

export function ProductTimelineVisx({
  products,
  viewMode,
  onViewModeChange,
}: ProductTimelineVisxProps) {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(subMonths(new Date(), 5)),
    to: endOfMonth(new Date()),
  });
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

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
  }>();

  const filteredProducts = useMemo(() => {
    return products.map((product) => ({
      ...product,
      data: product.data.filter(
        (d) => d.date >= dateRange.from && d.date <= dateRange.to
      ),
    })).filter((product) => product.data.length > 0);
  }, [products, dateRange]);

  const width = 640;
  const height = 320;
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const xScale = useMemo(
    () =>
      scaleTime<number>({
        domain: [dateRange.from, dateRange.to],
        range: [0, innerWidth],
      }),
    [dateRange, innerWidth]
  );

  const yScale = useMemo(() => {
    const allValues = filteredProducts.flatMap((p) => p.data.map((d) => d.value));
    const maxValue = Math.max(...allValues, 0);
    return scaleLinear<number>({
      domain: [0, maxValue * 1.1],
      range: [innerHeight, 0],
      nice: true,
    });
  }, [filteredProducts, innerHeight]);

  const handleMouseMove = (event: React.MouseEvent<SVGRectElement>) => {
    const point = localPoint(event);
    if (!point) return;

    const x = point.x - margin.left;
    const date = xScale.invert(x);

    // Find the closest data point for each product
    let closestProduct: ProductTimeline | null = null;
    let closestPoint: TimelineDataPoint | null = null;
    let minDistance = Infinity;

    filteredProducts.forEach((product) => {
      if (product.data.length === 0) return;

      // Find closest point in this product's data
      product.data.forEach((dataPoint) => {
        const xPos = xScale(dataPoint.date);
        const yPos = yScale(dataPoint.value);
        const distance = Math.sqrt(
          Math.pow(x - xPos, 2) + Math.pow(point.y - margin.top - yPos, 2)
        );

        if (distance < minDistance) {
          minDistance = distance;
          closestProduct = product;
          closestPoint = dataPoint;
        }
      });
    });

    if (closestProduct && closestPoint && minDistance < 50) {
      const xPos = xScale(closestPoint.date);
      const yPos = yScale(closestPoint.value);

      showTooltip({
        tooltipData: {
          product: closestProduct,
          dataPoint: closestPoint,
        },
        tooltipLeft: xPos + margin.left,
        tooltipTop: yPos + margin.top,
      });
    } else {
      hideTooltip();
    }
  };

  const handleDateRangeSelect = (range: { from?: Date; to?: Date } | undefined) => {
    if (range?.from && range?.to) {
      setDateRange({
        from: startOfMonth(range.from),
        to: endOfMonth(range.to),
      });
      setIsCalendarOpen(false);
    }
  };

  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

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
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <Tabs value={viewMode} onValueChange={(v) => onViewModeChange(v as "parts" | "products")}>
          <TabsList>
            <TabsTrigger value="parts">Parts</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
          </TabsList>
        </Tabs>

        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <CalendarIcon className="h-4 w-4" />
              {format(dateRange.from, "MMM yyyy")} - {format(dateRange.to, "MMM yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="range"
              selected={{ from: dateRange.from, to: dateRange.to }}
              onSelect={handleDateRangeSelect}
              numberOfMonths={2}
              defaultMonth={dateRange.from}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="relative">
        <svg width={width} height={height}>
          <Group left={margin.left} top={margin.top}>
            <GridRows
              scale={yScale}
              width={innerWidth}
              strokeDasharray="3,3"
              stroke="hsl(var(--border))"
              strokeOpacity={0.3}
            />
            <GridColumns
              scale={xScale}
              height={innerHeight}
              strokeDasharray="3,3"
              stroke="hsl(var(--border))"
              strokeOpacity={0.3}
            />

            {filteredProducts.map((product) => (
              <LinePath
                key={product.id}
                data={product.data}
                x={(d) => xScale(d.date)}
                y={(d) => yScale(d.value)}
                stroke={product.color}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

            <AxisBottom
              top={innerHeight}
              scale={xScale}
              stroke="hsl(var(--border))"
              tickStroke="hsl(var(--border))"
              tickLabelProps={{
                fill: "hsl(var(--muted-foreground))",
                fontSize: 11,
                textAnchor: "middle",
              }}
              tickFormat={(date) => format(date as Date, "MMM")}
            />

            <AxisLeft
              scale={yScale}
              stroke="hsl(var(--border))"
              tickStroke="hsl(var(--border))"
              tickLabelProps={{
                fill: "hsl(var(--muted-foreground))",
                fontSize: 11,
                textAnchor: "end",
                dx: -4,
              }}
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
        </svg>

        {/* Legend */}
        <div className="absolute right-0 top-0 flex flex-col gap-1 text-xs">
          {filteredProducts.slice(0, 5).map((product) => (
            <div key={product.id} className="flex items-center gap-2">
              <div
                className="h-2 w-8 rounded"
                style={{ backgroundColor: product.color }}
              />
              <span className="text-muted-foreground truncate max-w-[80px]">
                {product.name}
              </span>
            </div>
          ))}
          {filteredProducts.length > 5 && (
            <div className="text-muted-foreground">
              +{filteredProducts.length - 5} more
            </div>
          )}
        </div>

        {tooltipOpen && tooltipData && (
          <TooltipWithBounds
            key={Math.random()}
            top={tooltipTop}
            left={tooltipLeft}
            style={tooltipStyles}
          >
            <div className="space-y-2">
              <div className="font-semibold">{tooltipData.product.name}</div>
              <div className="space-y-1">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Date:</span>
                  <span>{format(tooltipData.dataPoint.date, "MMM yyyy")}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Value:</span>
                  <span className="font-medium">
                    {currencyFormatter.format(tooltipData.dataPoint.value)}
                  </span>
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
                    <span>
                      {currencyFormatter.format(tooltipData.dataPoint.avgPrice)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </TooltipWithBounds>
        )}
      </div>
    </div>
  );
}
