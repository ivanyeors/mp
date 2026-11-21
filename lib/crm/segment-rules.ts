import { z } from "zod";
import {
  CUSTOMER_FILTER_KEYS,
  DEFAULT_CUSTOMER_FILTERS,
  customerFilterParams,
  customerFiltersSchema,
  type CustomerFilterKey,
  type CustomerFilters,
} from "@/lib/crm/customer-filters";

export const SEGMENT_NAME_MAX = 80;

export const SEGMENT_FILTERS_VERSION = 2;

type StoredFilters = Record<string, unknown>;

const SEGMENT_UPGRADES: Partial<Record<number, (stored: StoredFilters) => StoredFilters>> = {
  1: (stored) => Object.fromEntries(Object.entries(stored).filter(([key]) => key !== "voucher")),
};

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

export type SegmentParams = Partial<Record<CustomerFilterKey, string>>;

export const SegmentNameSchema = z
  .string()
  .trim()
  .min(1, "Give the Segment a name.")
  .max(SEGMENT_NAME_MAX, `A Segment name is at most ${SEGMENT_NAME_MAX} characters.`);

const isFilterKey = (key: string): key is CustomerFilterKey =>
  (CUSTOMER_FILTER_KEYS as readonly string[]).includes(key);

export function segmentParams(filters: Partial<CustomerFilters>): SegmentParams {
  const all = customerFilterParams(filters);
  const out: SegmentParams = {};
  for (const key of CUSTOMER_FILTER_KEYS) {
    const value = all.get(key);
    if (value != null) out[key] = value;
  }
  return out;
}

export function chosenSegmentFilters(params: SegmentParams): Pick<CustomerFilters, CustomerFilterKey> {
  const { filters } = readEntries(params);
  const out = { ...DEFAULT_CUSTOMER_FILTERS, ...filters };
  return Object.fromEntries(CUSTOMER_FILTER_KEYS.map((k) => [k, out[k]])) as Pick<CustomerFilters, CustomerFilterKey>;
}

export function segmentCampaignHref(
  newCampaignPath: string | undefined,
  segment: Pick<CustomerSegment, "id" | "needsReview">,
): string | null {
  if (!newCampaignPath || segment.needsReview) return null;
  return `${newCampaignPath}?segment=${encodeURIComponent(segment.id)}`;
}

export function segmentHref(listPath: string, params: SegmentParams): string {
  const key = segmentKey(params);
  return key ? `${listPath}?${key}` : listPath;
}

export function segmentKey(params: SegmentParams): string {
  const out = new URLSearchParams();
  for (const key of CUSTOMER_FILTER_KEYS) {
    const value = params[key];
    if (value != null) out.set(key, value);
  }
  return out.toString();
}

export function sameSegmentFilters(a: SegmentParams, b: SegmentParams): boolean {
  return segmentKey(a) === segmentKey(b);
}

const entryLabel = (key: string, value: unknown) =>
  `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`;

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
  params: SegmentParams;
  filters: CustomerFilters;
  ignored: string[];
  needsReview: boolean;
}

export function readSegmentFilters(stored: unknown, version: number): SegmentFilterRead {
  const entries = isRecord(stored) ? stored : {};
  const upgraded = isRecord(stored) ? upgradeStoredFilters(stored, version) : null;
  if (!upgraded) {
    const ignored = Object.entries(entries).map(([k, v]) => entryLabel(k, v));
    return {
      params: {},
      filters: { ...DEFAULT_CUSTOMER_FILTERS },
      ignored: ignored.length ? ignored : [isRecord(stored) ? `filters_version=${version}` : "filters"],
      needsReview: true,
    };
  }
  if (!Object.keys(upgraded).length && Object.keys(entries).length) {
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

export interface CustomerSegment {
  id: string;
  name: string;
  params: SegmentParams;
  ignored: string[];
  needsReview: boolean;
  count: number | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export function formatSegmentCount(count: number | null): string {
  return count == null ? "—" : count.toLocaleString("en-SG");
}
