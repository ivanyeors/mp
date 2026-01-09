"use client";

import { cn } from "@/lib/utils";

interface RetroGridProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Additional CSS classes to apply to the grid container
   */
  className?: string;
  /**
   * Rotation angle of the grid in degrees
   * @default 65
   */
  angle?: number;
  /**
   * Grid cell size in pixels
   * @default 60
   */
  cellSize?: number;
  /**
   * Grid opacity value between 0 and 1
   * @default 0.5
   */
  opacity?: number;
  /**
   * Grid line color in light mode
   * @default "gray"
   */
  lightLineColor?: string;
  /**
   * Grid line color in dark mode
   * @default "gray"
   */
  darkLineColor?: string;
  /**
   * Animation speed: "slow" for subtle movement, "fast" for forward transitions, "reverse" for backward transitions
   * @default "slow"
   */
  speed?: "slow" | "fast" | "reverse";
}

export function RetroGrid({
  className,
  angle = 80,
  cellSize = 50,
  opacity = 1,
  lightLineColor = "gray",
  darkLineColor = "gray",
  speed = "slow",
  ...props
}: RetroGridProps) {
  const gridStyles = {
    "--grid-angle": `${angle}deg`,
    "--cell-size": `${cellSize}px`,
    "--opacity": opacity,
    "--light-line": lightLineColor,
    "--dark-line": darkLineColor,
  } as React.CSSProperties;

  return (
    <div
      className={cn(
        "pointer-events-none absolute size-full overflow-hidden [perspective:200px]",
        `opacity-[var(--opacity)]`,
        className,
      )}
      style={gridStyles}
      {...props}
    >
      {/* Bottom grid - tilts away toward bottom (bottom half only) */}
      <div className="absolute left-0 right-0 top-1/2 bottom-0 [transform:rotateX(var(--grid-angle))]">
        <div 
          className={cn(
            "[background-image:linear-gradient(to_right,var(--light-line)_1px,transparent_0),linear-gradient(to_bottom,var(--light-line)_1px,transparent_0)] [background-repeat:repeat] [background-size:var(--cell-size)_var(--cell-size)] [height:300vh] [inset:0%_0px] [margin-left:-200%] [transform-origin:100%_0_0] [width:600vw] dark:[background-image:linear-gradient(to_right,var(--dark-line)_1px,transparent_0),linear-gradient(to_bottom,var(--dark-line)_1px,transparent_0)]",
            speed === "slow" ? "animate-grid-slow" : speed === "fast" ? "animate-grid-fast" : "animate-grid-reverse"
          )}
        />
      </div>

      {/* Top grid - mirrored, tilts away toward top (top half only) */}
      <div className="absolute left-0 right-0 top-0 bottom-1/2 [transform:rotateX(calc(var(--grid-angle)*-1))]">
        <div 
          className={cn(
            "[background-image:linear-gradient(to_right,var(--light-line)_1px,transparent_0),linear-gradient(to_bottom,var(--light-line)_1px,transparent_0)] [background-repeat:repeat] [background-size:var(--cell-size)_var(--cell-size)] [height:300vh] [inset:0%_0px] [margin-left:-200%] [transform-origin:100%_100%_0] [width:600vw] dark:[background-image:linear-gradient(to_right,var(--dark-line)_1px,transparent_0),linear-gradient(to_bottom,var(--dark-line)_1px,transparent_0)]",
            speed === "slow" ? "animate-grid-slow" : speed === "fast" ? "animate-grid-fast" : "animate-grid-reverse"
          )}
        />
      </div>

      {/* Gradient fades from both top and bottom */}
      <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent dark:from-black" />
      <div className="absolute inset-0 bg-gradient-to-b from-white via-transparent to-transparent dark:from-black" />
    </div>
  );
}

export type { RetroGridProps };
