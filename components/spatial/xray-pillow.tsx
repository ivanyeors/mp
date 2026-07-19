"use client";

/**
 * X-ray filling renderer (slice 07, read-only). ADR 0009 guardrails:
 * nested clipping (silhouette ∩ cell) — never box crops; deterministic layout
 * via layoutPlacements; pieces keep distinct outlines; colors via per-subtype
 * CSS variables; all paths come from the one asset pipeline (xray-assets).
 * Staff-only: callers mount this behind the staff assist gate.
 */

import { useId, useState } from "react";

import { SECTIONS, type PillowPlacement, type Section } from "@/lib/spatial-fillings/core";
import { fillingVisual } from "@/lib/spatial-fillings/visuals";
import { layoutPlacements } from "@/lib/spatial-fillings/xray-layout";
import {
  CELL_CLIP_PATHS,
  FILLING_SHAPE_PATHS,
  SECTION_HIT_PATHS,
  SILHOUETTE_PATH,
  XRAY_VIEW,
  type CellKey,
} from "./xray-assets";

export function XrayPillow({
  placements,
  itemSubtypes,
  onSectionClick,
  className,
}: {
  placements: PillowPlacement[];
  /** item id → subtype (resolves fluid shape + color). */
  itemSubtypes: ReadonlyMap<number, string | null>;
  /** Slice 08 dive entry point; read-only when omitted. */
  onSectionClick?: (section: Section) => void;
  className?: string;
}) {
  const uid = useId();
  const [hovered, setHovered] = useState<Section | null>(null);

  const pieces = layoutPlacements(placements);
  const cellsInUse = [...new Set(pieces.map((p) => `${p.section}/${p.subSection}` as CellKey))];
  const clipId = (key: string) => `${uid}-${key.replace("/", "-")}`;

  return (
    <svg
      viewBox={`0 0 ${XRAY_VIEW.width} ${XRAY_VIEW.height}`}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      className={className}
      style={{ pointerEvents: "none" }}
      aria-label="X-ray filling view"
    >
      <defs>
        <clipPath id={clipId("sil")}>
          <path d={SILHOUETTE_PATH} />
        </clipPath>
        {cellsInUse.map((key) => (
          <clipPath key={key} id={clipId(key)}>
            <path d={CELL_CLIP_PATHS[key]} />
          </clipPath>
        ))}
      </defs>

      {/* x-ray art direction: shell interior darkens so fillings read inside */}
      <g clipPath={`url(#${clipId("sil")})`}>
        <path d={SILHOUETTE_PATH} fill="rgba(15,23,42,0.5)" />

        {/* nested clipping: silhouette ∩ cell — pieces conform, never box-cropped */}
        {cellsInUse.map((key) => (
          <g key={key} clipPath={`url(#${clipId(key)})`}>
            {pieces
              .filter((p) => `${p.section}/${p.subSection}` === key)
              .map((p) => {
                const subtype = itemSubtypes.get(p.itemId) ?? null;
                const visual = fillingVisual(subtype);
                const s = p.size / 100;
                return (
                  <path
                    key={p.key}
                    d={FILLING_SHAPE_PATHS[visual.shape]}
                    data-item-subtype={subtype ?? ""}
                    transform={`translate(${p.cx - 50 * s} ${p.cy - 50 * s}) scale(${s})`}
                    fill={`var(${visual.cssVar}, ${visual.defaultColor})`}
                    fillOpacity={0.9}
                    stroke="rgba(255,255,255,0.9)"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
          </g>
        ))}

        {hovered && (
          <path d={SECTION_HIT_PATHS[hovered]} fill="white" fillOpacity={0.15} />
        )}
      </g>

      <path
        d={SILHOUETTE_PATH}
        fill="none"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth={3}
        vectorEffect="non-scaling-stroke"
      />

      {/* Section hit areas (hover highlight now; click dives in slice 08) */}
      {SECTIONS.map((section) => (
        <path
          key={section}
          d={SECTION_HIT_PATHS[section]}
          data-section={section}
          fill="transparent"
          style={{ pointerEvents: "auto", cursor: onSectionClick ? "pointer" : "default" }}
          onMouseEnter={() => setHovered(section)}
          onMouseLeave={() => setHovered((h) => (h === section ? null : h))}
          onClick={onSectionClick ? () => onSectionClick(section) : undefined}
        />
      ))}
    </svg>
  );
}
