import type { TimelineBatch, TimelineCursor, TimelineEntry } from "@/lib/crm/timeline/types";

/**
 * The pure half of the Customer timeline (ADR 0028 (b)): the adapters read,
 * this orders. No I/O.
 *
 * Order: newest first, then `kind`, then `ref.id`, then the entry's own `id`,
 * so two entries at the same instant always come out the same way and a page
 * boundary between them is stable.
 */

/**
 * A timestamp as one comparable string: UTC, microseconds, `Z`
 * (`2026-10-01T02:00:00.123456Z`). PostgREST trims trailing zeros and may send
 * an offset, so raw strings from two tables do not sort as text. Null when the
 * value is not a time: an entry without one is not shown.
 */
export function canonicalAt(value: string): string | null {
  const fraction = /T\d{2}:\d{2}:\d{2}\.(\d+)/.exec(value)?.[1] ?? "";
  // Parse without the fraction, so no engine rounds 59.9999 into the next second.
  const ms = Date.parse(value.replace(/(T\d{2}:\d{2}:\d{2})\.\d+/, "$1"));
  if (Number.isNaN(ms)) return null;
  return `${new Date(ms).toISOString().slice(0, 19)}.${fraction.padEnd(6, "0").slice(0, 6)}Z`;
}

type SortKey = { at: string; kind: string; refId: string; id: string };

const keyOf = (e: TimelineEntry): SortKey => ({ at: e.at, kind: e.kind, refId: e.ref.id, id: e.id });

const text = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Negative when `a` is shown before `b`. Both `at` values must be canonical. */
function compareKeys(a: SortKey, b: SortKey): number {
  return text(b.at, a.at) || text(a.kind, b.kind) || text(a.refId, b.refId) || text(a.id, b.id);
}

/** Display order, for entries whose `at` is canonical. */
export function compareEntries(a: TimelineEntry, b: TimelineEntry): number {
  return compareKeys(keyOf(a), keyOf(b));
}

export function cursorOf(entry: TimelineEntry): TimelineCursor {
  return keyOf(entry);
}

/** The cursor that means "everything at or below `at`": it sorts before every entry at that time. */
function floorCursor(at: string): TimelineCursor {
  return { at, kind: "", refId: "", id: "" };
}

/** One microsecond earlier: a timestamptz's resolution, so "strictly older than `at`". */
function justBefore(at: string): string {
  const micros = Date.parse(`${at.slice(0, 19)}Z`) * 1000 + Number(at.slice(20, 26)) - 1;
  const seconds = Math.floor(micros / 1_000_000);
  const rest = String(micros - seconds * 1_000_000).padStart(6, "0");
  return `${new Date(seconds * 1000).toISOString().slice(0, 19)}.${rest}Z`;
}

export type TimelinePage<E extends TimelineEntry = TimelineEntry> = {
  entries: E[];
  /** Where the next page starts, or null when nothing older remains. */
  next: TimelineCursor | null;
};

/**
 * Merges the adapters' batches into one page of at most `limit` entries, after
 * `after` (the previous page's cursor; null for the first page).
 *
 * - Entries at or before the cursor were shown already and are dropped; so is a
 *   second copy of an entry `id`.
 * - Nothing at or below the highest `floor` is shown: below it, some source may
 *   hold entries it did not return. They come on the next page, which asks
 *   again from the last entry shown.
 * - When the floor leaves nothing to show, the next page starts at the floor.
 * - Only when a source returned a whole page at the cursor's own instant does
 *   that not move forward. Then the page shows what is left at that instant and
 *   the next one starts just below it, so paging always ends and never repeats
 *   an entry. (A source with more than `limit` entries at one microsecond may
 *   lose the ones it never returned.)
 */
export function mergeTimeline<E extends TimelineEntry>(
  batches: readonly { entries: readonly E[]; floor: string | null }[],
  limit: number,
  after: TimelineCursor | null = null,
): TimelinePage<E> {
  let floor: string | null = null;
  for (const b of batches) {
    const f = b.floor === null ? null : canonicalAt(b.floor);
    if (f !== null && (floor === null || f > floor)) floor = f;
  }

  const seen = new Set<string>();
  const fresh: E[] = [];
  for (const b of batches) {
    for (const raw of b.entries) {
      const at = canonicalAt(raw.at);
      if (at === null) continue;
      const entry = { ...raw, at };
      if (after && compareKeys(keyOf(entry), after) <= 0) continue;
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      fresh.push(entry);
    }
  }
  fresh.sort(compareEntries);

  const shown = floor === null ? fresh : fresh.filter((e) => e.at > floor);
  if (floor !== null && shown.length === 0) {
    if (after && floor >= after.at) {
      const left = fresh.filter((e) => e.at === after.at).slice(0, limit);
      return {
        entries: left,
        next: left.length ? cursorOf(left[left.length - 1]!) : floorCursor(justBefore(after.at)),
      };
    }
    return { entries: [], next: floorCursor(floor) };
  }

  const entries = shown.slice(0, limit);
  const more = shown.length > limit || floor !== null;
  return { entries, next: more ? cursorOf(entries[entries.length - 1]!) : null };
}

/** An empty batch: what a source with nothing to show returns. */
export const EMPTY_BATCH: TimelineBatch = { entries: [], floor: null };
