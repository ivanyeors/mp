import { supabaseAdmin } from "@/lib/supabase/server";
import { applyCustomerFilters, type CustomerFilters, type CustomerListQuery } from "@/lib/crm/customer-filters";
import {
  SEGMENT_FILTERS_VERSION,
  readSegmentFilters,
  type CustomerSegment,
  type SegmentParams,
} from "@/lib/crm/segment-rules";

/**
 * Segments (CONTEXT.md; ADR 0028 (c)): named Customers-list filters in
 * `customer_segments`, shared by every Staff member with `customers` and
 * counted live. Only the service role can read the table, so every read and
 * write goes through here from an Admin Panel route that has already checked
 * the caller: `customers` to see and count them, `customers-edit` to save,
 * update, rename or archive one.
 *
 * Every count and every resolve reads the Customer overview through
 * `applyCustomerFilters`, the one mapping the list itself uses, after the
 * stored filters are parsed again by the list's schema
 * (lib/crm/segment-rules.ts). A Segment that needs review counts and resolves
 * no Customers.
 */

type Embedded<T> = T | T[] | null;
const one = <T>(v: Embedded<T> | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

type SegmentRow = {
  id: string;
  name: string;
  filters: unknown;
  filters_version: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  creator: Embedded<{ id: string; name: string }>;
};

/** A Segment as stored, archived ones included: what the routes audit. */
export interface StoredSegment {
  id: string;
  name: string;
  filters: unknown;
  filtersVersion: number;
  archivedAt: string | null;
}

const SEGMENT_COLUMNS =
  "id, name, filters, filters_version, created_at, updated_at, archived_at, " +
  "creator:mp_staff!created_by_profile_id(id, name)";

/** A live name is taken: the routes answer 409. */
export class SegmentNameTakenError extends Error {
  constructor(name: string) {
    super(`A Segment named “${name}” already exists.`);
    this.name = "SegmentNameTakenError";
  }
}

const isUniqueViolation = (error: { code?: string; message?: string }) =>
  error.code === "23505" || /duplicate key|unique/i.test(error.message ?? "");

type CountQuery = CustomerListQuery & PromiseLike<{ count: number | null; error: { message: string } | null }>;

/** How many Customers `filters` choose now; null when the count failed. */
export async function countCustomers(filters: CustomerFilters, now = new Date()): Promise<number | null> {
  // Seen through the methods the mapping uses (as listAdminCustomers does).
  const base = supabaseAdmin()
    .from("admin_customer_overview")
    .select("id", { count: "exact", head: true }) as unknown as CountQuery;
  const { count, error } = await applyCustomerFilters(base, filters, { now, order: false });
  return error ? null : (count ?? 0);
}

async function toSegment(row: SegmentRow, now: Date): Promise<CustomerSegment> {
  const read = readSegmentFilters(row.filters, row.filters_version);
  const creator = one(row.creator);
  return {
    id: row.id,
    name: row.name,
    params: read.params,
    ignored: read.ignored,
    needsReview: read.needsReview,
    // Never widened: a Segment with an ignored filter is not counted.
    count: read.needsReview ? null : await countCustomers(read.filters, now),
    createdBy: creator ? { id: creator.id, name: creator.name } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The live Segments by name, each with its live count. */
export async function listSegments({ now = new Date() }: { now?: Date } = {}): Promise<CustomerSegment[]> {
  const { data, error } = await supabaseAdmin()
    .from("customer_segments")
    .select(SEGMENT_COLUMNS)
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  const segments = await Promise.all(((data ?? []) as unknown as SegmentRow[]).map((r) => toSegment(r, now)));
  return segments.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

/** One Segment as stored, archived or not; null when there is none. */
export async function getSegment(id: string): Promise<StoredSegment | null> {
  const { data, error } = await supabaseAdmin()
    .from("customer_segments")
    .select("id, name, filters, filters_version, archived_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as { id: string; name: string; filters: unknown; filters_version: number; archived_at: string | null };
  return { id: row.id, name: row.name, filters: row.filters, filtersVersion: row.filters_version, archivedAt: row.archived_at };
}

/**
 * Throws `SegmentNameTakenError` when another live Segment has `name`, in any
 * case. The unique index (`customer_segments_live_name`) is the backstop for
 * two saves at once.
 */
async function assertNameFree(name: string, exceptId?: string): Promise<void> {
  const { data, error } = await supabaseAdmin().from("customer_segments").select("id, name").is("archived_at", null);
  if (error) throw new Error(error.message);
  const lower = name.toLowerCase();
  const taken = ((data ?? []) as { id: string; name: string }[]).some(
    (s) => s.id !== exceptId && s.name.toLowerCase() === lower,
  );
  if (taken) throw new SegmentNameTakenError(name);
}

/** Saves a Segment. `params` come from `parseSegmentFilters`; the caller has checked `customers-edit`. */
export async function createSegment(
  name: string,
  params: SegmentParams,
  createdByProfileId: string | null,
  { now = new Date() }: { now?: Date } = {},
): Promise<CustomerSegment> {
  await assertNameFree(name);
  const { data, error } = await supabaseAdmin()
    .from("customer_segments")
    .insert({
      name,
      filters: params,
      filters_version: SEGMENT_FILTERS_VERSION,
      created_by_profile_id: createdByProfileId,
    })
    .select(SEGMENT_COLUMNS)
    .single();
  if (error && isUniqueViolation(error)) throw new SegmentNameTakenError(name);
  if (error || !data) throw new Error(error?.message ?? "Could not save the Segment");
  return toSegment(data as unknown as SegmentRow, now);
}

/** Changes a live Segment's name or filters. Null when it is archived or gone. */
export async function updateSegment(
  id: string,
  change: { name: string } | { params: SegmentParams },
  { now = new Date() }: { now?: Date } = {},
): Promise<CustomerSegment | null> {
  if ("name" in change) await assertNameFree(change.name, id);
  const patch =
    "name" in change ? { name: change.name } : { filters: change.params, filters_version: SEGMENT_FILTERS_VERSION };
  const { data, error } = await supabaseAdmin()
    .from("customer_segments")
    .update(patch)
    .eq("id", id)
    .is("archived_at", null)
    .select(SEGMENT_COLUMNS);
  if (error && "name" in change && isUniqueViolation(error)) throw new SegmentNameTakenError(change.name);
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as unknown as SegmentRow | undefined;
  return row ? toSegment(row, now) : null;
}

/** Archives a live Segment, freeing its name. Returns when, or null when it was archived already or is gone. */
export async function archiveSegment(id: string): Promise<string | null> {
  const archivedAt = new Date().toISOString();
  const { data, error } = await supabaseAdmin()
    .from("customer_segments")
    .update({ archived_at: archivedAt })
    .eq("id", id)
    .is("archived_at", null)
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ? archivedAt : null;
}

/** Why `resolveSegment` refused: there is no such Segment, it is archived, or it needs review. */
export class SegmentUnavailableError extends Error {
  constructor(
    readonly reason: "not_found" | "archived" | "needs_review",
    /** For `needs_review`: the stored filters the schema no longer recognises. */
    readonly ignored: string[] = [],
  ) {
    super(
      reason === "needs_review"
        ? `This Segment needs review: ${ignored.join(", ")} is no longer a filter the Customers list knows.`
        : reason === "archived"
          ? "This Segment is archived."
          : "Segment not found",
    );
    this.name = "SegmentUnavailableError";
  }
}

export const RESOLVE_PAGE_SIZE = 500;

type IdQuery = CustomerListQuery & {
  limit(n: number): PromiseLike<{ data: { id: string }[] | null; error: { message: string } | null }>;
};

/**
 * The hand-off to `PRD-email-marketing` (PRD part 5): a Segment's Customers,
 * as pages of `customer_id`s, through `applyCustomerFilters`, the one mapping
 * the list uses. Email marketing narrows this by consent and suppression and
 * never re-implements the filters. Nothing in the CRM calls it except its
 * own test.
 *
 * - **Stable on a long run.** Pages are keyed by id (`id > last`, ordered by
 *   id), never by offset, so a Customer added or changed mid-run cannot shift
 *   a page: each id is yielded once. Every page counts *Last order* from the
 *   same `now`; *Stage* is read with the database's `now()` per page, which
 *   only matters for a run that crosses a stage's cut-off mid-way.
 * - **It stops on an empty page**, not a short one, so a project whose API
 *   returns fewer rows than `pageSize` (PostgREST's `max_rows`) still yields
 *   every Customer.
 * - **Never widened.** A Segment that needs review, an archived one, or none
 *   at all throws `SegmentUnavailableError` before any id is read, so a caller
 *   cannot mistake a refusal for an empty audience.
 */
export async function* resolveSegment(
  segmentId: string,
  { pageSize = RESOLVE_PAGE_SIZE, now = new Date() }: { pageSize?: number; now?: Date } = {},
): AsyncGenerator<string[], void, undefined> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new RangeError("pageSize must be a whole number above 0");
  const segment = await getSegment(segmentId);
  if (!segment) throw new SegmentUnavailableError("not_found");
  if (segment.archivedAt) throw new SegmentUnavailableError("archived");
  const read = readSegmentFilters(segment.filters, segment.filtersVersion);
  if (read.needsReview) throw new SegmentUnavailableError("needs_review", read.ignored);

  let after: string | null = null;
  for (;;) {
    let query = supabaseAdmin().from("admin_customer_overview").select("id") as unknown as IdQuery;
    query = applyCustomerFilters(query, read.filters, { now, order: false });
    if (after) query = query.gt("id", after);
    const { data, error } = await query.order("id", { ascending: true }).limit(pageSize);
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((r) => r.id);
    if (!ids.length) return;
    yield ids;
    after = ids[ids.length - 1]!;
  }
}
