"use client";

/**
 * The item maps and the physical fit a pillow x-ray host derives from its
 * Items and Settings overrides (X-ray pillow UX slices 02–04, ADR 0019). Kept
 * apart from the editor frame so a page that loads the editor lazily can still
 * compute the fit for its banner, its save confirm and its cross-section
 * without pulling the renderer into its own chunk.
 *
 * Memoised on the inputs, not rebuilt per render: the x-ray memoises its
 * geometry chain on the fit and the dims maps, so a fresh identity would
 * re-conform every pouch on every keystroke of the host's text inputs.
 */

import { useCallback, useMemo, useState } from "react";

import type { FillingItem } from "@/components/configurator/staff-assist-panel";
import type { BolsterPlacement, PillowPlacement, Section } from "@/lib/spatial-fillings/core";
import { DEFAULT_CUT, type Cut } from "@/lib/spatial-fillings/cross-section";
import {
  registryFromPayload,
  resolveItemDims,
  type DimensionOverridesPayload,
} from "@/lib/spatial-fillings/dimension-overrides";
import { fillingDescriptor } from "@/lib/spatial-fillings/filling-groups";
import { fitAtSizes, fitBolster, fitPillow, type BolsterFit, type FitStatus, type PillowFit } from "@/lib/spatial-fillings/fit";
import type { BolsterLength } from "@/lib/spatial-fillings/xray-layout";

/** subtype, size and registry dimensions per Item id, plus the loft allowance the registry carries. */
export function useItemMaps(items: FillingItem[] | undefined, dimensionOverrides: DimensionOverridesPayload | undefined) {
  const itemSubtypes = useMemo(
    () => new Map((items ?? []).map((i) => [i.id, fillingDescriptor(i)])),
    [items],
  );
  const itemSizes = useMemo(() => new Map((items ?? []).map((i) => [i.id, i.size])), [items]);
  const registry = useMemo(() => registryFromPayload(dimensionOverrides), [dimensionOverrides]);
  const itemDims = useMemo(() => resolveItemDims(items ?? [], registry), [items, registry]);
  return { itemSubtypes, itemSizes, itemDims, loftAllowance: registry.loftAllowance };
}

/** The fit of a recipe at a Size — computed once per change, shared by the x-ray, the banner, the confirm and the cross-section. */
export function usePillowFit(
  placements: PillowPlacement[],
  pillowSize: string | null | undefined,
  items: FillingItem[] | undefined,
  dimensionOverrides: DimensionOverridesPayload | undefined,
): PillowFit {
  const { itemDims, loftAllowance } = useItemMaps(items, dimensionOverrides);
  return useMemo(
    () => fitPillow(placements, { size: pillowSize, dims: itemDims, loftAllowance }),
    [placements, pillowSize, itemDims, loftAllowance],
  );
}

/** The Mbolster's fit at a length (slice 09) — shared by the capsule x-ray, the confirm and the end-on cross-section. */
export function useBolsterFit(
  placements: BolsterPlacement[],
  length: BolsterLength,
  items: FillingItem[] | undefined,
  dimensionOverrides: DimensionOverridesPayload | undefined,
): BolsterFit {
  const { itemDims } = useItemMaps(items, dimensionOverrides);
  return useMemo(() => fitBolster(placements, length, { dims: itemDims }), [placements, length, itemDims]);
}

/** The same recipe judged at every Size it is shared with — the membership chips' dots. */
export function useFitAtSizes(
  placements: PillowPlacement[],
  sizes: readonly string[],
  items: FillingItem[] | undefined,
  dimensionOverrides: DimensionOverridesPayload | undefined,
): Record<string, FitStatus> {
  const { itemDims, loftAllowance } = useItemMaps(items, dimensionOverrides);
  return useMemo(
    () => fitAtSizes(placements, sizes, { dims: itemDims, loftAllowance }),
    [placements, sizes, itemDims, loftAllowance],
  );
}

/**
 * The cut a host holds (slice 05): the cross-section's controls set it and an
 * along cut follows the dived Section (the x-ray itself draws no cut line).
 * Here rather than beside the cross-section so a page can lazy-load that
 * component and still hold the state statically.
 */
export function useCut(initial: Cut = DEFAULT_CUT) {
  const [cut, setCut] = useState<Cut>(initial);
  const onDiveChange = useCallback((section: Section | null) => {
    if (!section) return;
    setCut((c) => (c.axis === "along" && c.section !== section ? { axis: "along", section } : c));
  }, []);
  return { cut, setCut, onDiveChange };
}
