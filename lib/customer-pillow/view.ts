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
