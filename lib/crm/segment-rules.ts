import { z } from "zod";
import {
  CUSTOMER_FILTER_KEYS,
  DEFAULT_CUSTOMER_FILTERS,
  customerFilterParams,
  customerFiltersSchema,
  type CustomerFilterKey,
  type CustomerFilters,
} from "@/lib/crm/customer-filters";

/**
 * The parts of Segments (lib/crm/segments.ts; CONTEXT.md **Segment**) the
 * Admin Panel's browser code shares with the routes: the name rule, and how
 * a Segment's filters are written and read.
 *
 * A Segment stores the Customers list's own URL parameters, only the keys that
 * choose Customers (`CUSTOMER_FILTER_KEYS`: never the sort or the page), as
 * `customerFilterParams` writes them. It reads them back through the list's
 * one schema (`customerFiltersSchema`), so a Segment and the same filters in
 * the URL go through one parse and one mapping (`applyCustomerFilters`) and
 * return the same Customers (ADR 0028 (c)).
 *
 * Filters are checked both ways:
 *
 * - **Saving** (`parseSegmentFilters`) refuses anything the schema would
 *   drop: an unknown key, the sort or the page, a value it does not know.
 * - **Reading** (`readSegmentFilters`) parses again. A filter the schema no
 *   longer recognises is named in `ignored` and the Segment *needs review*:
 *   it counts and resolves no Customers until Staff update it, so it is never
 *   silently widened to more Customers than it was saved for.
 */

export const SEGMENT_NAME_MAX = 80;

/**
 * The filter schema's shape a Segment is saved in (`filters_version`). A
 * change that renames or reshapes a parameter bumps it and adds the upgrade
 * from the old shape to `SEGMENT_UPGRADES`; without one, a Segment of
 * another version needs review.
 *
 * 2 (PRD-loyalty-points slice 06): the Welcome-back voucher filter
 * (`voucher`) is retired with the voucher, and *Points* (`points`) is new.
 */
export const SEGMENT_FILTERS_VERSION = 2;

type StoredFilters = Record<string, unknown>;

/**
 * How a Segment saved at version N reads at N + 1, applied in turn up to
 * `SEGMENT_FILTERS_VERSION` each time it is read. The row is rewritten at the
 * current version only when Staff next update it.
 */
const SEGMENT_UPGRADES: Partial<Record<number, (stored: StoredFilters) => StoredFilters>> = {
  // 1 → 2: drop the retired voucher filter. The rest of the Segment stands,
  // so it returns the same Customers, less that one filter.
  1: (stored) => Object.fromEntries(Object.entries(stored).filter(([key]) => key !== "voucher")),
};

/** `stored` upgraded from `version` to the current shape, or null when no upgrade leads there. */
function upgradeStoredFilters(stored: StoredFilters, version: number): StoredFilters | null {
  if (!Number.isInteger(version) || version > SEGMENT_FILTERS_VERSION) return null;
  let entries = stored;
  for (let v = version; v < SEGMENT_FILTERS_VERSION; v++) {
    const upgrade = SEGMENT_UPGRADES[v];
    if (!upgrade) return null;
    entries = upgrade(entries);
  }
  return entries;
}

/** A Segment's filters as stored: the list's URL parameters that choose Customers. */
export type SegmentParams = Partial<Record<CustomerFilterKey, string>>;

export const SegmentNameSchema = z
  .string()
  .trim()
  .min(1, "Give the Segment a name.")
  .max(SEGMENT_NAME_MAX, `A Segment name is at most ${SEGMENT_NAME_MAX} characters.`);

const isFilterKey = (key: string): key is CustomerFilterKey =>
  (CUSTOMER_FILTER_KEYS as readonly string[]).includes(key);

/**
 * What a Segment stores for `filters`: the parameters that choose Customers,
 * in the list's own order, only where they differ from the default. Two sets
 * of filters that choose the same Customers write the same parameters.
 */
export function segmentParams(filters: Partial<CustomerFilters>): SegmentParams {
  const all = customerFilterParams(filters);
  const out: SegmentParams = {};
  for (const key of CUSTOMER_FILTER_KEYS) {
    const value = all.get(key);
    if (value != null) out[key] = value;
  }
  return out;
}

/**
 * The filters a Segment's parameters choose, every other filter at its
 * default: what choosing the Segment puts on the list. The list keeps its
 * own sort.
 */
export function chosenSegmentFilters(params: SegmentParams): Pick<CustomerFilters, CustomerFilterKey> {
  const { filters } = readEntries(params);
  const out = { ...DEFAULT_CUSTOMER_FILTERS, ...filters };
  return Object.fromEntries(CUSTOMER_FILTER_KEYS.map((k) => [k, out[k]])) as Pick<CustomerFilters, CustomerFilterKey>;
}

/**
 * *Email this Segment* (PRD-crm-retention-loop slice 02): the new campaign
 * page sent to this Segment, or null when the role cannot send campaigns
 * (`newCampaignPath` undefined) or the Segment needs review and so counts
 * nobody until it is updated.
 */
