"use client";

import { useMemo, type CSSProperties } from "react";
import { Group } from "@visx/group";
import { scaleLinear, scaleTime } from "@visx/scale";
import { AreaStack, Line } from "@visx/shape";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { useTooltip, TooltipWithBounds, defaultStyles } from "@visx/tooltip";
import { localPoint } from "@visx/event";
import { ParentSize } from "@visx/responsive";
import { format } from "date-fns";
import { AnnotationMarkers, type ChartAnnotation } from "./AnnotationMarkers";
import { MIX_SERIES, MIX_SERIES_LABELS, type MixBucket, type MixSeries } from "@/lib/analytics/channel-mix";

/**
 * Categorical slots 1–5 of the dataviz reference palette, validated for both
 * modes (light: all checks pass, 3 slots < 3:1 contrast → legend + table view
 * carry identity; dark: all pass). The site's --chart-* tokens fail as a
 * categorical set (chart-4/5 ΔE 7.4), so this chart scopes its own.
 */
export const MIX_COLOR_VARS: Record<MixSeries, string> = {
  organic_search: "var(--mix-1)",
  ai_assistant: "var(--mix-2)",
  direct: "var(--mix-3)",
  referral: "var(--mix-4)",
  other: "var(--mix-5)",
};

export const MIX_PALETTE_CLASS =
  "[--mix-1:#2a78d6] [--mix-2:#eb6834] [--mix-3:#1baf7a] [--mix-4:#eda100] [--mix-5:#e87ba4] " +
  "dark:[--mix-1:#3987e5] dark:[--mix-2:#d95926] dark:[--mix-3:#199e70] dark:[--mix-4:#c98500] dark:[--mix-5:#d55181]";

const tooltipStyles: CSSProperties = {
  ...(defaultStyles as CSSProperties),
  backgroundColor: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
  padding: "8px 10px",
  borderRadius: "8px",
  fontSize: "12px",
  position: "fixed",
  zIndex: 1000,
};

const toDate = (iso: string) => new Date(`${iso}T00:00:00`);
const int = new Intl.NumberFormat("en-SG");

type Props = { buckets: MixBucket[]; granularity: "day" | "week"; height?: number; annotations?: ChartAnnotation[] };

