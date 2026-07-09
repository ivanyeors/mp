import type { AppointmentSettings } from "./settings";

/** Busy interval in UTC ms. */
export type BusyInterval = { startMs: number; endMs: number };

export type SlotOffer = {
  /** ISO start (UTC). */
  startIso: string;
  /** ISO end (UTC). */
  endIso: string;
  /** Stable id for WhatsApp list reply (slot_<startIso>). */
  id: string;
};

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Wall-clock parts in Asia/Singapore (no DST). */
export function sgtParts(ms: number): {
  y: number;
  m: number; // 1–12
  d: number;
  hour: number;
  minute: number;
  dow: number; // 0=Sun
} {
  const sgt = new Date(ms + SGT_OFFSET_MS);
  return {
    y: sgt.getUTCFullYear(),
    m: sgt.getUTCMonth() + 1,
    d: sgt.getUTCDate(),
    hour: sgt.getUTCHours(),
    minute: sgt.getUTCMinutes(),
    dow: sgt.getUTCDay(),
  };
}

/** Build UTC ms for a Singapore local wall time. */
export function sgtLocalToUtcMs(
  y: number,
  m: number,
  d: number,
  hour: number,
  minute = 0,
): number {
  return Date.UTC(y, m - 1, d, hour, minute, 0) - SGT_OFFSET_MS;
}

function overlaps(
  startMs: number,
  endMs: number,
  busy: BusyInterval[],
): boolean {
  for (const b of busy) {
    if (startMs < b.endMs && endMs > b.startMs) return true;
  }
  return false;
}

export function addSgtDays(y: number, m: number, d: number, days: number): {
  y: number;
  m: number;
  d: number;
} {
  const utc = Date.UTC(y, m - 1, d + days);
  const dt = new Date(utc);
  return {
    y: dt.getUTCFullYear(),
    m: dt.getUTCMonth() + 1,
    d: dt.getUTCDate(),
  };
}

/** ponytail: O(n) scan per slot; fine for small admin block lists. */
export function blockedRangesToBusy(
  ranges: { start: string; end: string }[],
): BusyInterval[] {
  return ranges
    .map((r) => ({ startMs: Date.parse(r.start), endMs: Date.parse(r.end) }))
    .filter((r) => Number.isFinite(r.startMs) && Number.isFinite(r.endMs) && r.startMs < r.endMs);
}

/**
 * Carve up to `settings.slotOfferCount` free starts from freeBusy busy intervals.
 * Rules: bookable days, openHour–closeHour last start, durationMinutes, lookahead.
 * Starts searching from the next full hour after `now` (SGT).
 */
export function offerSlots(
  busy: BusyInterval[],
  settings: AppointmentSettings,
  now: Date = new Date(),
): SlotOffer[] {
  const durationMs = settings.durationMinutes * 60 * 1000;
  const nowMs = now.getTime();
  const parts = sgtParts(nowMs);
  const cursor = { y: parts.y, m: parts.m, d: parts.d };
  const allBusy = [...busy, ...blockedRangesToBusy(settings.blockedRanges)];

  // Start from today; skip past hours on the first day.
  const out: SlotOffer[] = [];
  const bookable = new Set(settings.bookableDays);

  for (let day = 0; day <= settings.slotLookaheadDays && out.length < settings.slotOfferCount; day++) {
    const { y, m, d } = day === 0 ? cursor : addSgtDays(cursor.y, cursor.m, cursor.d, day);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (!bookable.has(dow)) continue;

    for (let hour = settings.openHour; hour <= settings.closeHour; hour++) {
      const startMs = sgtLocalToUtcMs(y, m, d, hour, 0);
      const endMs = startMs + durationMs;
      if (startMs <= nowMs) continue;
      if (overlaps(startMs, endMs, allBusy)) continue;

      const startIso = new Date(startMs).toISOString();
      out.push({
        startIso,
        endIso: new Date(endMs).toISOString(),
        id: `slot_${startIso}`,
      });
      if (out.length >= settings.slotOfferCount) return out;
    }
  }

  return out;
}

/** Human label for a slot in SGT, e.g. "Tue 14 Jul, 10:00". */
export function formatSlotLabelSgt(startIso: string): string {
  const ms = Date.parse(startIso);
  if (!Number.isFinite(ms)) return startIso;
  const p = sgtParts(ms);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][p.dow]!;
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const hh = String(p.hour).padStart(2, "0");
  const mm = String(p.minute).padStart(2, "0");
  return `${weekday} ${p.d} ${months[p.m - 1]}, ${hh}:${mm}`;
}
