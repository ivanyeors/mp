import {
  PAUSE_BOUNCE_RATE,
  PAUSE_COMPLAINT_RATE,
  type CampaignWaveStats,
  type SendAllowance,
} from "@/lib/customer-migration/campaign-ledger";
import type { PreflightCheck } from "@/lib/customer-migration/wave-sender";
import { formatAdminWeekdayTime } from "@/lib/format/admin-date";
import type { Locale } from "@/lib/i18n/locales";
import type { ContentCheck } from "./content-checks";

const n = (v: number) => v.toLocaleString("en-SG");
const plural = (count: number, one: string, many = `${one}s`) => `${n(count)} ${count === 1 ? one : many}`;

export const CHECK_LABEL: Record<string, string> = {
  transport: "Campaign email account (Resend)",
  from: "Sending address",
  domain: "Sending domain in Resend",
  reply_to: "Where replies go",
  site: "Links point at the live site",
  unsubscribe_route: "One-click unsubscribe works",
  unsubscribe_secret: "Unsubscribe links are signed correctly",
  pause: "Bounces and spam reports are low",
  points: "Points are live",
  products: "Every product is still in the shop",
  chinese: "The 中文 version is complete",
  placeholders: "Every block is written",
  links: "Every link answers",
  alt: "Every image has alt text",
  images: "Every image shows in every inbox",
  fallbacks: "Every Variable has fallback words",
  clinical: "No health claims",
  size: "Under Gmail's clip",
  size_close: "Size",
  subject_length: "Subject length",
  preview_line: "Preview line",
  image_words: "Words beside the images",
  ai_drafted: "Drafted with AI",
  links_unchecked: "Links not checked",
  fit_chinese: "Readers of Chinese",
  fit_fallbacks: "Who reads the fallback words",
  fit_in_store: "In-store visits",
  fit_already_own: "Products they already own",
  fit_recent: "Recent buyers",
  fit_unread: "Who it goes to",
  send_limit: "Room in the sending plan",
  reports: "Bounce and spam reports",
};

export const isEmailCheck = (c: PreflightCheck | ContentCheck): c is ContentCheck => "issues" in c;

export function roomAgainText(allowance: Pick<SendAllowance, "roomAt" | "binding">): string {
  if (allowance.roomAt) return `room again from ${formatAdminWeekdayTime(allowance.roomAt)}`;
  return allowance.binding === "daily" ? "room again tomorrow" : "room again once the oldest send is 31 days old";
}

export interface AllowanceMeter {
  label: "Today" | "This month";
  used: number;
  limit: number;
  left: number;
  percent: number;
  text: string;
}

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

export function allowanceSummary(a: SendAllowance): string {
  if (a.remaining === 0) {
    const what = a.binding === "daily" ? `Today's ${n(a.limits.daily)}` : `This month's ${n(a.limits.monthly)}`;
    return `${what} are used: ${roomAgainText(a)}.`;
  }
  return `${plural(a.remaining, "email")} can go now${a.binding === "monthly" ? " (this month's limit is the closer one)" : ""}.`;
}

export function defaultWaveSize(allowance: Pick<SendAllowance, "remaining"> | null, firstWave: boolean, max: number): number {
  const cap = firstWave ? 50 : max;
  if (!allowance) return Math.min(cap, firstWave ? 50 : 100);
  return Math.max(1, Math.min(cap, allowance.remaining || 1));
}

export interface SendingRow {
  key: string;
  ok: boolean;
  title: string;
  detail: string;
  fix: string | null;
}

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

export interface SendStepItem {
  text: string;
  blockId: string | null;
  advisory: boolean;
  language?: Locale;
}

export interface SendStep {
  key: "saved" | "test" | "email" | "checks" | "room";
  label: string;
  done: boolean;
  advisory: boolean;
  detail: string;
  items?: SendStepItem[];
}

export function sendSteps(p: {
  dirty: boolean;
  locked: boolean;
  lastTest: { sent: number; at: string } | null;
  checks: readonly (PreflightCheck | ContentCheck)[] | null;
  advice?: readonly ContentCheck[] | null;
  allowance: SendAllowance | null;
  resume: boolean;
}): SendStep[] {
  const all = p.checks ?? [];
  const email = all.filter(isEmailCheck);
  const unfixed = email.filter((c) => !c.ok);
  const blocking = all.filter((c) => !isEmailCheck(c) && c.key !== "send_limit" && !c.ok && !(c.key === "pause" && p.resume));
  const listed = (c: ContentCheck, advisory: boolean): SendStepItem[] =>
    c.issues.length
      ? c.issues.map((i) => ({ text: i.text, blockId: i.blockId, advisory, ...(i.language ? { language: i.language } : {}) }))
      : [{ text: c.detail, blockId: null, advisory }];
  const fixes = unfixed.flatMap((c) => listed(c, false));
  const items = [...fixes, ...(p.advice ?? []).flatMap((c) => listed(c, true))];
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
      key: "email",
      label: "The email",
      done: p.checks !== null && unfixed.length === 0,
      advisory: false,
      detail:
        p.checks === null
          ? "Checking…"
          : fixes.length
            ? `${plural(fixes.length, "thing")} to fix before it can go:`
            : !email.length
              ? "Nothing in the email to check."
              : items.length
                ? "Nothing in it holds the wave."
                : "Its links, images, size and words are all fine.",
      ...(p.checks !== null && items.length ? { items } : {}),
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
            ? "Resend, the sending address and its domain, replies, unsubscribe and the pause rule are all fine."
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

export function languageSummary(p: { eligible: number; eligibleChinese: number; selected: number; selectedChinese: number; hasChinese: boolean }): string | null {
  if (!p.eligibleChinese) return null;
  const readers = `${n(p.eligibleChinese)} of ${plural(p.eligible, "customer")} ${p.eligibleChinese === 1 ? "reads" : "read"} the site in Chinese`;
  if (!p.hasChinese) return `${readers}; they get English, as this email has no 中文 version.`;
  const wave = p.selected < p.eligible ? ` In this wave, ${n(p.selectedChinese)} of ${n(p.selected)} get it.` : "";
  return `${readers} and will get the 中文 version; everyone else gets English.${wave}`;
}

export function fitSummary(count: number): string | null {
  if (!count) return null;
  return `Recommended: ${count === 1 ? "one thing" : `${n(count)} things`} about who it goes to, listed under The email above. None holds the wave.`;
}

export function nextStepAfterWave(p: {
  sent: number;
  failed: number;
  stoppedByStaff: boolean;
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
  stateText: string;
}

const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—");

export const PAUSE_LINES_TEXT = `A wave pauses sending when more than ${PAUSE_BOUNCE_RATE * 100}% of it bounces, or more than ${PAUSE_COMPLAINT_RATE * 100}% marks it as spam.`;

export function waveRows(stats: readonly CampaignWaveStats[]): WaveRow[] {
  return [...stats]
    .filter((s) => s.handed + s.failed + s.pending > 0)
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

export const RAMP_WAIT_MS = 48 * 3600_000;

export function rampUntil(stats: readonly CampaignWaveStats[], nowMs: number): string | null {
  const delivered = stats.filter((s) => s.handed > 0 && s.lastSentAt);
  if (delivered.length !== 1) return null;
  const until = Date.parse(delivered[0].lastSentAt!) + RAMP_WAIT_MS;
  return Number.isFinite(until) && nowMs < until ? new Date(until).toISOString() : null;
}
