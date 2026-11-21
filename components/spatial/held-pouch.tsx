"use client";

import { useCallback, useLayoutEffect, useMemo, useRef } from "react";

import { drawingScale, holdSnap, moveFineDrag, snapsNow, startFineDrag, type FineDrag, type Vec } from "@/lib/dnd/fine-drag";
import { badgeWidth, DragBadge } from "./drag-badge";

export const DRAG_THRESHOLD_PX = 6;
export const SNAP_PX = 7;
export const BADGE_PX = 13;

export function svgScale(svg: SVGSVGElement | null): { pxPerView: number; scale: number } {
  const m = svg?.getScreenCTM();
  const pxPerView = m ? Math.hypot(m.a, m.b) : 0;
  return { pxPerView: pxPerView > 0 ? pxPerView : 1, scale: drawingScale(svg?.getBoundingClientRect().width ?? 0) };
}

export function pickUp(at: Vec, e: { clientX: number; clientY: number; timeStamp: number }, svg: SVGSVGElement | null): FineDrag {
  return startFineDrag(at, [e.clientX, e.clientY], e.timeStamp, svgScale(svg).scale);
}

export const pastThreshold = (start: Vec, e: { clientX: number; clientY: number }): boolean =>
  Math.hypot(e.clientX - start[0], e.clientY - start[1]) >= DRAG_THRESHOLD_PX;

export function stepHold(
  fine: FineDrag,
  direct: Vec,
  e: { clientX: number; clientY: number; timeStamp: number },
  snappedAt: Vec | null,
  pxPerView: number,
): { fine: FineDrag; snapView: number; leftSnap: boolean } {
  let next = moveFineDrag(fine, direct, [e.clientX, e.clientY], e.timeStamp);
  const snapping = snapsNow(next);
  const leftSnap = !snapping && snappedAt !== null;
  if (leftSnap) next = holdSnap(next, snappedAt);
  return { fine: next, snapView: snapping ? (SNAP_PX * next.scale) / pxPerView : 0, leftSnap };
}

export function buzz(): void {
  if (typeof navigator !== "undefined") navigator.vibrate?.(8);
}

export const badgeFontFor = (pxPerView: number): number => BADGE_PX / (pxPerView > 0 ? pxPerView : 1);

export type HeldGhostHandle = {
  attachGhost: (el: SVGGElement | null) => void;
  attachBadge: (el: SVGGElement | null) => void;
  place: (at?: Vec) => void;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

function placeHeld(ghost: SVGGElement | null, badge: SVGGElement | null, at: Vec) {
  ghost?.setAttribute("transform", `translate(${r1(at[0])} ${r1(at[1])})`);
  if (!badge) return;
  const n = (k: string) => Number(badge.getAttribute(k) ?? 0);
  const half = n("data-w") / 2;
  const minX = n("data-min-x");
  const maxX = n("data-max-x");
  const x = Math.min(Math.max(at[0], minX + half), Math.max(minX + half, maxX - half));
  const y = Math.max(at[1] - n("data-dy"), n("data-min-y"));
  badge.setAttribute("transform", `translate(${r1(x)} ${r1(y)})`);
}

export function useHeldGhost(): HeldGhostHandle {
  const els = useRef<{ ghost: SVGGElement | null; badge: SVGGElement | null }>({ ghost: null, badge: null });
  const at = useRef<Vec>([0, 0]);
  const place = useCallback((next?: Vec) => {
    if (next) at.current = next;
    placeHeld(els.current.ghost, els.current.badge, at.current);
  }, []);
  const attachGhost = useCallback((el: SVGGElement | null) => {
    els.current.ghost = el;
  }, []);
  const attachBadge = useCallback((el: SVGGElement | null) => {
    els.current.badge = el;
  }, []);
  return useMemo(() => ({ attachGhost, attachBadge, place }), [attachGhost, attachBadge, place]);
}

export function HeldGhost({
  handle,
  d,
  offset,
  fill,
  halfH,
  badge,
  badgeFont,
  bounds,
  shrink = false,
  label,
  labelFont = 0,
}: {
  handle: HeldGhostHandle;
  d: string;
  offset?: Vec;
  fill: string;
  halfH: number;
  badge?: string | null;
  badgeFont: number;
  bounds: readonly [number, number, number];
  shrink?: boolean;
  label?: string;
  labelFont?: number;
}) {
  const { attachGhost, attachBadge, place } = handle;
  useLayoutEffect(() => {
    place();
  });
  const w = badge ? badgeWidth(badge, badgeFont) : 0;
  return (
    <g pointerEvents="none" data-xray-held>
      <g ref={attachGhost} data-xray-slab-ghost>
        <g transform={shrink ? "translate(0 18) scale(0.5)" : undefined} opacity={shrink ? 0.6 : 1}>
          <path
            d={d}
            transform={offset ? `translate(${r1(offset[0])} ${r1(offset[1])})` : undefined}
            fill={fill}
            fillOpacity={shrink ? 0.82 : 0.3}
            stroke="white"
            strokeWidth={2}
            strokeDasharray={shrink ? undefined : "5 4"}
            vectorEffect="non-scaling-stroke"
            data-xray-drag-ghost
          />
          {shrink && label && labelFont > 0 && (
            <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fontSize={labelFont} fontWeight={600} fill="white" stroke="rgba(2,6,23,0.75)" strokeWidth={labelFont * 0.22} strokeLinejoin="round" paintOrder="stroke" className="select-none">
              {label}
            </text>
          )}
        </g>
      </g>
      {badge && !shrink && (
        <g
          ref={attachBadge}
          data-w={r1(w)}
          data-dy={r1(halfH + badgeFont * 1.6)}
          data-min-x={bounds[0]}
          data-max-x={bounds[1]}
          data-min-y={r1(bounds[2] + badgeFont)}
        >
          <DragBadge text={badge} y={0} font={badgeFont} />
        </g>
      )}
    </g>
  );
}
