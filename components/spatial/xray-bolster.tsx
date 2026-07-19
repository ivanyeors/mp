"use client";

/**
 * Mbolster x-ray renderer (slice 13). ADR 0009 guardrails on the capsule:
 * clipping against the capsule silhouette only — never box crops; deterministic
 * layoutBolsterPlacements; pieces keep distinct outlines; colors via per-subtype
 * CSS variables; paths come from the one asset pipeline (xray-assets); shape
 * swaps reuse the prepared-morph MorphPiece. Single compartment (ADR 0008
 * amendment): no Section hover/dive — edits live in the compartment list editor.
 * Staff-only: callers mount this behind the staff assist gate.
 */

import { useId } from "react";

import type { BolsterPlacement } from "@/lib/spatial-fillings/core";
import { fillingVisual } from "@/lib/spatial-fillings/visuals";
import { layoutBolsterPlacements } from "@/lib/spatial-fillings/xray-layout";
import { MorphPiece } from "./xray-pillow";
import { BOLSTER_SILHOUETTE_PATH, XRAY_VIEW } from "./xray-assets";

export function XrayBolster({
  placements,
  /** item id → subtype (resolves fluid shape + color). */
  itemSubtypes,
  className,
}: {
  placements: BolsterPlacement[];
  itemSubtypes: ReadonlyMap<number, string | null>;
  className?: string;
}) {
  const uid = useId();
  const pieces = layoutBolsterPlacements(placements);

  return (
    <div className={className} style={{ pointerEvents: "none" }}>
      <svg
        viewBox={`0 0 ${XRAY_VIEW.width} ${XRAY_VIEW.height}`}
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        aria-label="X-ray filling view"
      >
        <defs>
          <clipPath id={`${uid}-sil`}>
            <path d={BOLSTER_SILHOUETTE_PATH} />
          </clipPath>
        </defs>

        {/* x-ray art direction: shell interior darkens so fillings read inside */}
        <g clipPath={`url(#${uid}-sil)`}>
          <path d={BOLSTER_SILHOUETTE_PATH} fill="rgba(15,23,42,0.5)" />
          {pieces.map((p) => {
            const subtype = itemSubtypes.get(p.itemId) ?? null;
            const visual = fillingVisual(subtype);
            const s = p.size / 100;
            return (
              <MorphPiece
                key={p.key}
                subtype={subtype}
                visual={visual}
                transform={`translate(${p.cx - 50 * s} ${p.cy - 50 * s}) scale(${s})`}
              />
            );
          })}
        </g>

        <path
          d={BOLSTER_SILHOUETTE_PATH}
          fill="none"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth={3}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