export function segmentCampaignHref(
  newCampaignPath: string | undefined,
  segment: Pick<CustomerSegment, "id" | "needsReview">,
): string | null {
  if (!newCampaignPath || segment.needsReview) return null;
  return `${newCampaignPath}?segment=${encodeURIComponent(segment.id)}`;
}

/** The Customers list showing a Segment: `listPath` with its filters, or bare when it has none. */
export function segmentHref(listPath: string, params: SegmentParams): string {
  const key = segmentKey(params);
  return key ? `${listPath}?${key}` : listPath;
}

/** The parameters as one canonical string: what *same filters* means. */
export function segmentKey(params: SegmentParams): string {
  const out = new URLSearchParams();
  for (const key of CUSTOMER_FILTER_KEYS) {
    const value = params[key];
    if (value != null) out.set(key, value);
  }
  return out.toString();
}

/** Whether two sets of parameters choose the same Customers. */
export function sameSegmentFilters(a: SegmentParams, b: SegmentParams): boolean {
  return segmentKey(a) === segmentKey(b);
}

/** `key=value`, for naming a refused or ignored filter. */
const entryLabel = (key: string, value: unknown) =>
  `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`;

/** Each stored entry the schema reads, and each it does not, named. */
function readEntries(raw: Record<string, unknown>): { filters: Partial<CustomerFilters>; refused: string[] } {
  const filters: Partial<CustomerFilters> = {};
  const refused: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (!isFilterKey(key) || typeof value !== "string") {
      refused.push(entryLabel(key, value));
      continue;
    }
    const parsed = customerFiltersSchema.shape[key].safeParse(value);
    if (parsed.success && parsed.data !== undefined) (filters as Record<string, unknown>)[key] = parsed.data;
    else refused.push(entryLabel(key, value));
  }
  return { filters, refused };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export type SegmentFiltersInput =
  | { ok: true; params: SegmentParams }
  | { ok: false; error: string; refused: string[] };

/**
 * The filters a Segment is saved with, from the client's parameters (`{
 * bought: "premium", last_order: "over:12" }`). Anything the schema would
 * drop is refused, never saved; a set that chooses every Customer is refused
 * too, since *Save as Segment* only appears with a filter active.
 */
export function parseSegmentFilters(raw: unknown): SegmentFiltersInput {
  if (!isRecord(raw)) return { ok: false, error: "Choose at least one filter to save.", refused: [] };
  const { filters, refused } = readEntries(raw);
  if (refused.length) {
    return { ok: false, error: `Not a filter the Customers list knows: ${refused.join(", ")}.`, refused };
  }
  const params = segmentParams(filters);
  if (!Object.keys(params).length) return { ok: false, error: "Choose at least one filter to save.", refused: [] };
  return { ok: true, params };
}

export interface SegmentFilterRead {
  /** The filters the schema still recognises, as the list's URL parameters. */
  params: SegmentParams;
  /** Those filters, on the list's defaults (newest first). */
  filters: CustomerFilters;
  /** Stored filters the schema no longer recognises, as `key=value`. */
  ignored: string[];
  /**
   * Something was ignored, so the Segment would choose more Customers than it
   * was saved for: it counts and resolves none until it is updated.
   */
  needsReview: boolean;
}

/**
 * A Segment's stored filters, upgraded from the version they were saved at
 * and read back through the list's schema.
 */
export function readSegmentFilters(stored: unknown, version: number): SegmentFilterRead {
  const entries = isRecord(stored) ? stored : {};
  const upgraded = isRecord(stored) ? upgradeStoredFilters(stored, version) : null;
  if (!upgraded) {
    // Another shape: no key can be trusted to mean what it meant.
    const ignored = Object.entries(entries).map(([k, v]) => entryLabel(k, v));
    return {
      params: {},
      filters: { ...DEFAULT_CUSTOMER_FILTERS },
      ignored: ignored.length ? ignored : [isRecord(stored) ? `filters_version=${version}` : "filters"],
      needsReview: true,
    };
  }
  if (!Object.keys(upgraded).length && Object.keys(entries).length) {
    // The upgrade dropped every filter it held (a Segment of the voucher
    // alone): read as nothing, it would choose every Customer, so it waits
    // for Staff instead, naming what it was.
    return {
      params: {},
      filters: { ...DEFAULT_CUSTOMER_FILTERS },
      ignored: Object.entries(entries).map(([k, v]) => entryLabel(k, v)),
      needsReview: true,
    };
  }
  const { filters, refused } = readEntries(upgraded);
  const params = segmentParams(filters);
  return {
    params,
    filters: { ...DEFAULT_CUSTOMER_FILTERS, ...filters },
    ignored: refused,
    needsReview: refused.length > 0,
  };
}

/** A Segment as the Segments row shows it. */
export interface CustomerSegment {
  id: string;
  name: string;
  /** The recognised filters, as the list's URL parameters: what choosing it applies. */
  params: SegmentParams;
  ignored: string[];
  needsReview: boolean;
  /** Customers it chooses now; null when it needs review or could not be counted. */
  count: number | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

/** The chip's count: *1,204*, or *—* when it could not be counted. */
export function formatSegmentCount(count: number | null): string {
  return count == null ? "—" : count.toLocaleString("en-SG");
}
