"use client";

import { useMemo } from "react";
import { ChartWidth } from "./ChartWidth";
import { Group } from "@visx/group";
import { Bar } from "@visx/shape";
import { AxisBottom } from "@visx/axis";
import { GridColumns } from "@visx/grid";
import { scaleLinear, scaleOrdinal } from "@visx/scale";
import { useTooltip, TooltipWithBounds, defaultStyles } from "@visx/tooltip";
import type { MpConfigMetricBreakdown, MpConfigMetricSegment } from "./actions";

type TooltipDatum = {
  metricLabel: string;
  total: number;
  hoveredSegmentKey?: string;
  segments: Array<{
    key: string;
    label: string;
    count: number;
    color: string;
  }>;
};

const tooltipStyles = {
  ...defaultStyles,
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
  padding: "10px 12px",
  maxWidth: 260,
  // Ensure the tooltip anchors to the viewport (not the svg coordinate system)
  // and stays above card/scroll containers.
  position: "fixed",
  zIndex: 1000,
} as const;

// Bottom: axis line (12) + ticks and their labels (~20) + the axis title on its own line below them.
const defaultMargin = { top: 16, right: 20, bottom: 54, left: 180 };

const BAR_HEIGHT = 16;
const BAR_RADIUS = 2;
const ROW_GAP = 12;
const ROW_STEP = BAR_HEIGHT + ROW_GAP;

const palette = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const estimateLabelWidth = (labels: string[], fontSize: number) => {
  if (labels.length === 0) return 0;
  const longest = labels.reduce((max, label) => Math.max(max, label.length), 0);
  return Math.ceil(longest * fontSize * 0.58);
};

function sortSegmentsForTooltip(segments: MpConfigMetricSegment[]) {
  return [...segments].sort((a, b) => {
    const aCount = Number(a.count ?? 0);
    const bCount = Number(b.count ?? 0);
    if (bCount !== aCount) return bCount - aCount;
    return String(a.label ?? "").localeCompare(String(b.label ?? ""));
  });
}

function estimatedChartHeight(metrics: MpConfigMetricBreakdown[]) {
  const margin = defaultMargin;
  const contentInnerHeight =
    metrics.length > 0 ? Math.max(10, metrics.length * ROW_STEP - ROW_GAP) : 10;
  return contentInnerHeight + margin.top + margin.bottom;
}

