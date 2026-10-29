/**
 * The Email campaigns page's send flow, in words (PRD-campaign-send-flow).
 * Pure, and safe in the browser: the page's components render what these
 * return, and the tests read them without a page.
 *
 *  - the send limit as meters and a "room again" time;
 *  - the Sending card's rows (slice 02);
 *  - the checklist before a wave, how many go now versus later, and what to
 *    do after one (slice 03);
 *  - each wave's numbers against the pause lines, and the ramp's 48 hours
 *    (slice 04).
 */
import {
  PAUSE_BOUNCE_RATE,
  PAUSE_COMPLAINT_RATE,
  type CampaignWaveStats,
  type SendAllowance,
} from "@/lib/customer-migration/campaign-ledger";
import type { PreflightCheck } from "@/lib/customer-migration/wave-sender";
import { formatAdminWeekdayTime } from "@/lib/format/admin-date";

const n = (v: number) => v.toLocaleString("en-SG");
const plural = (count: number, one: string, many = `${one}s`) => `${n(count)} ${count === 1 ? one : many}`;

/** Plain-language names for every check the sender runs. */
export const CHECK_LABEL: Record<string, string> = {
  transport: "Campaign email account (Resend)",
  from: "Sending address",
  reply_to: "Where replies go",
  site: "Links point at the live site",
  unsubscribe_route: "One-click unsubscribe works",
  unsubscribe_secret: "Unsubscribe links are signed correctly",
  pause: "Bounces and spam reports are low",
  points: "Points are live",
  products: "Every product is still in the shop",
  send_limit: "Room in the sending plan",
  reports: "Bounce and spam reports",
};

// ─── The send limit ──────────────────────────────────────────────────────────

/** When sending opens again, in words: `room again from Tue, 27 Oct, 3:40 pm`. */
export function roomAgainText(allowance: Pick<SendAllowance, "roomAt" | "binding">): string {
  if (allowance.roomAt) return `room again from ${formatAdminWeekdayTime(allowance.roomAt)}`;
  return allowance.binding === "daily" ? "room again tomorrow" : "room again once the oldest send is 31 days old";
}

export interface AllowanceMeter {
  label: "Today" | "This month";
  used: number;
  limit: number;
  left: number;
  /** 0 to 100, for the bar. */
  percent: number;
  /** `38 of 100 sent · 62 left`. */
  text: string;
}

/** The two meters: the last 24 hours and the last 31 days, as Resend counts them. */
export function allowanceMeters(a: Pick<SendAllowance, "limits" | "used">): AllowanceMeter[] {
  const meter = (label: AllowanceMeter["label"], used: number, limit: number): AllowanceMeter => {
    const left = Math.max(0, limit - used);
    return {
      label,
      used,
      limit,
      left,
      percent: limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100,
      text: `${n(used)} of ${n(limit)} sent · ${n(left)} left`,
    };
  };
  return [meter("Today", a.used.daily, a.limits.daily), meter("This month", a.used.monthly, a.limits.monthly)];
}

/** One line on what the plan leaves now. */
export function allowanceSummary(a: SendAllowance): string {
  if (a.remaining === 0) {
    const what = a.binding === "daily" ? `Today's ${n(a.limits.daily)}` : `This month's ${n(a.limits.monthly)}`;
    return `${what} are used: ${roomAgainText(a)}.`;
  }
  return `${plural(a.remaining, "email")} can go now${a.binding === "monthly" ? " (this month's limit is the closer one)" : ""}.`;
}

/**
 * The wave size the page starts on: what today's room allows, and at most 50
 * for a campaign's first wave (migration slice 09's pilot).
 */
export function defaultWaveSize(allowance: Pick<SendAllowance, "remaining"> | null, firstWave: boolean, max: number): number {
  const cap = firstWave ? 50 : max;
  if (!allowance) return Math.min(cap, firstWave ? 50 : 100);
  return Math.max(1, Math.min(cap, allowance.remaining || 1));
}

// ─── The Sending card ────────────────────────────────────────────────────────

export interface SendingRow {
  key: string;
  ok: boolean;
  title: string;
  detail: string;
  /** What to set, when it fails. */
  fix: string | null;
}

