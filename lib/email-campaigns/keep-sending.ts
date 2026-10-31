/**
 * Kept sending (PRD-campaign-audiences slice 10; ADR 0040 (6)), pure.
 *
 * A campaign whose first Wave a person sent may keep sending: once a day the
 * daily job sends one Wave of at most its cap to people who joined its
 * Audience and have not had it, through the same plan, claim and batch sender
 * as a Staff Wave. Its email and Audience stay as the first Wave fixed them.
 * Its Segments' filters are kept as a person approved them
 * (`keep_sending_segments`): when one changes, the daily job pauses the
 * campaign rather than send to an Audience nobody approved.
 *
 * The run itself is keep-sending-run.ts; the cron wiring keep-sending-server.ts.
 */

import type { CampaignWaveStats } from "@/lib/customer-migration/campaign-ledger";

/** The most one day's Wave sends when nobody chose: one batch. */
export const KEEP_SENDING_DEFAULT_CAP = 20;
/** The most a person may set: Resend's free plan sends 100 a day, tests included. */
export const KEEP_SENDING_MAX_CAP = 100;
/** Of the day's room, what the daily job leaves for tests and Staff Waves (PRD hazard: kept sending shares 100 a day). */
export const KEEP_SENDING_RESERVE = 30;
/** When the daily job runs, in Singapore: `/api/cron/results-sla` at 02:00 UTC (vercel.json). */
export const KEEP_SENDING_TIME = "10:00";

/** One Segment's filters as a person approved them. */
export interface ApprovedSegment {
  filters: unknown;
  filtersVersion: number;
}

export interface KeepSending {
  on: boolean;
  dailyCap: number;
  pausedAt: string | null;
  /** Why the daily job paused it; null when a person did, or it is not paused. */
  pausedReason: string | null;
  /** By Segment id: the one it sends to and those it leaves out. Empty with no Segment. */
  segments: Record<string, ApprovedSegment>;
}

export const KEEP_SENDING_OFF: KeepSending = {
  on: false,
  dailyCap: KEEP_SENDING_DEFAULT_CAP,
  pausedAt: null,
  pausedReason: null,
  segments: {},
};

export const KEEP_SENDING_COLUMNS =
  "keep_sending, keep_sending_daily_cap, keep_sending_paused_at, keep_sending_paused_reason, keep_sending_segments";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Pure — a cap a person typed: a whole number from 1 to the most, or null. */
export function parseDailyCap(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= KEEP_SENDING_MAX_CAP ? n : null;
}

/** Pure — the columns' state; absent columns (a row read before the migration) read as off. */
export function keepSendingFromRow(row: Record<string, unknown>): KeepSending {
  const segments: Record<string, ApprovedSegment> = {};
  if (isRecord(row.keep_sending_segments)) {
    for (const [id, v] of Object.entries(row.keep_sending_segments)) {
      if (isRecord(v) && typeof v.filters_version === "number") segments[id] = { filters: v.filters ?? null, filtersVersion: v.filters_version };
    }
  }
  return {
    on: row.keep_sending === true,
    dailyCap: parseDailyCap(row.keep_sending_daily_cap) ?? KEEP_SENDING_DEFAULT_CAP,
    pausedAt: typeof row.keep_sending_paused_at === "string" ? row.keep_sending_paused_at : null,
    pausedReason: typeof row.keep_sending_paused_reason === "string" ? row.keep_sending_paused_reason : null,
    segments,
  };
}

/** Pure — the jsonb a person's approval stores. */
export function approvedSegmentsRow(segments: Readonly<Record<string, ApprovedSegment>>): Record<string, unknown> | null {
  const entries = Object.entries(segments);
  if (!entries.length) return null;
  return Object.fromEntries(entries.map(([id, s]) => [id, { filters: s.filters, filters_version: s.filtersVersion }]));
}

/** The Segments a campaign reads: the one it sends to, then those it leaves out. */
export const campaignSegmentIds = (c: { segmentId: string | null; excludeSegmentIds: readonly string[] }): string[] => [
  ...new Set([...(c.segmentId ? [c.segmentId] : []), ...c.excludeSegmentIds]),
];

/** Pure — JSON with every object's keys sorted: the same filters always read the same. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (isRecord(v)) {
    return `{${Object.keys(v)
      .sort()
      .filter((k) => v[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/** One of a campaign's Segments as it is now; null when there is no such Segment. */
