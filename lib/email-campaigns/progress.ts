import { formatAdminWeekdayTime } from "@/lib/format/admin-date";
import { KEEP_SENDING_TIME, keptWaveSize, type KeepSending } from "./keep-sending";
import type { StillToSend } from "./rules";

const DAY_MS = 24 * 3600_000;
const SINGAPORE_UTC_OFFSET_HOURS = 8;

export function keptRunAtOrAfter(ms: number): Date {
  const [hour, minute] = KEEP_SENDING_TIME.split(":").map(Number);
  const d = new Date(ms);
  let run = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour - SINGAPORE_UTC_OFFSET_HOURS, minute);
  while (run - DAY_MS >= ms) run -= DAY_MS;
  while (run < ms) run += DAY_MS;
  return new Date(run);
}

export function keptRunCron(): string {
  const [hour, minute] = KEEP_SENDING_TIME.split(":").map(Number);
  return `${minute} ${(hour - SINGAPORE_UTC_OFFSET_HOURS + 24) % 24} * * *`;
}

export type NextBatch =
  | { kind: "batch"; at: string; upTo: number }
  | { kind: "paused" }
  | { kind: "manual" }
  | { kind: "done"; keepsSending: boolean };

export interface CampaignProgress {
  sent: number;
  total: number;
  left: number;
  percent: number;
  next: NextBatch;
}

export function campaignProgress(p: {
  sent: number;
  left: StillToSend;
  keepSending: KeepSending | null | undefined;
  rampUntil: string | null;
  dailyLimit: number | null;
  now: Date;
}): CampaignProgress {
  const left = p.left.readyNow + p.left.resting;
  const total = p.sent + left;
  const percent = total === 0 ? 0 : Math.floor((p.sent / total) * 100);
  const k = p.keepSending;
  const keepsSending = Boolean(k?.on && !k.pausedAt);
  const base = { sent: p.sent, total, left, percent };
  if (k?.on && k.pausedAt) return { ...base, next: { kind: "paused" } };
  if (left === 0) return { ...base, next: { kind: "done", keepsSending } };
  if (!k?.on) return { ...base, next: { kind: "manual" } };
  const notBefore = Math.max(
    p.now.getTime() + 1,
    p.rampUntil ? Date.parse(p.rampUntil) : 0,
    p.left.readyNow === 0 && p.left.restingUntil ? Date.parse(p.left.restingUntil) : 0,
  );
  const { size } = keptWaveSize({ cap: k.dailyCap, claimedToday: 0, remaining: p.dailyLimit ?? Number.POSITIVE_INFINITY });
  return { ...base, next: { kind: "batch", at: keptRunAtOrAfter(notBefore).toISOString(), upTo: Math.min(size, left) } };
}

const n = (v: number) => v.toLocaleString("en-SG");

export function nextBatchLine({ next, left, total }: Pick<CampaignProgress, "next" | "left" | "total">): string {
  if (total === 0) return "Nobody in its audience can get it now";
  switch (next.kind) {
    case "batch":
      return next.upTo > 0
        ? `Next batch ${formatAdminWeekdayTime(next.at)}, up\u00a0to\u00a0${n(next.upTo)}`
        : "No room for a batch: Resend's daily limit is used up by the share kept for tests and your own waves";
    case "paused":
      return "Paused: no batch until you turn keep sending back on";
    case "manual":
      return `${n(left)} left for your next wave`;
    case "done":
      return next.keepsSending ? `Everyone has it; newcomers get it at ${KEEP_SENDING_TIME} each day` : "Everyone who can get it has it";
  }
}
