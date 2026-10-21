import type { Permission } from "@/lib/auth/permissions";

/**
 * The Customer timeline's shapes (CONTEXT.md; ADR 0027 (b)). Type-only and free
 * of server imports, so the Admin Panel's browser code shares them.
 */

/** A kind group: one filter chip on the Customer detail. */
export type TimelineGroup = { readonly key: string; readonly label: string };

/** What happened, e.g. `"order.paid"`. Each adapter declares its own. */
export type TimelineKind = string;

/** The record an entry is about: its Admin Panel link, when it has a page. */
export type TimelineRef = {
  type: string;
  id: string;
  /**
   * Locale-less Admin Panel path (`/settings/orders/<id>`). Left out for a viewer
   * without the permission that page needs (`permissionForHref`).
   */
  href?: string;
};

export type TimelineEntry = {
  /** Unique across the whole timeline, e.g. `"order.paid:<order id>"`. */
  id: string;
  /** ISO timestamp the entry sorts by: a time the source table stored, never derived. */
  at: string;
  kind: TimelineKind;
  ref: TimelineRef;
  /** One line, with no PII beyond what the detail page already shows. */
  summary: string;
  /** The record's current status, shown as a pill. A status with no stored time is shown only here. */
  status?: string;
  /** Longer text shown under the summary (a note, in full). */
  detail?: string;
};

/** An entry as the route returns it: tagged with its adapter's kind group. */
export type ShownTimelineEntry = TimelineEntry & { group: string };

/** The Customer whose timeline is read. */
export type TimelineCustomer = { id: string; email: string | null };

/**
 * What an adapter returns: its newest entries at or before the cursor, and how
 * far down they are complete.
 *
 * `floor` is null when the source holds nothing older than what it returned.
 * Otherwise it is the time at and below which the source may hold entries it did
 * not return: for one bounded query, the sort column of its last row when the
 * query came back full. The merge shows nothing at or below the highest floor,
 * so an adapter is never asked to be exact, only honest.
 */
export type TimelineBatch = { entries: TimelineEntry[]; floor: string | null };

export type TimelineAdapter = {
  /** Stable name, for logs. */
  key: string;
  group: TimelineGroup;
  kinds: readonly TimelineKind[];
  /** The viewer must hold it, or the adapter is skipped: its kinds are never read. */
  permission: Permission;
  /**
   * Entries at or before `before` (an ISO time; null for the newest page), at
   * most `limit` per bounded read, so a Customer with years of history costs the
   * same as a new one. Entries exactly at `before` may already have been shown:
   * the merge drops those.
   */
  load(customer: TimelineCustomer, before: string | null, limit: number): Promise<TimelineBatch>;
};

/** Where the last page ended: the sort key of its last entry. */
export type TimelineCursor = { at: string; kind: string; refId: string; id: string };
