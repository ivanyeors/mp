"use client";

import { useMemo, type CSSProperties } from "react";
import { Group } from "@visx/group";
import { scaleLinear, scaleTime } from "@visx/scale";
import { LinePath, Line } from "@visx/shape";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { useTooltip, TooltipWithBounds, defaultStyles } from "@visx/tooltip";
import { localPoint } from "@visx/event";
import { ParentSize } from "@visx/responsive";
import { format } from "date-fns";
import { AnnotationMarkers, type ChartAnnotation } from "./AnnotationMarkers";

export type SeoTrendPoint = { start: string; value: number | null; partial: boolean };

type Props = {
  /** Names the series; a single-series chart needs no legend box. */
  label: string;
  points: SeoTrendPoint[];
  granularity: "day" | "week";
  formatValue: (v: number) => string;
  /** Average position: 1 is best, so the axis runs best-at-top. */
  invert?: boolean;
  height?: number;
  annotations?: ChartAnnotation[];
};

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

function Chart({ width, height, label, points, granularity, formatValue, invert, annotations }: Props & { width: number; height: number }) {
  const narrow = width < 420;
  const margin = narrow ? { top: 14, right: 18, bottom: 28, left: 44 } : { top: 16, right: 24, bottom: 30, left: 56 };
  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = Math.max(10, height - margin.top - margin.bottom);

  const { tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip } = useTooltip<SeoTrendPoint>();

  const xScale = useMemo(() => {
    const first = points[0] ? toDate(points[0].start) : new Date();
    const last = points.length ? toDate(points[points.length - 1].start) : new Date();
    return scaleTime({ domain: [first, last], range: [0, innerWidth] });
  }, [points, innerWidth]);

  const yScale = useMemo(() => {
    const values = points.map((p) => p.value).filter((v): v is number => v !== null);
    if (invert) {
      const lo = values.length ? Math.min(...values) : 1;
      const hi = values.length ? Math.max(...values) : 10;
      const pad = Math.max(0.5, (hi - lo) * 0.1);
      // Domain [worst, best] → best (lowest number) at the top.
      return scaleLinear({ domain: [hi + pad, Math.max(1, lo - pad)], range: [innerHeight, 0], nice: true });
    }
    const hi = values.length ? Math.max(...values) : 1;
    return scaleLinear({ domain: [0, hi > 0 ? hi * 1.1 : 1], range: [innerHeight, 0], nice: true });
  }, [points, invert, innerHeight]);

  // Solid up to the last settled point, dashed from there through the partial ones.
  const firstPartial = points.findIndex((p) => p.partial);
  const settled = firstPartial === -1 ? points : points.slice(0, firstPartial);
  const partial = firstPartial === -1 ? [] : points.slice(Math.max(0, firstPartial - 1));
  const partialX = firstPartial > 0 ? xScale(toDate(points[firstPartial].start)) : firstPartial === 0 ? 0 : null;

  const x = (p: SeoTrendPoint) => xScale(toDate(p.start)) ?? 0;
  const y = (p: SeoTrendPoint) => yScale(p.value ?? 0) ?? 0;
  const defined = (p: SeoTrendPoint) => p.value !== null;

  const fmtDate = (iso: string) =>
    granularity === "week" ? `Week of ${format(toDate(iso), "d MMM yyyy")}` : format(toDate(iso), "EEE d MMM yyyy");

  const handleMove = (event: React.PointerEvent<SVGRectElement>) => {
    const pt = localPoint(event);
    if (!pt || !points.length) return;
    const px = pt.x - margin.left;
    let best = 0;
    let bestDist = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(x(p) - px);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    const p = points[best];
    showTooltip({
      tooltipData: p,
      tooltipLeft: event.clientX,
      tooltipTop: event.clientY,
    });
  };

  const latest = [...points].reverse().find((p) => p.value !== null && !p.partial);

  return (
    <>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${label} by ${granularity}${latest ? `; latest settled ${formatValue(latest.value!)}` : ""}`}
      >
        <Group left={margin.left} top={margin.top}>
          <GridRows scale={yScale} width={innerWidth} numTicks={4} stroke="var(--border)" strokeOpacity={0.6} />
          {partialX !== null ? (
            <g>
              <rect x={partialX} y={0} width={Math.max(0, innerWidth - partialX)} height={innerHeight} fill="var(--muted)" opacity={0.5} />
              <text x={innerWidth} y={-4} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
                partial
              </text>
            </g>
          ) : null}
          <LinePath data={settled} x={x} y={y} defined={defined} stroke="var(--chart-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <LinePath data={partial} x={x} y={y} defined={defined} stroke="var(--chart-1)" strokeWidth={2} strokeDasharray="4 4" strokeLinecap="round" />
          {tooltipData && tooltipData.value !== null ? (
            <g pointerEvents="none">
              <Line from={{ x: x(tooltipData), y: 0 }} to={{ x: x(tooltipData), y: innerHeight }} stroke="var(--muted-foreground)" strokeOpacity={0.5} strokeDasharray="2 3" />
              <circle cx={x(tooltipData)} cy={y(tooltipData)} r={4} fill="var(--chart-1)" stroke="var(--card)" strokeWidth={2} />
            </g>
          ) : null}
          <AxisLeft
            scale={yScale}
            numTicks={4}
            stroke="transparent"
            tickStroke="transparent"
            tickFormat={(v) => formatValue(Number(v))}
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
          {/* Hit target spans the whole plot, not just the 2px line. */}
          <rect width={innerWidth} height={innerHeight} fill="transparent" onPointerMove={handleMove} onPointerLeave={hideTooltip} />
          {/* Markers sit above the hit target so their own <title> tooltips work. */}
          <AnnotationMarkers annotations={annotations} xScale={xScale} innerWidth={innerWidth} innerHeight={innerHeight} />
        </Group>
      </svg>
      {tooltipData ? (
        <TooltipWithBounds left={tooltipLeft} top={tooltipTop} style={tooltipStyles}>
          <div className="text-muted-foreground">{fmtDate(tooltipData.start)}</div>
          <div className="font-medium tabular-nums">
            {label}: {tooltipData.value === null ? "no data" : formatValue(tooltipData.value)}
          </div>
          {tooltipData.partial ? <div className="text-muted-foreground">Partial: Google may still revise this</div> : null}
        </TooltipWithBounds>
      ) : null}
    </>
  );
}

export function SeoTrendVisx(props: Props) {
  const height = props.height ?? 180;
  return (
    <div style={{ height }} className="w-full">
      <ParentSize>{({ width }) => (width > 0 ? <Chart {...props} width={width} height={height} /> : null)}</ParentSize>
    </div>
  );
}