export interface LiveSegment {
  name: string;
  filters: unknown;
  filtersVersion: number;
  archivedAt: string | null;
}

/**
 * Pure — why the campaign's Segments are not the ones a person approved, in
 * words for the campaign page, or null when every one is as approved. Any
 * change counts, a left-out Segment's too: a narrower Segment there widens
 * the Audience.
 */
export function segmentChange(
  ids: readonly string[],
  approved: Readonly<Record<string, ApprovedSegment>>,
  live: ReadonlyMap<string, LiveSegment | null>,
): string | null {
  for (const id of ids) {
    const now = live.get(id) ?? null;
    if (!now) return "a Segment it reads no longer exists";
    if (now.archivedAt) return `its Segment “${now.name}” was archived`;
    const was = approved[id];
    if (!was || was.filtersVersion !== now.filtersVersion || stableJson(was.filters) !== stableJson(now.filters)) {
      return `its Segment “${now.name}” changed since keep sending was turned on`;
    }
  }
  return null;
}

/** Pure — the date in Singapore, `YYYY-MM-DD`. */
export function singaporeDate(at: Date): string {
  return new Date(at.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}

const KEPT_WAVE = /^daily-(\d{4}-\d{2}-\d{2})$/;

/** Pure — the label of the day's kept-sending Wave: `daily-2026-11-01`. */
export const keptWaveLabel = (at: Date): string => `daily-${singaporeDate(at)}`;

/** Pure — whether a Wave is one the daily job sent. */
export const isKeptWave = (wave: string): boolean => KEPT_WAVE.test(wave);

/** Pure — a Wave's name for a person: `Daily, 1 Nov` for one the daily job sent, else its label. */
export function waveName(wave: string): string {
  const m = KEPT_WAVE.exec(wave);
  if (!m) return wave;
  const d = new Date(`${m[1]}T00:00:00Z`);
  return `Daily, ${d.toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "UTC" })}`;
}

/**
 * Pure — why a campaign cannot be set to keep sending yet, or null: a person
 * must have sent it to someone first (ADR 0040 (6)).
 */
export function keepSendingBlocker(c: { lockedAt: string | null; archivedAt: string | null }, handed: number): string | null {
  if (c.archivedAt) return "This campaign is archived.";
  if (!c.lockedAt || handed < 1) return "Send a first wave before it can keep sending.";
  return null;
}

/**
 * Pure — how many today's Wave may still send: the cap less what today's Wave
 * has claimed already (a re-run of the job never goes past it), and never
 * into the reserve. Both floored at nought.
 */
export function keptWaveSize(p: { cap: number; claimedToday: number; remaining: number; reserve?: number }): {
  size: number;
  /** What held it to nought: the cap, or Resend's room less the reserve; null when it may send. */
  limit: "cap" | "room" | null;
} {
  const left = Math.max(0, p.cap - p.claimedToday);
  const room = Math.max(0, p.remaining - (p.reserve ?? KEEP_SENDING_RESERVE));
  if (left === 0) return { size: 0, limit: "cap" };
  if (room === 0) return { size: 0, limit: "room" };
  return { size: Math.min(left, room), limit: null };
}

/** Pure — today's kept-sending emails across campaigns, from the waves' stats. */
export function keptToday(stats: readonly Pick<CampaignWaveStats, "wave" | "handed">[], at: Date): number {
  const label = keptWaveLabel(at);
  return stats.filter((s) => s.wave === label).reduce((sum, s) => sum + s.handed, 0);
}

/** Pure — the campaign's state in a few words, for its page and the list. */
export function keepSendingStatus(k: KeepSending | null | undefined): { label: string; tone: "on" | "paused" } | null {
  if (!k?.on) return null;
  return k.pausedAt ? { label: "Paused", tone: "paused" } : { label: "Keeps sending", tone: "on" };
}

/** What the card says it does, in one line. */
export const keepSendingPromise = (cap: number) =>
  `Every day at ${KEEP_SENDING_TIME} it sends up to ${cap} people who have joined the Audience and not had it. ` +
  `The rest period and consent apply as in any wave, and ${KEEP_SENDING_RESERVE} of the day's sends are kept for tests and your own waves.`;
