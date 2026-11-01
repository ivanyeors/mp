import type { CSSProperties } from "react";

/**
 * Where one part of a stacked bar sits, in CSS, for the Customer lifecycle
 * chart. `from` and `to` are fractions of the bar's whole.
 *
 * A 2px gap in the card's colour follows every part but the last. A part
 * never draws thinner than 2px, so one customer still shows; it pushes the
 * parts after it along rather than hiding under them.
 */
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
