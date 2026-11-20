import type { CSSProperties } from "react";

export const GAP_PX = 2;
export const MIN_PX = 2;

export function stackedPartStyle(part: { from: number; to: number }, index: number, last: boolean): CSSProperties {
    const pct = (v: number) => `${(v * 100).toFixed(4)}%`;
    return {
        left: index === 0 ? 0 : `max(${pct(part.from)}, ${index * (MIN_PX + GAP_PX)}px)`,
        right: last ? 0 : `calc(${pct(1 - part.to)} + ${GAP_PX}px)`,
        minWidth: MIN_PX,
    };
}
