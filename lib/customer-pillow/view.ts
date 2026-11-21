import type { ColorOverrideRow } from "@/lib/spatial-fillings/color-overrides";
import type { PillowPlacementRow } from "@/lib/spatial-fillings/core";
import type { DimensionOverridesPayload } from "@/lib/spatial-fillings/dimension-overrides";
import type { FillingMixItem } from "@/lib/results/admin/filling-mix";
import type { PillowOwnership } from "./bought";
import type { FittingTemplateMatch, MatchableTemplate, PillowSizeKey } from "./match";

export type CustomerPillowView = {
  source: "linked" | "order" | "fitting" | "none";
  size: PillowSizeKey | null;
  template: MatchableTemplate | null;
  link: { linkedAt: string; linkedBy: string | null; readjusted: boolean } | null;
  order: {
    orderId: string;
    orderNumber: string | null;
    paidAt: string;
    size: PillowSizeKey | null;
    templateName: string | null;
  } | null;
  fitting: { id: string; fittedAt: string; label: string } | null;
  match: FittingTemplateMatch | null;
  placements: PillowPlacementRow[];
  items: FillingMixItem[];
  colorOverrides: ColorOverrideRow[];
  dimensionOverrides: DimensionOverridesPayload | undefined;
  templates: MatchableTemplate[];
  ownership: PillowOwnership | null;
  onProfile: boolean;
};

export type OwnPillowView = {
  source: "linked" | "order" | "fitting";
  size: PillowSizeKey | null;
  name: string | null;
  orderNumber: string | null;
  date: string | null;
  readjusted: boolean;
  placements: PillowPlacementRow[];
  items: FillingMixItem[];
  colorOverrides: ColorOverrideRow[];
  dimensionOverrides: DimensionOverridesPayload | undefined;
};

export type CustomerPillowResult = CustomerPillowView | null;

export type CustomerPillowLinkInput = { size: PillowSizeKey; fillingTemplateId: number | null };

export type CustomerPillowReadjustInput = {
  size: PillowSizeKey;
  fillingTemplateId: number | null;
  placements: PillowPlacementRow[];
};

export function ownPillowView(pillow: CustomerPillowView): OwnPillowView | null {
  return pillow.onProfile ? customerFacingPillow(pillow) : null;
}

export function customerFacingPillow(pillow: CustomerPillowView): OwnPillowView | null {
  if (pillow.source === "none") return null;
  return {
    source: pillow.source,
    size: pillow.size,
    name: pillow.template?.name ?? null,
    orderNumber: pillow.source === "order" ? (pillow.order?.orderNumber ?? null) : null,
    date:
      pillow.source === "order"
        ? (pillow.order?.paidAt ?? null)
        : pillow.source === "fitting"
          ? (pillow.fitting?.fittedAt ?? null)
          : pillow.link?.readjusted
            ? pillow.link.linkedAt
            : null,
    readjusted: pillow.source === "linked" && pillow.link?.readjusted === true,
    placements: pillow.placements.map((p) => ({
      section: p.section,
      sub_section: p.sub_section,
      slot: p.slot,
      item_id: p.item_id,
      row_index: p.row_index ?? null,
      insert_order: p.insert_order ?? null,
      offset_x_mm: p.offset_x_mm ?? null,
      offset_y_mm: p.offset_y_mm ?? null,
    })),
    items: pillow.items.map((i) => ({ id: i.id, name: i.name, subtype: i.subtype, size: i.size, category: i.category })),
    colorOverrides: pillow.colorOverrides,
    dimensionOverrides: pillow.dimensionOverrides,
  };
}
