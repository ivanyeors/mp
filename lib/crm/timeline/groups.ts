import type { TimelineGroup } from "@/lib/crm/timeline/types";

/**
 * The kind groups: one filter chip each on the Customer detail. A chip shows
 * only when the viewer holds the permission of at least one adapter in it, and
 * the chips follow the order of `TIMELINE_ADAPTERS`. A new source either joins
 * a group here or adds its own.
 */
export const ORDERS_GROUP: TimelineGroup = { key: "orders", label: "Orders" };
export const RESULTS_GROUP: TimelineGroup = { key: "results", label: "Results" };
export const READJUSTMENTS_GROUP: TimelineGroup = { key: "readjustments", label: "Re-adjustments" };
export const RETURNS_GROUP: TimelineGroup = { key: "returns", label: "Returns" };
export const REVIEWS_GROUP: TimelineGroup = { key: "reviews", label: "Reviews" };
export const NOTES_GROUP: TimelineGroup = { key: "notes", label: "Notes" };
