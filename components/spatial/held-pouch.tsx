"use client";

/**
 * Holding a filling: one piece of code for both x-ray views (Ivan, 9-11-2026:
 * "the top view's fine drag and the side view's feel different; I like the
 * side view's, implement the exact same code", and the same with a mouse as
 * with a finger). This is the side view's hold, lifted out so the top view
 * runs it too, and every page that draws either view gets it:
 *
 * - a press becomes a drag after DRAG_THRESHOLD_PX;
 * - the fine drag (`lib/dnd/fine-drag.ts`) at the drawing's scale, so a mouse
 *   on a desktop's larger drawing creeps and snaps as a finger on a phone;
 * - a snap pulls from SNAP_PX on a phone's drawing (as much further as the
 *   drawing is larger), slowing on one creeps on from it, and taking hold it
 *   buzzes where the device can;
 * - the ghost under the pointer is the filling's own shape, light and dashed,
 *   so where it lands (drawn solid by the view) reads through it, and the
 *   badge over it says where, the same size on screen everywhere, kept inside
 *   the drawing;
 * - the ghost and badge move by writing their transforms, never a re-render a
 *   pointer move: the view draws again only when where it would land changes.
 */

import { useCallback, useLayoutEffect, useMemo, useRef } from "react";

import { drawingScale, holdSnap, moveFineDrag, snapsNow, startFineDrag, type FineDrag, type Vec } from "@/lib/dnd/fine-drag";
import { badgeWidth, DragBadge } from "./drag-badge";

/** A press becomes a drag once it has moved this far, screen px (a click or tap below it). */
export const DRAG_THRESHOLD_PX = 6;
/** How near a place a hand aims for (home, a column's middle or edge) a held filling is pulled onto it, a phone's px. */
export const SNAP_PX = 7;
/** The badge's type, screen px: the same size in both views, on a phone and a desktop. */
export const BADGE_PX = 13;

/** An SVG's screen px per view unit, and its drawing's scale against a phone's (`drawingScale`). */
export function svgScale(svg: SVGSVGElement | null): { pxPerView: number; scale: number } {
  const m = svg?.getScreenCTM();
  const pxPerView = m ? Math.hypot(m.a, m.b) : 0;
  return { pxPerView: pxPerView > 0 ? pxPerView : 1, scale: drawingScale(svg?.getBoundingClientRect().width ?? 0) };
}

/** Picking a filling up whose centre is drawn at `at` (view units): the fine drag, at its drawing's scale. */
export function pickUp(at: Vec, e: { clientX: number; clientY: number; timeStamp: number }, svg: SVGSVGElement | null): FineDrag {
  return startFineDrag(at, [e.clientX, e.clientY], e.timeStamp, svgScale(svg).scale);
}

/** Whether a press from `start` (screen px) has become a drag. */
export const pastThreshold = (start: Vec, e: { clientX: number; clientY: number }): boolean =>
  Math.hypot(e.clientX - start[0], e.clientY - start[1]) >= DRAG_THRESHOLD_PX;

/**
 * One pointer step of a held filling. `direct` is where the pointer alone
 * would put its centre (view units); `snappedAt`, where the last preview's
 * snap stood it, if one did. Returns the fine drag moved on, how far a snap
 * may pull now (view units; 0 while the hand creeps), and whether it crept
 * off a snap (the caller forgets `snappedAt` then).
 */
export function stepHold(
  fine: FineDrag,
  direct: Vec,
  e: { clientX: number; clientY: number; timeStamp: number },
  snappedAt: Vec | null,
  pxPerView: number,
): { fine: FineDrag; snapView: number; leftSnap: boolean } {
  let next = moveFineDrag(fine, direct, [e.clientX, e.clientY], e.timeStamp);
  const snapping = snapsNow(next);
  // Slowing down on a snap creeps on from where the snap stood it, never jumps off it.
  const leftSnap = !snapping && snappedAt !== null;
  if (leftSnap) next = holdSnap(next, snappedAt);
  return { fine: next, snapView: snapping ? (SNAP_PX * next.scale) / pxPerView : 0, leftSnap };
}

/** A snap taking hold is felt as well as seen, where the device can (a phone's short buzz; a desktop has none). */
export function buzz(): void {
  if (typeof navigator !== "undefined") navigator.vibrate?.(8);
}

/** The badge's type in view units, for a drawing at `pxPerView` screen px a view unit. */
export const badgeFontFor = (pxPerView: number): number => BADGE_PX / (pxPerView > 0 ? pxPerView : 1);

/** Where the held filling's ghost and badge are drawn; `place` moves both without a render. */
export type HeldGhostHandle = {
  attachGhost: (el: SVGGElement | null) => void;
  attachBadge: (el: SVGGElement | null) => void;
  /** Stand both over a centre at `at` (view units); with none, where they were last stood (after a render). */
  place: (at?: Vec) => void;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Write the ghost's and badge's transforms for a centre at `at`: the badge over it, inside the bounds its element carries. */
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

/** The handle a view holds a filling with: one per view. */
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

/**
 * The held filling, drawn where `handle.place` last put it: its own shape `d`
 * (around its centre; `offset` moves a path drawn elsewhere onto it), in its
 * filling's colour, light and dashed; the badge over it. `shrink`: over a
 * Section tab on the cut, it shrinks and shows `label` instead of the badge.
 */
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
  /** Half the filling's drawn height, view units: the badge clears it. */
  halfH: number;
  badge?: string | null;
  badgeFont: number;
  /** The drawing's left and right edges and its top, view units: the badge stays inside them. */
  bounds: readonly [number, number, number];
  shrink?: boolean;
  label?: string;
  labelFont?: number;
}) {
  // After every render (a new badge text, a preview), put both back where the hand has them.
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
