"use client";

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

export function useBolsterFit(
  placements: BolsterPlacement[],
  length: BolsterLength,
  items: FillingItem[] | undefined,
  dimensionOverrides: DimensionOverridesPayload | undefined,
): BolsterFit {
  const { itemDims } = useItemMaps(items, dimensionOverrides);
  return useMemo(() => fitBolster(placements, length, { dims: itemDims }), [placements, length, itemDims]);
}

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

export function useCut(initial: Cut = DEFAULT_CUT) {
  const [cut, setCut] = useState<Cut>(initial);
  const onDiveChange = useCallback((section: Section | null) => {
    if (!section) return;
    setCut((c) => (c.section !== section ? { section } : c));
  }, []);
  return { cut, setCut, onDiveChange };
}