/** The Sending card's rows: what is set up, in words, and what to set when it is not. Never a key. */
export function sendingRows(
  checks: readonly PreflightCheck[],
  sender: { from: string | null; replyTo: string | null },
  origin?: string,
): SendingRow[] {
  const vercel = "in Vercel → Settings → Environment Variables (Production), then redeploy";
  const rows: Record<string, (c: PreflightCheck) => SendingRow> = {
    transport: (c) => ({
      key: c.key,
      ok: c.ok,
      title: c.ok ? "Resend connected" : "Resend not connected",
      detail: c.ok ? "The key is kept in Vercel and is never shown here." : c.detail,
      fix: c.ok
        ? null
        : `Add CAMPAIGN_RESEND_API_KEY, marked Sensitive, ${vercel}. Never name it RESEND_API_KEY: that moves order email to Resend.`,
    }),
    from: (c) => ({
      key: c.key,
      ok: c.ok,
      title: c.ok && sender.from ? `Sending from ${sender.from}` : "No sending address",
      detail: c.ok ? "The campaign's own subdomain, never the mailbox that sends orders." : c.detail,
      fix: c.ok ? null : `Set CAMPAIGN_EMAIL_FROM (for example Mpillow <hello@hello.mpillow.com>) and CAMPAIGN_EMAIL_DOMAIN ${vercel}.`,
    }),
    reply_to: (c) => ({
      key: c.key,
      ok: c.ok,
      title: c.ok && sender.replyTo ? `Replies go to ${sender.replyTo}` : "No inbox for replies",
      detail: c.ok ? "A customer who replies reaches the support inbox." : c.detail,
      fix: c.ok ? null : `Set SUPPORT_EMAIL ${vercel}.`,
    }),
    site: (c) => ({
      key: c.key,
      ok: c.ok,
      title: c.ok ? "Links point at the live site" : "Links do not point at a live site",
      detail: c.detail,
      fix: c.ok ? null : `Set NEXT_PUBLIC_SITE_URL to the live https address ${vercel}.`,
    }),
    reports: (c) => ({
      key: c.key,
      ok: c.ok,
      title: c.ok ? "Bounce and spam reports on" : "Bounce and spam reports off",
      detail: c.detail,
      fix: c.ok
        ? null
        : `In Resend → Webhooks, add ${origin ? `${origin.replace(/\/$/, "")}/api/email/resend-webhook` : "this site's /api/email/resend-webhook"} for email.bounced and email.complained, then put its signing secret in CAMPAIGN_RESEND_WEBHOOK_SECRET ${vercel}.`,
    }),
  };
  return checks.map(
    (c) => rows[c.key]?.(c) ?? { key: c.key, ok: c.ok, title: CHECK_LABEL[c.key] ?? c.key, detail: c.detail, fix: null },
  );
}

// ─── Before a wave ───────────────────────────────────────────────────────────

export interface SendStep {
  key: "saved" | "test" | "checks" | "room";
  label: string;
  done: boolean;
  /** Advice only: a step that is not done does not stop the wave. */
  advisory: boolean;
  detail: string;
}

/**
 * The checklist above a wave. The test is advice; the rest must be done, and
 * the server holds them again when the wave starts.
 */
export function sendSteps(p: {
  dirty: boolean;
  locked: boolean;
  lastTest: { sent: number; at: string } | null;
  checks: readonly PreflightCheck[] | null;
  allowance: SendAllowance | null;
  resume: boolean;
}): SendStep[] {
  const blocking = (p.checks ?? []).filter((c) => c.key !== "send_limit" && !c.ok && !(c.key === "pause" && p.resume));
  return [
    {
      key: "saved",
      label: "Saved",
      done: !p.dirty,
      advisory: false,
      detail: p.dirty ? "Save your changes before sending." : p.locked ? "Sending has started, so the email is fixed." : "The email is saved.",
    },
    {
      key: "test",
      label: "Test sent",
      done: Boolean(p.lastTest),
      advisory: true,
      detail: p.lastTest
        ? `Sent to ${plural(p.lastTest.sent, "address", "addresses")} at ${formatAdminWeekdayTime(p.lastTest.at)}. Check the inbox and the spam folder.`
        : "Recommended: send yourself a test and read it on your phone first.",
    },
    {
      key: "checks",
      label: "Every check passes",
      done: p.checks !== null && blocking.length === 0,
      advisory: false,
      detail:
        p.checks === null
          ? "Checking…"
          : blocking.length === 0
            ? "Resend, the sending address, replies, unsubscribe and the pause rule are all fine."
            : `${blocking.map((c) => CHECK_LABEL[c.key] ?? c.key).join(", ")}: see Ready to send? above.`,
    },
    {
      key: "room",
      label: p.allowance && p.allowance.remaining > 0 ? `${plural(p.allowance.remaining, "email")} can go today` : "Room to send today",
      done: Boolean(p.allowance && p.allowance.remaining > 0),
      advisory: false,
      detail: !p.allowance
        ? "The send limit could not be counted."
        : p.allowance.remaining > 0
          ? `${n(p.allowance.used.daily)} of ${n(p.allowance.limits.daily)} sent in the last 24 hours, tests included.`
          : allowanceSummary(p.allowance),
    },
  ];
}

/**
 * Pure — how many go now and how many wait: "62 go in this wave; the other
 * 250 wait for later waves (about 3 more days at 100 a day)".
 */