function Chart({
  width,
  height,
  metrics,
}: {
  width: number;
  height: number;
  metrics: MpConfigMetricBreakdown[];
}) {
  const labelClassName = width < 420 ? "fill-foreground text-[11px]" : "fill-foreground text-[12px]";
  const mutedClassName = width < 420 ? "fill-muted-foreground text-[11px]" : "fill-muted-foreground text-[12px]";
  const mutedSmallClassName = width < 420 ? "fill-muted-foreground text-[10px]" : "fill-muted-foreground text-[11px]";
  const labelFontSize = width < 420 ? 11 : 12;
  const estimatedLabelWidth = estimateLabelWidth(
    metrics.map((metric) => metric.label),
    labelFontSize
  );
  const leftMin = width < 420 ? 100 : width < 640 ? 120 : 130;
  const leftMax = width < 420 ? 140 : width < 640 ? 170 : 190;
  const margin = {
    top: defaultMargin.top,
    right: width < 420 ? 12 : width < 640 ? 16 : defaultMargin.right,
    bottom: defaultMargin.bottom,
    left: clamp(estimatedLabelWidth + 16, leftMin, leftMax),
  };
  const innerWidth = Math.max(10, width - margin.left - margin.right);

  const contentInnerHeight = metrics.length > 0 ? Math.max(10, metrics.length * ROW_STEP - ROW_GAP) : Math.max(10, height);
  const svgHeight = Math.max(height, contentInnerHeight + margin.top + margin.bottom);

  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } =
    useTooltip<TooltipDatum>();

  const xDomainMax = useMemo(() => {
    const max = Math.max(...metrics.map((m) => Number(m.total ?? 0)), 0);
    return Math.max(1, max * 1.08);
  }, [metrics]);

  const xScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, xDomainMax],
        range: [0, innerWidth],
        nice: true,
      }),
    [innerWidth, xDomainMax]
  );

  const colorScale = useMemo(() => {
    const allKeys = Array.from(
      new Set(metrics.flatMap((m) => (m.segments ?? []).map((s) => s.key)))
    );
    return scaleOrdinal<string, string>({
      domain: allKeys,
      range: allKeys.map((_, i) => palette[i % palette.length]),
    });
  }, [metrics]);

  const rowY = (idx: number) => idx * ROW_STEP;

  const onMove = (
    event: React.MouseEvent<SVGRectElement, MouseEvent>,
    metric: MpConfigMetricBreakdown,
    hoveredSegment?: MpConfigMetricSegment
  ) => {
    const rawSegments = (metric.segments ?? []).filter((s) => (s.count ?? 0) > 0);
    const sorted = sortSegmentsForTooltip(rawSegments);
    const segments = sorted.map((seg) => ({
      key: seg.key,
      label: seg.label,
      count: seg.count,
      color: colorScale(seg.key) ?? "var(--chart-1)",
    }));

    // Use viewport coordinates so the tooltip appears where the mouse is,
    // even when the chart is scrolled within the page.
    const clientX = event.clientX;
    const clientY = event.clientY;

    showTooltip({
      tooltipLeft: clientX + 12,
      tooltipTop: clientY + 12,
      tooltipData: {
        metricLabel: metric.label,
        total: metric.total,
        hoveredSegmentKey: hoveredSegment?.key,
        segments,
      },
    });
  };

  return (
    <div className="w-full">
      <svg width={width} height={svgHeight} role="img" aria-label="Mp-config answer breakdown">
        <Group left={margin.left} top={margin.top}>
          <GridColumns
            scale={xScale}
            height={contentInnerHeight}
            stroke="var(--border)"
            strokeOpacity={0.6}
            pointerEvents="none"
          />

          {metrics.map((metric, i) => {
            const y = rowY(i);
            const segments = (metric.segments ?? []).filter((s) => (s.count ?? 0) > 0);
            const total = metric.total ?? 0;

            let acc = 0;
            const lastIdx = Math.max(0, segments.length - 1);

            return (
              <Group key={metric.key} top={y}>
                <text x={-10} y={BAR_HEIGHT / 2} dy="0.35em" textAnchor="end" className={labelClassName}>
                  {metric.label}
                </text>

                {total <= 0 || segments.length === 0 ? (
                  <text x={0} y={BAR_HEIGHT / 2} dy="0.35em" className={mutedClassName}>
                    No answers
                  </text>
                ) : (
                  segments.map((seg, sIdx) => {
                    const x0 = xScale(acc);
                    acc += seg.count;
                    const x1 = xScale(acc);
                    const w = Math.max(0, x1 - x0);
                    if (w <= 0) return null;

                    const rxLeft = sIdx === 0 ? BAR_RADIUS : 0;
                    const rxRight = sIdx === lastIdx ? BAR_RADIUS : 0;

                    // visx Bar only supports a single rx; use clipPath-style rounding by drawing two bars:
                    // 1) main bar (square)
                    // 2) overlay with rx for endcaps using small width on the first/last segments
                    const color = colorScale(seg.key) ?? "var(--chart-1)";

                    return (
                      <Group key={`${metric.key}:${seg.key}`}>
                        <Bar
                          x={x0}
                          y={0}
                          width={w}
                          height={BAR_HEIGHT}
                          fill={color}
                          opacity={0.92}
                          onMouseMove={(e) => onMove(e, metric, seg)}
                          onMouseLeave={hideTooltip}
                        />

                        {rxLeft > 0 ? (
                          <Bar
                            x={x0}
                            y={0}
                            width={Math.min(w, BAR_HEIGHT * 1.2)}
                            height={BAR_HEIGHT}
                            fill={color}
                            rx={BAR_RADIUS}
                            ry={BAR_RADIUS}
                            pointerEvents="none"
                          />
                        ) : null}

                        {rxRight > 0 ? (
                          <Bar
                            x={x0 + Math.max(0, w - Math.min(w, BAR_HEIGHT * 1.2))}
                            y={0}
                            width={Math.min(w, BAR_HEIGHT * 1.2)}
                            height={BAR_HEIGHT}
                            fill={color}
                            rx={BAR_RADIUS}
                            ry={BAR_RADIUS}
                            pointerEvents="none"
                          />
                        ) : null}
                      </Group>
                    );
                  })
                )}

                {/* Total label */}
                <text x={innerWidth} y={BAR_HEIGHT / 2} dy="0.35em" textAnchor="end" className={mutedSmallClassName}>
                  {metric.total}
                </text>
              </Group>
            );
          })}

          <Group top={contentInnerHeight}>
            <AxisBottom
              scale={xScale}
              top={12}
              tickLabelProps={() => ({
                className: mutedSmallClassName,
                textAnchor: "middle",
              })}
              stroke="var(--border)"
              tickStroke="var(--border)"
            />
            <text x={0} y={50} className={mutedSmallClassName}>
              Qty (final responses)
            </text>
          </Group>
        </Group>
      </svg>

      {tooltipOpen && tooltipData ? (
        <TooltipWithBounds left={tooltipLeft} top={tooltipTop} style={tooltipStyles}>
          <div className="text-[12px] font-medium">{tooltipData.metricLabel}</div>
          <div className="mt-2 space-y-1">
            {tooltipData.segments.map((seg) => {
              const pct =
                tooltipData.total > 0 ? Math.round((seg.count / tooltipData.total) * 100) : null;
              const isHovered = tooltipData.hoveredSegmentKey === seg.key;
              return (
                <div
                  key={seg.key}
                  className={[
                    "flex items-center justify-between gap-3 text-[12px]",
                    isHovered ? "text-foreground" : "text-muted-foreground",
                  ].join(" ")}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="inline-block size-2 rounded-[3px]" style={{ background: seg.color }} />
                    <span className={["truncate", isHovered ? "font-medium" : ""].join(" ")}>
                      {seg.label}
                    </span>
                  </div>
                  <div className={["shrink-0 tabular-nums", isHovered ? "font-medium" : ""].join(" ")}>
                    {seg.count}
                    {pct === null ? "" : ` (${pct}%)`}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-2 text-[12px] text-muted-foreground">
            Total: <span className="font-medium text-foreground">{tooltipData.total}</span>
          </div>
        </TooltipWithBounds>
      ) : null}
    </div>
  );
}

export function MpConfigMetricsStackedBarVisx({ metrics }: { metrics: MpConfigMetricBreakdown[] }) {
  const fixedHeight = Math.max(200, estimatedChartHeight(metrics));
  return (
    <div className="w-full overflow-x-auto">
      {/* Phones draw it at the card's width (the chart has a narrow layout under 420px). */}
      <div className="md:min-w-[420px]" style={{ height: fixedHeight }}>
        <ChartWidth>
          {({ width }) => <Chart width={width} height={fixedHeight} metrics={metrics} />}
        </ChartWidth>
      </div>
    </div>
  );
}

