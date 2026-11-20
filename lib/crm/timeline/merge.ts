import type { TimelineBatch, TimelineCursor, TimelineEntry } from "@/lib/crm/timeline/types";

export function canonicalAt(value: string): string | null {
  const fraction = /T\d{2}:\d{2}:\d{2}\.(\d+)/.exec(value)?.[1] ?? "";
  const ms = Date.parse(value.replace(/(T\d{2}:\d{2}:\d{2})\.\d+/, "$1"));
  if (Number.isNaN(ms)) return null;
  return `${new Date(ms).toISOString().slice(0, 19)}.${fraction.padEnd(6, "0").slice(0, 6)}Z`;
}

type SortKey = { at: string; kind: string; refId: string; id: string };

const keyOf = (e: TimelineEntry): SortKey => ({ at: e.at, kind: e.kind, refId: e.ref.id, id: e.id });

const text = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function compareKeys(a: SortKey, b: SortKey): number {
  return text(b.at, a.at) || text(a.kind, b.kind) || text(a.refId, b.refId) || text(a.id, b.id);
}

export function compareEntries(a: TimelineEntry, b: TimelineEntry): number {
  return compareKeys(keyOf(a), keyOf(b));
}

export function cursorOf(entry: TimelineEntry): TimelineCursor {
  return keyOf(entry);
}

function floorCursor(at: string): TimelineCursor {
  return { at, kind: "", refId: "", id: "" };
}

function justBefore(at: string): string {
  const micros = Date.parse(`${at.slice(0, 19)}Z`) * 1000 + Number(at.slice(20, 26)) - 1;
  const seconds = Math.floor(micros / 1_000_000);
  const rest = String(micros - seconds * 1_000_000).padStart(6, "0");
  return `${new Date(seconds * 1000).toISOString().slice(0, 19)}.${rest}Z`;
}

export type TimelinePage<E extends TimelineEntry = TimelineEntry> = {
  entries: E[];
  next: TimelineCursor | null;
};

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

export const EMPTY_BATCH: TimelineBatch = { entries: [], floor: null };
