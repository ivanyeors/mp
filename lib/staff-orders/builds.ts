import type { SupabaseClient } from "@supabase/supabase-js";

import { lookupPlacementKinds } from "@/lib/bom-sanitizer";
import { preferenceCategoryAllowed, type PreferenceCategory } from "@/lib/configurator/preference-policy";
import {
  composedBuildLines,
  isBolsterVariant,
  type ComposedSellableRef,
} from "@/lib/ecommerce/inventory-deduction";
import { filterSelectableFillingTemplates } from "@/lib/filling-templates";
import { templateIdsForKey } from "@/lib/filling-templates/membership";
import { loadXrayOverrides, type FillingMixItem } from "@/lib/results/admin/filling-mix";
import { placedChargeLines, priceComposedBuild, type PricedComponent } from "@/lib/pricing/composed-price";
import {
  getDefaultFillingTemplateId,
  loadComposedSellable,
  type ComposedSellable,
  type ComposedSellableKey,
} from "@/lib/results/composed-sellable";
import { isBolsterCaseForLength } from "@/lib/shop/customization-inventory";
import type { ColorOverrideRow } from "@/lib/spatial-fillings/color-overrides";
import {
  bolsterPlacementsToRows,
  flattenToPackList,
  pillowPlacementsToRows,
  placementsExactMatch,
  rowsToBolsterPlacements,
  rowsToPillowPlacements,
  validateBolsterPlacements,
  validatePillowPlacements,
  type AnyPlacement,
  type BolsterPlacementRow,
  type PillowPlacementRow,
} from "@/lib/spatial-fillings/core";
import type { DimensionOverridesPayload } from "@/lib/spatial-fillings/dimension-overrides";
import { PLACEABLE_ITEMS_OR, fillingLabel, isEarPadItem } from "@/lib/spatial-fillings/filling-groups";
import {
  STAFF_BUILD_SOURCE,
  buildPartsLabel,
  fillingSourceLabel,
  isStaffBuildSnapshot,
  type StaffBuildSnapshot,
  type StaffBuildTemplate,
} from "@/lib/staff-orders/build-snapshot";
import {
  round2,
  type StaffOrderBuildDraft,
  type StaffOrderBuildPlacement,
  type StaffOrderBuildSummary,
} from "@/lib/staff-orders/shared";
import type { BolsterVariant, ConfigLine, FillingLine } from "@/lib/types/customization";

export const BUILT_TO_ORDER: ReadonlySet<string> = new Set(["pillow", "bolster"]);

export type BuildVariant = {
  id: string;
  product_id: string;
  pillow_product_id: number | null;
  option1: string | null;
  products: { product_type: string } | null;
};

type BuildSellable = {
  key: ComposedSellableKey;
  ref: ComposedSellableRef;
  pillowProductId: number | null;
  length: BolsterVariant | null;
};

type PlacementRows = Array<PillowPlacementRow | BolsterPlacementRow>;

export type BuildPartOption = { itemId: number; name: string; onHand: number; priceDelta: number | null };

type BuildPart = BuildPartOption & {
  role: PreferenceCategory;
  component: PricedComponent;
  quantity: number;
  subtype: string | null;
  size: string | null;
};

type BuildParts = Record<PreferenceCategory, { options: BuildPart[]; defaultId: number | null }>;

const PART_ROLES: readonly PreferenceCategory[] = ["cover", "case"];

export type StaffOrderBuildOptions = {
  variantId: string;
  productType: "pillow" | "bolster";
  size: string | null;
  tier: string | null;
  length: BolsterVariant | null;
  templates: Array<StaffBuildTemplate & { placements: PlacementRows }>;
  defaultTemplateId: number | null;
  covers: BuildPartOption[];
  cases: BuildPartOption[];
  defaultCoverId: number | null;
  defaultCaseId: number | null;
  items: Array<FillingMixItem & { msrp?: number | null }>;
  colorOverrides: ColorOverrideRow[];
  dimensionOverrides: DimensionOverridesPayload;
};