export function waitingSummary(p: {
  selected: number;
  waiting: number;
  limitedBy: "daily" | "monthly" | null;
  dailyLimit: number | null;
}): string {
  const now = `${plural(p.selected, "person", "people")} ${p.selected === 1 ? "goes" : "go"} in this wave`;
  if (p.waiting === 0) return `${now}: that is everyone who can get it.`;
  const later = `the other ${n(p.waiting)} wait for later waves`;
  if (p.limitedBy === "daily" && p.dailyLimit) {
    const days = Math.ceil(p.waiting / p.dailyLimit);
    return `${now}, all today's room allows; ${later} (about ${plural(days, "more day")} at ${n(p.dailyLimit)} a day).`;
  }
  if (p.limitedBy === "monthly") return `${now}, all this month's room allows; ${later}.`;
  return `${now}; ${later}.`;
}

// ─── After a wave ────────────────────────────────────────────────────────────

/**
 * Pure — what to do once a wave has finished or stopped, from the fresh
 * allowance: retry what failed, wait for room, wait out the ramp, or send
 * the next wave.
 */
export function nextStepAfterWave(p: {
  sent: number;
  failed: number;
  stoppedByStaff: boolean;
  /** Eligible people not in this wave, plus any of it left unsent. */
  waiting: number;
  allowance: SendAllowance | null;
  rampUntil: string | null;
}): string {
  if (p.stoppedByStaff) return "You stopped the wave. Whoever it had not reached yet goes in the next one.";
  const retry = p.failed > 0 ? ` The ${plural(p.failed, "failed send")} can go again: tick "Retry the failed sends only".` : "";
  if (p.waiting === 0 && p.failed === 0) return "Everyone who can get this campaign has it now.";
  if (p.allowance && p.allowance.remaining === 0) {
    const when = p.allowance.roomAt
      ? `after ${formatAdminWeekdayTime(p.allowance.roomAt)}`
      : p.allowance.binding === "daily"
        ? "tomorrow"
        : "once the oldest send is 31 days old";
    return `The plan's room is used up for now: come back ${when} to send the next wave.${retry}`;
  }
  if (p.rampUntil) {
    return `Wait until ${formatAdminWeekdayTime(p.rampUntil)} before the next wave, and look at its bounces and spam reports first.${retry}`;
  }
  const room = p.allowance ? ` ${allowanceSummary(p.allowance)}` : "";
  return `${n(p.waiting)} more can get it.${room}${retry}`;
}

// ─── Each wave ───────────────────────────────────────────────────────────────

export type WaveState = "ok" | "over_bounce" | "over_spam" | "not_sent";

export interface WaveRow {
  wave: string;
  lastSentAt: string | null;
  sent: number;
  bounced: number;
  bouncedPercent: string;
  spam: number;
  spamPercent: string;
  failed: number;
  pending: number;
  state: WaveState;
  /** The state in words. */
  stateText: string;
}

const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—");

/** The pause lines, in words, for the Waves table's tip. */
export const PAUSE_LINES_TEXT = `A wave pauses sending when more than ${PAUSE_BOUNCE_RATE * 100}% of it bounces, or more than ${PAUSE_COMPLAINT_RATE * 100}% marks it as spam.`;

/** Pure — one row per wave, oldest first, judged as the pause rule judges it (`wavePause`). */
export function waveRows(stats: readonly CampaignWaveStats[]): WaveRow[] {
  return [...stats]
    .sort((a, b) => (Date.parse(a.lastSentAt ?? "") || Infinity) - (Date.parse(b.lastSentAt ?? "") || Infinity))
    .map((s) => {
      const state: WaveState =
        s.handed === 0
          ? "not_sent"
          : s.bounced / s.handed > PAUSE_BOUNCE_RATE
            ? "over_bounce"
            : s.complained / s.handed > PAUSE_COMPLAINT_RATE
              ? "over_spam"
              : "ok";
      return {
        wave: s.wave,
        lastSentAt: s.lastSentAt,
        sent: s.handed,
        bounced: s.bounced,
        bouncedPercent: pct(s.bounced, s.handed),
        spam: s.complained,
        spamPercent: pct(s.complained, s.handed),
        failed: s.failed,
        pending: s.pending,
        state,
        stateText: {
          ok: "Under the lines",
          over_bounce: `Over ${PAUSE_BOUNCE_RATE * 100}% bounced`,
          over_spam: `Over ${PAUSE_COMPLAINT_RATE * 100}% spam`,
          not_sent: "Nothing delivered",
        }[state],
      };
    });
}

/** How long to wait after a campaign's first wave before the next (migration slice 09). */
export const RAMP_WAIT_MS = 48 * 3600_000;

/**
 * Pure — until when to wait before the next wave: 48 hours after the first
 * wave that reached anyone, while it is the only one. Null otherwise.
 */
export function rampUntil(stats: readonly CampaignWaveStats[], nowMs: number): string | null {
  const delivered = stats.filter((s) => s.handed > 0 && s.lastSentAt);
  if (delivered.length !== 1) return null;
  const until = Date.parse(delivered[0].lastSentAt!) + RAMP_WAIT_MS;
  return Number.isFinite(until) && nowMs < until ? new Date(until).toISOString() : null;
}
