"use client";

import type { ReactNode } from "react";
import { useParentSize } from "@visx/responsive";

const WIDTH_ONLY: ("height" | "top" | "left")[] = ["height", "top", "left"];

export function ChartWidth({
  debounceTime,
  children,
}: {
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
