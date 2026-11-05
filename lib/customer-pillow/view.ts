/**
 * The Customer's pillow as the Customer page shows it (ADR 0042 j). Type-only,
 * so the browser shares it with the server reader (`load.ts`).
 */
import type { ColorOverrideRow } from "@/lib/spatial-fillings/color-overrides";
import type { PillowPlacementRow } from "@/lib/spatial-fillings/core";
import type { DimensionOverridesPayload } from "@/lib/spatial-fillings/dimension-overrides";
import type { FillingMixItem } from "@/lib/results/admin/filling-mix";
import type { FittingTemplateMatch, MatchableTemplate, PillowSizeKey } from "./match";

export type CustomerPillowView = {
  /**
   * Where the pillow drawn comes from: a Staff member's link, the latest
   * Fitting record that names one, or nothing on record.
   */
  source: "linked" | "fitting" | "none";
  size: PillowSizeKey | null;
  /** The Filling Template drawn; null when none is linked or matched. */
  template: MatchableTemplate | null;
  /** Staff's link, when there is one. */
  link: { linkedAt: string; linkedBy: string | null } | null;
  /** The fitting the match is read from, shown under a link too, as what the record says. */
  fitting: { id: string; fittedAt: string; label: string } | null;
  match: FittingTemplateMatch | null;
  /** The template's placements as it is now; empty with no template. */
  placements: PillowPlacementRow[];
  /** The Items the placements name, for the x-ray's colours and the pack list. */
  items: FillingMixItem[];
  colorOverrides: ColorOverrideRow[];
  dimensionOverrides: DimensionOverridesPayload | undefined;
  /** Every active pillow Filling Template, for Change. */
  templates: MatchableTemplate[];
};

/** What the page read: the pillow, or null when the read failed. */
export type CustomerPillowResult = CustomerPillowView | null;

/** Body of `PUT /api/shop/customers/[id]/pillow`. */
export type CustomerPillowLinkInput = { size: PillowSizeKey; fillingTemplateId: number | null };
