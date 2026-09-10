"use client";

/**
 * X-ray editor frame (CONTEXT.md): mounts XrayPillow in normal document flow.
 *
 * XrayPillow renders its SVG at h-full/w-full inside a className-only root and
 * positions its dive overlay `absolute inset-0`, so it needs a positioned
 * ancestor with a definite height. The configurator gives it one by stretching
 * it over a full-bleed stage (`absolute inset-0`); an Admin Panel card does not.
 * This supplies that box at the x-ray's own aspect ratio so the same component
 * works inside a card without being modified.
 *
 * Colours come from Product Builder overrides as CSS variables on the container
 * (filling_color_overrides is service-role-only, so the Admin Panel receives the
 * rows from its server route). Absent variables fall back to the code default.
 *
 * ponytail: a wrapper, not a fork — every editing behaviour stays in XrayPillow,
 * so the three surfaces cannot drift.
 */

import { useMemo } from "react";

import { XrayPillow } from "./xray-pillow";
import { XRAY_VIEW } from "./xray-assets";
import { xrayColorVarStyle, type ColorOverrideRow } from "@/lib/spatial-fillings/color-overrides";
import type { FillingItem } from "@/components/configurator/staff-assist-panel";
import type { PillowPlacement } from "@/lib/spatial-fillings/core";

export function XrayEditor({
  placements,
  onPlacementsChange,
  items,
  colorOverrides = [],
  className,
}: {
  placements: PillowPlacement[];
  /** Omit together with `items` for a read-only render (no edit affordances). */
  onPlacementsChange?: (next: PillowPlacement[]) => void;
  /** Inventory filling Items for the dive picker; omit for read-only. */
  items?: FillingItem[];
  colorOverrides?: ColorOverrideRow[];
  className?: string;
}) {
  // The pouch shape and scale come from each Item's subtype and size, exactly as
  // in the configurator — derived here so call sites pass one items array.
  //
  // Memoised on `items`, not rebuilt per render: XrayPillow memoises its geometry
  // chain (layoutPlacements → conformPouchPath polygon scans) on
  // [placements, itemSizes], so a fresh Map identity invalidates all of it. Both
  // host pages keep text inputs in the same component as this editor, so every
  // keystroke would otherwise re-conform every pouch (~7ms at 11 pieces, ~10ms at
  // 17). mp-config memoises these two maps for the same reason.
  const itemSubtypes = useMemo(
    () => new Map((items ?? []).map((i) => [i.id, i.subtype])),
    [items],
  );
  const itemSizes = useMemo(() => new Map((items ?? []).map((i) => [i.id, i.size])), [items]);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-lg bg-slate-950 ${className ?? ""}`}
      style={{ aspectRatio: `${XRAY_VIEW.width} / ${XRAY_VIEW.height}`, ...xrayColorVarStyle(colorOverrides) }}
    >
      <XrayPillow
        placements={placements}
        itemSubtypes={itemSubtypes}
        itemSizes={itemSizes}
        items={items}
        onPlacementsChange={onPlacementsChange}
        className="absolute inset-0"
      />
    </div>
  );
}
