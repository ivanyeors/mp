"use client";

export type ChartAnnotation = { id: string; date: string; label: string };

/**
 * Vertical "what shipped" markers for a time-scaled visx chart (slice 05).
 * Native <title> tooltips keep this dependency-free and readable by screen readers.
 */
export function AnnotationMarkers({
  annotations,
  xScale,
  innerWidth,
  innerHeight,
}: {
  annotations?: ChartAnnotation[];
  xScale: (d: Date) => number | undefined;
  innerWidth: number;
  innerHeight: number;
}) {
  if (!annotations?.length) return null;
  return (
    <g aria-label="Annotations">
      {annotations.map((a) => {
        const x = xScale(new Date(`${a.date}T00:00:00`));
        if (x === undefined || x < 0 || x > innerWidth) return null;
        return (
          <g key={a.id} transform={`translate(${x},0)`}>
            <title>{`${a.date}: ${a.label}`}</title>
            <line y1={0} y2={innerHeight} stroke="var(--foreground)" strokeOpacity={0.35} strokeDasharray="1 3" pointerEvents="none" />
            {/* Bigger invisible hit target than the 4px dot. */}
            <circle r={9} cy={0} fill="transparent" />
            <circle r={4} cy={0} fill="var(--foreground)" stroke="var(--card)" strokeWidth={2} />
          </g>
        );
      })}
    </g>
  );
}
