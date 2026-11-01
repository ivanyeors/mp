"use client";

import type { ReactNode } from "react";
import { useParentSize } from "@visx/responsive";

/** A chart here picks its own height, so only a change of width redraws it. */
const WIDTH_ONLY: ("height" | "top" | "left")[] = ["height", "top", "left"];

/**
 * The width a chart has to fill, measured on a block that stays in the page's
 * flow and grows as tall as the chart drawn in it.
 *
 * This is what visx 3's `ParentSize` did. visx 4's draws its children in an
 * absolutely placed, overflow-hidden box the size of its own `height: 100%`
 * box, so in a card of auto height that box is 0px tall and the chart is cut
 * away entirely: the legend shows and the chart does not.
 */
export function ChartWidth({
  debounceTime,
  children,
}: {
  /** Milliseconds to wait for a resize to settle; visx's default is 300. */
  debounceTime?: number;
  children: (size: { width: number }) => ReactNode;
}) {
  const { parentRef, width } = useParentSize({ debounceTime, ignoreDimensions: WIDTH_ONLY });
  return (
    <div ref={parentRef} style={{ width: "100%" }}>
      {children({ width })}
    </div>
  );
}
