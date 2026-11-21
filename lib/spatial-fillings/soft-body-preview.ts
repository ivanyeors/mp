import { SUB_SECTIONS, type PillowPlacement, type Section, type SubSection } from "./core";
import type { DimensionsPayload } from "./dimension-overrides";
import {
  CODE_REGISTRY,
  resolveDims,
  type DimensionRegistry,
  type Measured,
  type NeckSupportDimensions,
  type NeckSupportSize,
  type PouchDimensions,
  type ResolvedDims,
} from "./dimensions";

export type SampleItem = {
  id: number;
  name: string;
  subtype: string;
  size: string | null;
  category?: string;
  label?: string;
};

export const SOFT_BODY_SAMPLE_ITEMS: readonly SampleItem[] = [
  { id: 1, name: "6D (S)", subtype: "6D", size: "S" },
  { id: 2, name: "6D Fold (S)", subtype: "6D", size: "S", label: "6D Fold" },
  { id: 3, name: "3D (S)", subtype: "3D", size: "S" },
  { id: 4, name: "Cervical Neck Support (M)", subtype: "Cervical Neck Support", category: "accessories", size: "M" },
  { id: 5, name: "Ear Comfort Pad", subtype: "Ear Comfort Pad", category: "accessories", size: null },
];

export type SampleRecipe = {
  key: string;
  name: string;
  cells: Readonly<Record<SubSection, readonly number[]>>;
  order: Readonly<Record<string, number>>;
};

export const SOFT_BODY_RECIPES: readonly SampleRecipe[] = [
  {
    key: "type-8",
    name: "Type 8",
    cells: { front: [1], middle: [2], back: [1, 1] },
    order: { "front/0": 1, "middle/0": 2, "back/0": 3, "back/1": 4 },
  },
  {
    key: "type-8a",
    name: "Type 8A",
    cells: { front: [1], middle: [2], back: [3, 1, 1] },
    order: { "front/0": 1, "middle/0": 2, "back/0": 3, "back/1": 4, "back/2": 5 },
  },
  {
    key: "type-9",
    name: "Type 9",
    cells: { front: [1], middle: [1, 2], back: [3, 1] },
    order: { "front/0": 1, "middle/0": 2, "middle/1": 3, "back/0": 4, "back/1": 5 },
  },
  {
    key: "type-9a",
    name: "Type 9A",
    cells: { front: [1], middle: [1, 2], back: [1, 1] },
    order: { "front/0": 1, "middle/0": 2, "middle/1": 3, "back/0": 4, "back/1": 5 },
  },
  {
    key: "type-11",
    name: "Type 11",
    cells: { front: [1], middle: [1, 2], back: [3, 1, 1] },
    order: { "front/0": 1, "middle/0": 2, "middle/1": 3, "back/0": 4, "back/1": 5, "back/2": 6 },
  },
  {
    key: "neck-mix",
    name: "Neck mix",
    cells: { front: [1, 2], middle: [1, 4], back: [3, 1, 1] },
    order: { "middle/1": 1, "middle/0": 2, "front/1": 3, "front/0": 4, "back/2": 5, "back/1": 6, "back/0": 7 },
  },
  {
    key: "ear-pad",
    name: "Ear pad mix",
    cells: { front: [1], middle: [5, 1], back: [3, 1, 1] },
    order: { "front/0": 1, "middle/1": 2, "back/2": 3, "back/1": 4, "back/0": 5, "middle/0": 6 },
  },
];

export const DEFAULT_SAMPLE_RECIPE = "type-11";

export function sampleRecipe(key: string | null | undefined): SampleRecipe {
  return SOFT_BODY_RECIPES.find((r) => r.key === key) ?? SOFT_BODY_RECIPES.find((r) => r.key === DEFAULT_SAMPLE_RECIPE)!;
}

export function recipePlacements(recipe: SampleRecipe, section: Section): PillowPlacement[] {
  return SUB_SECTIONS.flatMap((subSection) =>
    recipe.cells[subSection].map((itemId, row): PillowPlacement => {
      const insertOrder = recipe.order[`${subSection}/${row}`];
      return { section, subSection, slot: row + 1, itemId, row, ...(insertOrder === undefined ? {} : { insertOrder }) };
    }),
  );
}

export function registryFromCatalog(
  payload: Pick<DimensionsPayload, "pouches" | "neck" | "loftAllowance"> | null | undefined,
): DimensionRegistry {
  if (!payload) return CODE_REGISTRY;
  const pouches: Record<string, Measured<PouchDimensions>> = { ...CODE_REGISTRY.pouches };
  const neck: Partial<Record<NeckSupportSize, Measured<NeckSupportDimensions>>> = { ...CODE_REGISTRY.neck };
  const configured = new Set<string>();
  for (const p of payload.pouches ?? []) {
    if (p.source !== "configured") continue;
    pouches[p.key] = { ...p.dims, measuredOn: p.measuredOn ?? "configured" };
    configured.add(p.key);
  }
  for (const n of payload.neck ?? []) {
    if (n.source !== "configured") continue;
    neck[n.size] = { ...n.dims, measuredOn: n.measuredOn ?? "configured" };
    configured.add(`neck/${n.size.toLowerCase()}`);
  }
  const loftAllowance = Number.isFinite(payload.loftAllowance) ? payload.loftAllowance : CODE_REGISTRY.loftAllowance;
  return { pouches, neck, loftAllowance, configured };
}

export function sampleItemMaps(registry: DimensionRegistry = CODE_REGISTRY): {
  itemSubtypes: Map<number, string>;
  itemSizes: Map<number, string | null>;
  itemDims: Map<number, ResolvedDims>;
} {
  const items = SOFT_BODY_SAMPLE_ITEMS;
  return {
    itemSubtypes: new Map(items.map((i) => [i.id, i.label ?? i.subtype])),
    itemSizes: new Map(items.map((i) => [i.id, i.size])),
    itemDims: new Map(items.map((i) => [i.id, resolveDims({ name: i.name, category: i.category ?? "filling" }, registry)])),
  };
}