export type QuotedBuild = {
  unitPrice: number;
  summary: StaffOrderBuildSummary;
  config: Record<string, unknown>;
  snapshot: StaffBuildSnapshot;
};

export type BuildInput = { draft: StaffOrderBuildDraft; variant: BuildVariant; name: string };

type Refusal = { ok: false; status: number; error: string };
const refuse = (error: string, status = 400): Refusal => ({ ok: false, status, error });

const PILLOW_PLACEMENT_COLUMNS =
  "template_id, section, sub_section, slot, item_id, row_index, insert_order, offset_x_mm, offset_y_mm";

export async function resolveBuildSellable(admin: SupabaseClient, variant: BuildVariant): Promise<BuildSellable | null> {
  const productType = variant.products?.product_type;
  if (productType === "pillow") {
    if (variant.pillow_product_id == null) return null;
    const { data, error } = await admin
      .from("pillow_products")
      .select("id, size, kind")
      .eq("id", variant.pillow_product_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const pillowProductId = Number(data.id);
    return {
      key: { productType: "pillow", size: String(data.size), tier: String(data.kind ?? "basic") },
      ref: { pillowProductId },
      pillowProductId,
      length: null,
    };
  }
  if (productType === "bolster") {
    const length = variant.option1?.toLowerCase();
    if (!isBolsterVariant(length)) return null;
    return { key: { productType: "bolster", length }, ref: { length }, pillowProductId: null, length };
  }
  return null;
}

const sizeKeyOf = (key: ComposedSellableKey) => (key.productType === "pillow" ? key.size : key.length);

function priceWithParts(
  sellable: ComposedSellable,
  chosen: { cover: PricedComponent | null; case: PricedComponent | null },
): { ok: true; subtotal: number } | { ok: false; error: string } {
  const recipes = (part: PricedComponent | null, recipe: PricedComponent | null) =>
    part == null || part.item_id === recipe?.item_id;
  const recipeCover = recipes(chosen.cover, sellable.defaultCover);
  if (sellable.msrp != null && recipeCover && recipes(chosen.case, sellable.defaultCase)) {
    return { ok: true, subtotal: sellable.msrp };
  }
  return priceComposedBuild({
    msrpByFamily: sellable.msrpByFamily,
    defaultCover: recipeCover ? null : sellable.defaultCover,
    defaultCase: sellable.defaultCase,
    caseOptions: sellable.caseOptions,
    chosenCover: recipeCover ? null : chosen.cover,
    chosenCase: chosen.case,
    addonLines: [],
  });
}

async function loadBuildParts(
  admin: SupabaseClient,
  key: ComposedSellableKey,
  sellable: ComposedSellable,
): Promise<BuildParts> {
  const offered: Record<PreferenceCategory, Map<number, PricedComponent>> = { cover: new Map(), case: new Map() };
  const recipe: Record<PreferenceCategory, PricedComponent | null> = {
    cover: preferenceCategoryAllowed(key.productType, "cover") ? sellable.defaultCover : null,
    case: sellable.defaultCase,
  };
  for (const role of PART_ROLES) {
    const part = recipe[role];
    if (part) offered[role].set(part.item_id, part);
  }

  if (key.productType === "pillow") {
    const others = { cover: sellable.coverOptions, case: sellable.caseOptions };
    for (const role of PART_ROLES) {
      if (!recipe[role]) continue;
      for (const c of others[role]) if (!offered[role].has(c.item_id)) offered[role].set(c.item_id, c);
    }
  } else if (recipe.case) {
    const { data, error } = await admin
      .from("items")
      .select("id, category, size, price_family")
      .eq("category", "bolster_case")
      .eq("is_active", true);
    if (error) throw new Error(error.message);
    type CaseRow = { id: number; category: string; size: string | null; price_family: string | null };
    const forLength = ((data ?? []) as CaseRow[]).filter(
      (i) => isBolsterCaseForLength(i, key.length) && !offered.case.has(Number(i.id)),
    );
    const msrps = await itemMsrps(
      admin,
      forLength.map((i) => Number(i.id)),
    );
    for (const i of forLength) {
      offered.case.set(Number(i.id), {
        item_id: Number(i.id),
        msrp: msrps.get(Number(i.id)) ?? null,
        family: i.price_family ?? null,
      });
    }
  }

  const ids = PART_ROLES.flatMap((role) => [...offered[role].keys()]);
  type ItemRow = { id: number; name: string; subtype: string | null; size: string | null };
  const named = new Map<number, ItemRow>();
  const onHand = new Map<number, number>();
  if (ids.length > 0) {
    const [items, balances] = await Promise.all([
      admin.from("items").select("id, name, subtype, size").in("id", ids),
      admin.from("inventory_balances").select("item_id, on_hand").in("item_id", ids),
    ]);
    if (items.error) throw new Error(items.error.message);
    if (balances.error) throw new Error(balances.error.message);
    for (const i of (items.data ?? []) as ItemRow[]) named.set(Number(i.id), i);
    for (const b of (balances.data ?? []) as Array<{ item_id: number; on_hand: number | null }>) {
      onHand.set(Number(b.item_id), Number(b.on_hand ?? 0));
    }
  }

  const partsFor = (role: PreferenceCategory) => {
    const defaultId = recipe[role]?.item_id ?? null;
    const options = [...offered[role].values()]
      .map((component): BuildPart => {
        const item = named.get(component.item_id);
        const priced = priceWithParts(sellable, {
          cover: role === "cover" ? component : null,
          case: role === "case" ? component : null,
        });
        return {
          itemId: component.item_id,
          name: item ? (item.subtype ? `${item.name} (${item.subtype})` : item.name) : `Item #${component.item_id}`,
          onHand: onHand.get(component.item_id) ?? 0,
          priceDelta: priced.ok && sellable.msrp != null ? round2(priced.subtotal - sellable.msrp) : null,
          role,
          component,
          quantity: recipe[role]?.quantity ?? 1,
          subtype: item?.subtype ?? null,
          size: item?.size ?? null,
        };
      })
      .sort((a, b) => Number(b.itemId === defaultId) - Number(a.itemId === defaultId) || a.name.localeCompare(b.name));
    return { options, defaultId };
  };
  return { cover: partsFor("cover"), case: partsFor("case") };
}

function chooseParts(
  parts: BuildParts,
  key: ComposedSellableKey,
  draft: Pick<StaffOrderBuildDraft, "cover_item_id" | "case_item_id">,
): { ok: true; cover: BuildPart | null; case: BuildPart | null } | { ok: false; error: string } {
  const wanted: Record<PreferenceCategory, number | null> = { cover: draft.cover_item_id, case: draft.case_item_id };
  const chosen: Record<PreferenceCategory, BuildPart | null> = { cover: null, case: null };
  for (const role of PART_ROLES) {
    const id = wanted[role] ?? parts[role].defaultId;
    if (id == null) continue;
    const part = parts[role].options.find((p) => p.itemId === id);
    if (!part) {
      const error = !preferenceCategoryAllowed(key.productType, role)
        ? `a ${key.productType} has no ${role} to choose.`
        : parts[role].defaultId == null
          ? `its recipe has no ${role}, so there is none to change.`
          : `that ${role} isn't one for this ${key.productType === "pillow" ? "size" : "length"}. Pick another.`;
      return { ok: false, error };
    }
    chosen[role] = part;
  }
  return { ok: true, ...chosen };
}

const toPartOption = ({ itemId, name, onHand, priceDelta }: BuildPart): BuildPartOption => ({
  itemId,
  name,
  onHand,
  priceDelta,
});

async function selectableTemplates(admin: SupabaseClient, key: ComposedSellableKey): Promise<StaffBuildTemplate[]> {
  const sizeKey = sizeKeyOf(key);
  const members = await templateIdsForKey(admin as never, sizeKey);
  if (!members.ok) throw new Error(members.error);
  if (members.ids.length === 0) return [];
  const { data, error } = await admin
    .from("bom_templates")
    .select("id, kind, key, role, is_active, name")
    .eq("kind", key.productType)
    .eq("role", "filling")
    .in("id", members.ids);
  if (error) throw new Error(error.message);
  return filterSelectableFillingTemplates(
    ((data ?? []) as Array<{ id: number; kind: string; key: string; role: string; is_active: boolean; name: string }>).map(
      (t) => ({ ...t, keys: [sizeKey] }),
    ),
    { productType: key.productType, size: sizeKey },
  )
    .map((t) => ({ id: Number(t.id), name: String(t.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function templatePlacements(
  admin: SupabaseClient,
  productType: "pillow" | "bolster",
  templateIds: number[],
): Promise<Map<number, PlacementRows>> {
  const byTemplate = new Map<number, PlacementRows>(templateIds.map((id) => [id, []]));
  if (templateIds.length === 0) return byTemplate;
  const add = (templateId: unknown, row: PillowPlacementRow | BolsterPlacementRow) =>
    byTemplate.get(Number(templateId))?.push(row);

  if (productType === "pillow") {
    const { data, error } = await admin
      .from("filling_template_placements")
      .select(PILLOW_PLACEMENT_COLUMNS)
      .in("template_id", templateIds)
      .order("slot");
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as unknown as Array<PillowPlacementRow & { template_id: number }>) {
      add(r.template_id, {
        section: r.section,
        sub_section: r.sub_section,
        slot: Number(r.slot),
        item_id: Number(r.item_id),
        row_index: r.row_index ?? null,
        insert_order: r.insert_order ?? null,
        offset_x_mm: r.offset_x_mm ?? null,
        offset_y_mm: r.offset_y_mm ?? null,
      });
    }
    return byTemplate;
  }

  const [placed, flat] = await Promise.all([
    admin.from("bolster_template_placements").select("template_id, slot, item_id").in("template_id", templateIds).order("slot"),
    admin.from("bom_template_lines").select("template_id, item_id, quantity").in("template_id", templateIds),
  ]);
  if (placed.error) throw new Error(placed.error.message);
  if (flat.error) throw new Error(flat.error.message);
  const laidOut = new Set<number>();
  for (const r of (placed.data ?? []) as Array<{ template_id: number; slot: number; item_id: number }>) {
    laidOut.add(Number(r.template_id));
    add(r.template_id, { slot: Number(r.slot), item_id: Number(r.item_id) });
  }
  for (const r of (flat.data ?? []) as Array<{ template_id: number; item_id: number; quantity: number }>) {
    const rows = byTemplate.get(Number(r.template_id));
    if (!rows || laidOut.has(Number(r.template_id))) continue;
    for (let n = 0; n < Number(r.quantity); n++) rows.push({ slot: rows.length + 1, item_id: Number(r.item_id) });
  }
  return byTemplate;
}

export async function loadBuildOptions(
  admin: SupabaseClient,
  variantId: string,
): Promise<{ ok: true; options: StaffOrderBuildOptions } | Refusal> {
  const { data, error } = await admin
    .from("product_variants")
    .select("id, product_id, pillow_product_id, option1, is_active, products!inner(product_type, status)")
    .eq("id", variantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const variant = data as unknown as (BuildVariant & { is_active: boolean; products: { status: string } | null }) | null;
  if (!variant || !variant.is_active || variant.products?.status === "archived") {
    return refuse("This product is no longer for sale.", 404);
  }
  const sellable = await resolveBuildSellable(admin, variant);
  if (!sellable) return refuse("This product isn't a pillow or bolster built to order.");

  const { key } = sellable;
  const [templates, defaultTemplateId, overrides, itemsRes, composed] = await Promise.all([
    selectableTemplates(admin, key),
    getDefaultFillingTemplateId(admin, key),
    loadXrayOverrides(admin),
    admin.from("items").select("id, name, subtype, size, category").or(PLACEABLE_ITEMS_OR).eq("is_active", true).order("name"),
    loadComposedSellable(admin, key),
  ]);
  if (!overrides.ok) throw new Error(overrides.error);
  if (itemsRes.error) throw new Error(itemsRes.error.message);
  const parts = composed.ok ? await loadBuildParts(admin, key, composed.sellable) : null;

  const placements = await templatePlacements(
    admin,
    key.productType,
    templates.map((t) => t.id),
  );
  const fillingsOnly = key.productType === "bolster" || key.tier !== "premium";
  const toItem = (i: Record<string, unknown>): FillingMixItem => ({
    id: Number(i.id),
    name: String(i.name),
    subtype: (i.subtype as string | null) ?? null,
    size: (i.size as string | null) ?? null,
    category: String(i.category),
  });
  const placeable = ((itemsRes.data ?? []) as Array<Record<string, unknown>>).map(toItem);
  const byId = new Map(placeable.map((i) => [i.id, i]));
  const placed = [...new Set([...placements.values()].flatMap((rows) => rows.map((p) => p.item_id)))];
  const retired = placed.filter((id) => !byId.has(id));
  if (retired.length > 0) {
    const { data: extra, error: extraError } = await admin
      .from("items")
      .select("id, name, subtype, size, category")
      .in("id", retired);
    if (extraError) throw new Error(extraError.message);
    for (const item of ((extra ?? []) as Array<Record<string, unknown>>).map(toItem)) byId.set(item.id, item);
  }

  const charged = [...byId.values()].filter(isEarPadItem).map((i) => i.id);
  const chargedMsrp = await itemMsrps(admin, charged);

  const allowed = (itemId: number) => !fillingsOnly || byId.get(itemId)?.category === "filling";
  const laidOut = templates
    .map((t) => ({ ...t, placements: placements.get(t.id) ?? [] }))
    .filter((t) => t.placements.length > 0 && t.placements.every((p) => allowed(p.item_id)));
  const inTemplates = new Set(laidOut.flatMap((t) => t.placements.map((p) => p.item_id)));
  const items = [
    ...placeable.filter((i) => allowed(i.id)),
    ...retired.filter((id) => inTemplates.has(id)).flatMap((id) => byId.get(id) ?? []),
  ].map((i) => (charged.includes(i.id) ? { ...i, msrp: chargedMsrp.get(i.id) ?? null } : i));

  return {
    ok: true,
    options: {
      variantId: variant.id,
      productType: key.productType,
      size: key.productType === "pillow" ? key.size : null,
      tier: key.productType === "pillow" ? key.tier : null,
      length: sellable.length,
      templates: laidOut,
      defaultTemplateId: laidOut.some((t) => t.id === defaultTemplateId) ? defaultTemplateId : null,
      covers: (parts?.cover.options ?? []).map(toPartOption),
      cases: (parts?.case.options ?? []).map(toPartOption),
      defaultCoverId: parts?.cover.defaultId ?? null,
      defaultCaseId: parts?.case.defaultId ?? null,
      items,
      colorOverrides: overrides.colorOverrides,
      dimensionOverrides: overrides.dimensionOverrides,
    },
  };
}

async function itemMsrps(admin: SupabaseClient, itemIds: number[]): Promise<Map<number, number>> {
  const msrps = new Map<number, number>();
  if (itemIds.length === 0) return msrps;
  const { data, error } = await admin.from("item_prices").select("item_id, msrp").in("item_id", itemIds);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as Array<{ item_id: number; msrp: number | string | null }>) {
    if (row.msrp != null) msrps.set(Number(row.item_id), Number(row.msrp));
  }
  return msrps;
}

async function placedExtras(
  admin: SupabaseClient,
  placements: AnyPlacement[],
): Promise<{ ok: true; amount: number } | { ok: false; error: string }> {
  const pack = flattenToPackList(placements);
  const { data, error } = await admin
    .from("items")
    .select("id, category, name")
    .in(
      "id",
      pack.map((l) => l.item_id),
    );
  if (error) throw new Error(error.message);
  const itemById = new Map(
    ((data ?? []) as Array<{ id: number; category: string; name: string }>).map((i) => [Number(i.id), i]),
  );
  const charged = pack.filter((l) => {
    const item = itemById.get(l.item_id);
    return item !== undefined && isEarPadItem(item);
  });
  const lines = placedChargeLines(pack, itemById, await itemMsrps(admin, charged.map((l) => l.item_id)));
  if (lines.some((l) => l.msrp == null)) {
    return { ok: false, error: "an Ear Comfort Pad placed in it has no price. Set it in Costings first." };
  }
  return { ok: true, amount: round2(lines.reduce((sum, l) => sum + (l.msrp ?? 0) * l.quantity, 0)) };
}

async function parsePlacements(
  admin: SupabaseClient,
  key: ComposedSellableKey,
  rows: StaffOrderBuildPlacement[],
): Promise<{ ok: true; placements: AnyPlacement[]; rows: PlacementRows } | { ok: false; error: string }> {
  const kinds = await lookupPlacementKinds(admin, [...new Set(rows.map((r) => r.item_id))]);
  if (!kinds.ok) return kinds;

  if (key.productType === "bolster") {
    const placements = rowsToBolsterPlacements(rows.map((r) => ({ slot: r.slot, item_id: r.item_id })));
    const valid = validateBolsterPlacements(placements, kinds.byId);
    return valid.ok ? { ok: true, placements, rows: bolsterPlacementsToRows(placements) } : valid;
  }

  if (rows.some((r) => !r.section || !r.sub_section)) {
    return { ok: false, error: "Every filling in a pillow needs a Section and a sub-section." };
  }
  const placements = rowsToPillowPlacements(rows as PillowPlacementRow[]);
  const valid = validatePillowPlacements(placements, kinds.byId, { tier: key.tier });
  return valid.ok ? { ok: true, placements, rows: pillowPlacementsToRows(placements) } : valid;
}

async function matchTemplate(
  admin: SupabaseClient,
  key: ComposedSellableKey,
  templateId: number | null,
  placements: AnyPlacement[],
): Promise<{ ok: true; matched: StaffBuildTemplate | null; basedOn: StaffBuildTemplate | null } | { ok: false; error: string }> {
  if (templateId == null) return { ok: true, matched: null, basedOn: null };
  const template = (await selectableTemplates(admin, key)).find((t) => t.id === templateId);
  if (!template) return { ok: false, error: "That Filling Template isn't one for this size. Pick another." };
  const rows = (await templatePlacements(admin, key.productType, [template.id])).get(template.id) ?? [];
  const theirs: AnyPlacement[] =
    key.productType === "bolster"
      ? rowsToBolsterPlacements(rows as BolsterPlacementRow[])
      : rowsToPillowPlacements(rows as PillowPlacementRow[]);
  const same = theirs.length > 0 && placementsExactMatch(placements, theirs);
  return { ok: true, matched: same ? template : null, basedOn: template };
}

async function fillingLinesFor(admin: SupabaseClient, placements: AnyPlacement[]): Promise<FillingLine[]> {
  const pack = flattenToPackList(placements);
  const { data, error } = await admin
    .from("items")
    .select("id, name, subtype, size")
    .in(
      "id",
      pack.map((l) => l.item_id),
    );
  if (error) throw new Error(error.message);
  type ItemRow = { id: number; name: string; subtype: string | null; size: string | null };
  const byId = new Map(((data ?? []) as ItemRow[]).map((i) => [Number(i.id), { ...i, id: Number(i.id) }]));
  return pack.map((l) => {
    const item = byId.get(l.item_id);
    return {
      item_id: l.item_id,
      subtype: item?.subtype ?? "",
      name: item ? fillingLabel(item) : `Item #${l.item_id}`,
      quantity: l.count,
    };
  });
}

export async function buildShortage(
  admin: SupabaseClient,
  build: {
    ref: ComposedSellableRef;
    configLines: ReadonlyArray<{ item_id: number; quantity: number; category: string }>;
    fillingLines: ReadonlyArray<{ item_id: number; quantity: number }>;
    quantity: number;
  },
  reserved: Map<number, number>,
): Promise<string | null> {
  const lines = await composedBuildLines(admin, build.ref, [
    ...build.configLines.map((l) => ({ item_id: Number(l.item_id), quantity: Number(l.quantity), category: String(l.category) })),
    ...build.fillingLines.map((l) => ({ item_id: Number(l.item_id), quantity: Number(l.quantity), category: "filling" })),
  ]);
  const needed = new Map<number, number>();
  for (const l of lines) needed.set(l.item_id, (needed.get(l.item_id) ?? 0) + l.quantity * build.quantity);
  const ids = [...needed.keys()];
  if (ids.length === 0) return null;

  const [balances, items] = await Promise.all([
    admin.from("inventory_balances").select("item_id, on_hand").in("item_id", ids),
    admin.from("items").select("id, name, subtype, size").in("id", ids),
  ]);
  if (balances.error) throw new Error(balances.error.message);
  if (items.error) throw new Error(items.error.message);
  const onHand = new Map(
    ((balances.data ?? []) as Array<{ item_id: number; on_hand: number | null }>).map((b) => [Number(b.item_id), Number(b.on_hand ?? 0)]),
  );
  const nameOf = new Map(
    ((items.data ?? []) as Array<{ id: number; name: string; subtype: string | null; size: string | null }>).map((i) => [
      Number(i.id),
      fillingLabel({ ...i, id: Number(i.id) }),
    ]),
  );

  const short: string[] = [];
  for (const [itemId, qty] of needed) {
    const have = Math.max(0, (onHand.get(itemId) ?? 0) - (reserved.get(itemId) ?? 0));
    if (have < qty) short.push(`${nameOf.get(itemId) ?? `Item #${itemId}`} (need ${qty}, have ${have})`);
  }
  if (short.length > 0) return short.join(", ");
  for (const [itemId, qty] of needed) reserved.set(itemId, (reserved.get(itemId) ?? 0) + qty);
  return null;
}

export async function quoteBuilds(
  admin: SupabaseClient,
  inputs: BuildInput[],
  reserved: Map<number, number>,
): Promise<{ ok: true; builds: QuotedBuild[] } | Refusal> {
  const builds: QuotedBuild[] = [];
  for (const { draft, variant, name } of inputs) {
    const sellable = await resolveBuildSellable(admin, variant);
    if (!sellable) return refuse(`${name} isn't linked to a size in Inventory, so it can't be built. Sync it from Inventory first.`);
    const { key } = sellable;

    const composed = await loadComposedSellable(admin, key);
    const shelf = composed.ok ? composed.sellable.msrp : null;
    if (!composed.ok || shelf == null || !Number.isFinite(shelf) || shelf < 0) {
      const why = composed.ok ? composed.sellable.priceFault?.error : composed.error;
      return refuse(`${name} has no price. Set it in Costings first.${why ? ` (${why}.)` : ""}`);
    }

    const parsed = await parsePlacements(admin, key, draft.placements);
    if (!parsed.ok) return refuse(`${name}: ${parsed.error}`);

    const template = await matchTemplate(admin, key, draft.filling_template_id, parsed.placements);
    if (!template.ok) return refuse(`${name}: ${template.error}`);

    const extras = await placedExtras(admin, parsed.placements);
    if (!extras.ok) return refuse(`${name}: ${extras.error}`);

    const chosen = chooseParts(await loadBuildParts(admin, key, composed.sellable), key, draft);
    if (!chosen.ok) return refuse(`${name}: ${chosen.error}`);
    const priced = priceWithParts(composed.sellable, {
      cover: chosen.cover?.component ?? null,
      case: chosen.case?.component ?? null,
    });
    if (!priced.ok) {
      return refuse(`${name} has no price with that cover and case. Set it in Costings first. (${priced.error}.)`);
    }
    const configLines: ConfigLine[] = [chosen.cover, chosen.case].flatMap((part) =>
      part
        ? [
            {
              item_id: part.itemId,
              category: part.role,
              ...(part.subtype ? { subtype: part.subtype } : {}),
              name: part.name,
              ...(part.size ? { size: part.size } : {}),
              quantity: part.quantity,
              is_addon: false,
              price_delta: part.component.msrp ?? 0,
            },
          ]
        : [],
    );

    const fillingLines = await fillingLinesFor(admin, parsed.placements);
    const shortage = await buildShortage(
      admin,
      { ref: sellable.ref, configLines, fillingLines, quantity: draft.quantity },
      reserved,
    );
    if (shortage) return refuse(`Not enough stock to build ${name}: ${shortage}.`);

    const filling = fillingSourceLabel(template);
    const pieces = parsed.placements.length;
    const partNames = { cover: chosen.cover?.name ?? null, case: chosen.case?.name ?? null };
    const summary = [`Fillings: ${filling}`, `${pieces} piece${pieces === 1 ? "" : "s"}`, buildPartsLabel(partNames)]
      .filter(Boolean)
      .join(" · ");
    builds.push({
      unitPrice: round2(priced.subtotal + extras.amount),
      summary: {
        productType: key.productType,
        filling,
        adjusted: !template.matched,
        pieces,
        placedExtras: extras.amount,
        ...partNames,
      },
      config: {
        product_type: key.productType,
        pillow_product_id: sellable.pillowProductId,
        bolster_variant: sellable.length,
        ecom_product_id: variant.product_id,
        bom_template_id: template.matched?.id ?? null,
        config_lines: configLines,
        filling_lines: fillingLines,
        cover_variant: partNames.cover,
        case_variant: partNames.case,
        llm_metadata: { source: STAFF_BUILD_SOURCE },
        summary,
        total_addon_price: extras.amount,
      },
      snapshot: {
        source: STAFF_BUILD_SOURCE,
        product_type: key.productType,
        pillow_product_id: sellable.pillowProductId,
        bolster_variant: sellable.length,
        filling_template_id: template.matched?.id ?? null,
        filling_template_name: template.matched?.name ?? null,
        based_on_template: template.basedOn,
        filling_placements: parsed.rows,
        config_lines: configLines,
        filling_lines: fillingLines,
        total_addon_price: extras.amount,
        summary,
      },
    });
  }
  return { ok: true, builds };
}

type SavedLine = {
  variant_id?: string | null;
  kind?: string | null;
  product_title: string;
  variant_title: string | null;
  quantity: number;
  customization_snapshot?: unknown;
};

async function soldAsItems(admin: SupabaseClient, items: ReadonlyArray<SavedLine>): Promise<Map<number, number>> {
  const reserved = new Map<number, number>();
  const plain = items.filter((i) => i.variant_id && i.kind !== "service" && !isStaffBuildSnapshot(i.customization_snapshot));
  if (plain.length === 0) return reserved;
  const { data, error } = await admin
    .from("product_variants")
    .select("id, item_id")
    .in(
      "id",
      plain.map((i) => i.variant_id),
    );
  if (error) throw new Error(error.message);
  const itemOf = new Map(((data ?? []) as Array<{ id: string; item_id: number | null }>).map((v) => [v.id, v.item_id]));
  for (const line of plain) {
    const itemId = itemOf.get(line.variant_id!);
    if (itemId != null) reserved.set(Number(itemId), (reserved.get(Number(itemId)) ?? 0) + line.quantity);
  }
  return reserved;
}

export async function savedBuildsShortage(
  admin: SupabaseClient,
  items: ReadonlyArray<SavedLine>,
): Promise<string | null> {
  if (!items.some((i) => isStaffBuildSnapshot(i.customization_snapshot))) return null;
  const reserved = await soldAsItems(admin, items);
  for (const item of items) {
    const snapshot = item.customization_snapshot;
    if (!isStaffBuildSnapshot(snapshot)) continue;
    const ref: ComposedSellableRef | null =
      snapshot.product_type === "pillow"
        ? snapshot.pillow_product_id != null
          ? { pillowProductId: snapshot.pillow_product_id }
          : null
        : isBolsterVariant(snapshot.bolster_variant)
          ? { length: snapshot.bolster_variant }
          : null;
    if (!ref) continue;
    const shortage = await buildShortage(
      admin,
      {
        ref,
        configLines: Array.isArray(snapshot.config_lines) ? snapshot.config_lines : [],
        fillingLines: snapshot.filling_lines,
        quantity: item.quantity,
      },
      reserved,
    );
    if (shortage) {
      const name = [item.product_title, item.variant_title].filter(Boolean).join(" · ");
      return `Not enough stock to build ${name}: ${shortage}.`;
    }
  }
  return null;
}
