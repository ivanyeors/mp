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
export const AFTERCARE_GROUP: TimelineGroup = { key: "aftercare", label: "Aftercare" };
/** Marketing consent (migration 07); campaign sends (migration 08) join it. */
export const MARKETING_GROUP: TimelineGroup = { key: "marketing", label: "Marketing" };
/** The Customer's account: imported from Shopify, Claimed, the Claim bonus (migration PRD, PRD-loyalty-points). */
export const ACCOUNT_GROUP: TimelineGroup = { key: "account", label: "Account" };
/** Follow-ups (CRM 06): added, and done. */
export const FOLLOW_UPS_GROUP: TimelineGroup = { key: "followups", label: "Follow-ups" };
