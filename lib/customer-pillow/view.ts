/**
 * The Customer's pillow as the Customer page shows it (ADR 0042 j). Type-only,
 * so the browser shares it with the server reader (`load.ts`).
 */
import type { ColorOverrideRow } from "@/lib/spatial-fillings/color-overrides";
import type { PillowPlacementRow } from "@/lib/spatial-fillings/core";
import type { DimensionOverridesPayload } from "@/lib/spatial-fillings/dimension-overrides";
import type { FillingMixItem } from "@/lib/results/admin/filling-mix";
import type { PillowOwnership } from "./bought";
import type { FittingTemplateMatch, MatchableTemplate, PillowSizeKey } from "./match";

export type CustomerPillowView = {
  /**
   * Where the pillow drawn comes from: a Staff member's link, the latest
   * pillow bought here as it was built, the latest Fitting record that names
   * one, or nothing on record.
   */
  source: "linked" | "order" | "fitting" | "none";
  size: PillowSizeKey | null;
  /**
   * The Filling Template drawn; null when none is linked or matched, or for an
   * order's custom mix. An order's is the one it was built from, by the name it
   * had then.
   */
  template: MatchableTemplate | null;
  /** Staff's link, when there is one. */
  link: { linkedAt: string; linkedBy: string | null } | null;
  /** The latest pillow bought here whose build the line froze, shown under a link too. */
  order: {
    orderId: string;
    orderNumber: string | null;
    paidAt: string;
    size: PillowSizeKey | null;
    templateName: string | null;
  } | null;
  /** The fitting the match is read from, shown under a link too, as what the record says. */
  fitting: { id: string; fittedAt: string; label: string } | null;
  match: FittingTemplateMatch | null;
  /** The template's placements as it is now, or an order's as it was built; empty with neither. */
  placements: PillowPlacementRow[];
  /** The Items the placements name, for the x-ray's colours and the pack list. */
  items: FillingMixItem[];
  colorOverrides: ColorOverrideRow[];
  dimensionOverrides: DimensionOverridesPayload | undefined;
  /** Every active pillow Filling Template, for Change. */
  templates: MatchableTemplate[];
  /** What says they have a pillow (`pillowOwnership`), or null when nothing does. */
  ownership: PillowOwnership | null;
  /** Whether their Profile draws it: something says they have it, and there is something to draw. */
  onProfile: boolean;
};

/**
 * The pillow on the Customer's own Profile (ADR 0042 k), copied field by field
 * from the Customer page's view (`ownPillowView`): no Staff name, no notice,
 * no catalog of other templates, and no fitting codes. Only once something
 * says they bought it.
 */
export type OwnPillowView = {
  source: "linked" | "order" | "fitting";
  size: PillowSizeKey | null;
  /** The template's name (`Type-12`); null for an order's custom mix. */
  name: string | null;
  /** The order it was built for. */
  orderNumber: string | null;
  /** When it was bought (an order) or fitted (a fitting); null for a link. */
  date: string | null;
  placements: PillowPlacementRow[];
  items: FillingMixItem[];
  colorOverrides: ColorOverrideRow[];
  dimensionOverrides: DimensionOverridesPayload | undefined;
};

/** What the page read: the pillow, or null when the read failed. */
export type CustomerPillowResult = CustomerPillowView | null;

/** Body of `PUT /api/shop/customers/[id]/pillow`. */
export type CustomerPillowLinkInput = { size: PillowSizeKey; fillingTemplateId: number | null };