function Chart({ width, height, buckets, granularity, annotations }: Props & { width: number; height: number }) {
  const narrow = width < 420;
  const margin = narrow ? { top: 8, right: 18, bottom: 28, left: 40 } : { top: 8, right: 24, bottom: 30, left: 52 };
  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = Math.max(10, height - margin.top - margin.bottom);
  const { tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip } = useTooltip<MixBucket>();

  const xScale = useMemo(
    () =>
      scaleTime({
        domain: [toDate(buckets[0]?.start ?? "2026-01-01"), toDate(buckets[buckets.length - 1]?.start ?? "2026-01-02")],
        range: [0, innerWidth],
      }),
    [buckets, innerWidth],
  );
  const yScale = useMemo(() => {
    const max = Math.max(1, ...buckets.map((b) => MIX_SERIES.reduce((sum, k) => sum + b[k], 0)));
    return scaleLinear({ domain: [0, max * 1.08], range: [innerHeight, 0], nice: true });
  }, [buckets, innerHeight]);

  const x = (b: MixBucket) => xScale(toDate(b.start)) ?? 0;
  // The last bucket always contains today, so its count is still growing.
  const inProgressX = buckets.length > 1 ? x(buckets[buckets.length - 2]) : null;

  const handleMove = (event: React.PointerEvent<SVGRectElement>) => {
    const pt = localPoint(event);
    if (!pt || !buckets.length) return;
    const px = pt.x - margin.left;
    let best = buckets[0];
    for (const b of buckets) if (Math.abs(x(b) - px) < Math.abs(x(best) - px)) best = b;
    showTooltip({ tooltipData: best, tooltipLeft: event.clientX, tooltipTop: event.clientY });
  };

  return (
    <>
      <svg width={width} height={height} role="img" aria-label={`Visits by channel per ${granularity}, stacked`}>
        <Group left={margin.left} top={margin.top}>
          <GridRows scale={yScale} width={innerWidth} numTicks={4} stroke="var(--border)" strokeOpacity={0.6} />
          {inProgressX !== null ? (
            <g>
              <rect x={inProgressX} y={0} width={Math.max(0, innerWidth - inProgressX)} height={innerHeight} fill="var(--muted)" opacity={0.6} />
              <text x={innerWidth} y={10} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
                in progress
              </text>
            </g>
          ) : null}
          <AreaStack<MixBucket>
            keys={[...MIX_SERIES]}
            data={buckets}
            x={(d) => x(d.data)}
            y0={(d) => yScale(d[0]) ?? 0}
            y1={(d) => yScale(d[1]) ?? 0}
          >
            {({ stacks, path }) =>
              stacks.map((stack) => (
                <path
                  key={`stack-${stack.key}`}
                  d={path(stack) || ""}
                  fill={MIX_COLOR_VARS[stack.key as MixSeries]}
                  fillOpacity={0.85}
                  // Surface-coloured seam between stacked fills.
                  stroke="var(--card)"
                  strokeWidth={1.5}
                />
              ))
            }
          </AreaStack>
          {tooltipData ? (
            <Line
              from={{ x: x(tooltipData), y: 0 }}
              to={{ x: x(tooltipData), y: innerHeight }}
              stroke="var(--foreground)"
              strokeOpacity={0.5}
              strokeDasharray="2 3"
              pointerEvents="none"
            />
          ) : null}
          <AxisLeft
            scale={yScale}
            numTicks={4}
            stroke="transparent"
            tickStroke="transparent"
            tickFormat={(v) => int.format(Number(v))}
            tickLabelProps={() => ({ fill: "var(--muted-foreground)", fontSize: narrow ? 10 : 11, textAnchor: "end", dx: -4, dy: 3 })}
          />
          <AxisBottom
            top={innerHeight}
            scale={xScale}
            numTicks={narrow ? 3 : 6}
            stroke="var(--border)"
            tickStroke="transparent"
            tickFormat={(v) => format(v as Date, "d MMM")}
            tickLabelProps={() => ({ fill: "var(--muted-foreground)", fontSize: narrow ? 10 : 11, textAnchor: "middle" })}
          />
          <rect width={innerWidth} height={innerHeight} fill="transparent" onPointerMove={handleMove} onPointerLeave={hideTooltip} />
          <AnnotationMarkers annotations={annotations} xScale={xScale} innerWidth={innerWidth} innerHeight={innerHeight} />
        </Group>
      </svg>
      {tooltipData ? (
        <TooltipWithBounds left={tooltipLeft} top={tooltipTop} style={tooltipStyles}>
          <div className="mb-1 text-muted-foreground">
            {granularity === "week" ? `Week of ${format(toDate(tooltipData.start), "d MMM yyyy")}` : format(toDate(tooltipData.start), "EEE d MMM yyyy")}
          </div>
          {tooltipData === buckets[buckets.length - 1] ? (
            <div className="mb-1 text-muted-foreground">In progress: still counting</div>
          ) : null}
          {/* Top of the stack first, matching the visual order. */}
          {[...MIX_SERIES].reverse().map((k) => (
            <div key={k} className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-sm" style={{ background: MIX_COLOR_VARS[k] }} aria-hidden />
                {MIX_SERIES_LABELS[k]}
              </span>
              <span className="tabular-nums">{int.format(tooltipData[k])}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between gap-4 border-t pt-1 font-medium">
            <span>Total</span>
            <span className="tabular-nums">{int.format(MIX_SERIES.reduce((sum, k) => sum + tooltipData[k], 0))}</span>
          </div>
        </TooltipWithBounds>
      ) : null}
    </>
  );
}

export function ChannelMixVisx(props: Props) {
  const height = props.height ?? 220;
  return (
    <div className={`w-full ${MIX_PALETTE_CLASS}`}>
      {/* Legend always present for ≥ 2 series; colour is never the only carrier of identity. */}
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {MIX_SERIES.map((k) => (
          <li key={k} className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: MIX_COLOR_VARS[k] }} aria-hidden />
            {MIX_SERIES_LABELS[k]}
          </li>
        ))}
      </ul>
      <div style={{ height }}>
        <ParentSize>{({ width }) => (width > 0 ? <Chart {...props} width={width} height={height} /> : null)}</ParentSize>
      </div>
    </div>
  );
}
