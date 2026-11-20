import type { CampaignWaveStats } from "@/lib/customer-migration/campaign-ledger";

export const KEEP_SENDING_DEFAULT_CAP = 20;
export const KEEP_SENDING_MAX_CAP = 100;
export const KEEP_SENDING_RESERVE = 30;
export const KEEP_SENDING_TIME = "10:00";

export interface ApprovedSegment {
  filters: unknown;
  filtersVersion: number;
}

export interface KeepSending {
  on: boolean;
  dailyCap: number;
  pausedAt: string | null;
  pausedReason: string | null;
  segments: Record<string, ApprovedSegment>;
  holdoutAt: string | null;
}

export const KEEP_SENDING_OFF: KeepSending = {
  on: false,
  dailyCap: KEEP_SENDING_DEFAULT_CAP,
  pausedAt: null,
  pausedReason: null,
  segments: {},
  holdoutAt: null,
};

export const KEEP_SENDING_COLUMNS =
  "keep_sending, keep_sending_daily_cap, keep_sending_paused_at, keep_sending_paused_reason, keep_sending_segments, holdout_at";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseDailyCap(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= KEEP_SENDING_MAX_CAP ? n : null;
}

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
    holdoutAt: row.keep_sending === true && typeof row.holdout_at === "string" ? row.holdout_at : null,
  };
}

export function approvedSegmentsRow(segments: Readonly<Record<string, ApprovedSegment>>): Record<string, unknown> | null {
  const entries = Object.entries(segments);
  if (!entries.length) return null;
  return Object.fromEntries(entries.map(([id, s]) => [id, { filters: s.filters, filters_version: s.filtersVersion }]));
}

export const campaignSegmentIds = (c: { segmentId: string | null; excludeSegmentIds: readonly string[] }): string[] => [
  ...new Set([...(c.segmentId ? [c.segmentId] : []), ...c.excludeSegmentIds]),
];

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

export interface LiveSegment {
  name: string;
  filters: unknown;
  filtersVersion: number;
  archivedAt: string | null;
}

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

export function singaporeDate(at: Date): string {
  return new Date(at.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}

const KEPT_WAVE = /^daily-(\d{4}-\d{2}-\d{2})$/;

export const keptWaveLabel = (at: Date): string => `daily-${singaporeDate(at)}`;

export const isKeptWave = (wave: string): boolean => KEPT_WAVE.test(wave);

export function waveName(wave: string): string {
  const m = KEPT_WAVE.exec(wave);
  if (!m) return wave;
  const d = new Date(`${m[1]}T00:00:00Z`);
  return `Daily, ${d.toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "UTC" })}`;
}

export function keepSendingBlocker(c: { lockedAt: string | null; archivedAt: string | null }, handed: number): string | null {
  if (c.archivedAt) return "This campaign is archived.";
  if (!c.lockedAt || handed < 1) return "Send a first wave before it can keep sending.";
  return null;
}

export function keptWaveSize(p: { cap: number; claimedToday: number; remaining: number; reserve?: number }): {
  size: number;
  limit: "cap" | "room" | null;
} {
  const left = Math.max(0, p.cap - p.claimedToday);
  const room = Math.max(0, p.remaining - (p.reserve ?? KEEP_SENDING_RESERVE));
  if (left === 0) return { size: 0, limit: "cap" };
  if (room === 0) return { size: 0, limit: "room" };
  return { size: Math.min(left, room), limit: null };
}

export function keptToday(stats: readonly Pick<CampaignWaveStats, "wave" | "handed">[], at: Date): number {
  const label = keptWaveLabel(at);
  return stats.filter((s) => s.wave === label).reduce((sum, s) => sum + s.handed, 0);
}

export function keepSendingStatus(k: KeepSending | null | undefined): { label: string; tone: "on" | "paused" } | null {
  if (!k?.on) return null;
  return k.pausedAt ? { label: "Paused", tone: "paused" } : { label: "Keeps sending", tone: "on" };
}

export const keepSendingPromise = (cap: number) =>
  `Every day at ${KEEP_SENDING_TIME} it sends up to ${cap} people who have joined the Audience and not had it. ` +
  `The rest period and consent apply as in any wave, and ${KEEP_SENDING_RESERVE} of the day's sends are kept for tests and your own waves.`;
