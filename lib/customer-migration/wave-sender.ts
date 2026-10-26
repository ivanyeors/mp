/**
 * The wave sender (PRD-shopify-customer-migration slice 08; ADR 0029 i).
 *
 * A human runs every wave (scripts/customer-migration-send.ts). It is a dry
 * run unless `apply`: it prints the checks, the eligible count and the
 * selection, and sends nothing.
 *
 * **Before it sends anything** it refuses, sending nothing, unless:
 *  - the transport is Resend, built from CAMPAIGN_RESEND_API_KEY
 *    (`getCampaignTransport`), never the Gmail mailbox that sends order email;
 *  - CAMPAIGN_EMAIL_FROM is on the campaign subdomain, CAMPAIGN_EMAIL_DOMAIN;
 *  - the target site answers `POST /api/email/unsubscribe` (README, first
 *    hazard: no campaign email before one-click unsubscribe is live), and
 *    verifies links signed with this machine's UNSUBSCRIBE_SECRET;
 *  - an offer template's Claim bonus would be granted by a sign-in now (the
 *    email promises it: `claimBonusOffer`), and owner decision 3 allows the
 *    service notice;
 *  - the most recent wave holds no pause condition (bounces over 2%,
 *    complaints over 0.1%), or the human passes `resume`;
 *  - the send limit leaves room: Resend's free plan allows 100 a day and
 *    3,000 a month (`campaignSendLimits`), counted from the ledger over every
 *    template and wave.
 *
 * **What it sends.** The audience comes from `selectCampaignAudience`. Each
 * person is claimed in the ledger BEFORE the send (`claim_campaign_send`),
 * which re-checks them in SQL at that moment; the unique key makes a second
 * or concurrent run skip anyone already claimed. Each email gets its own
 * Claim link (`mintClaimLink`), the footer's unsubscribe link, and
 * `List-Unsubscribe` with `List-Unsubscribe-Post` (RFC 8058). Reply-To is the
 * support inbox. About two messages a second; it stops after five failures
 * in a row, or at once when Resend says its quota is used up. A failed send
 * is marked `failed`, and retried only with `retryFailed`.
 *
 * **Staggering.** A run sends no more than the send limit leaves, and holds
 * the rest of its selection back. The wave keeps its room, so the same
 * command run again the next day carries on where it stopped.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPPORT_WHATSAPP_DISPLAY, SUPPORT_WHATSAPP_URL } from "@/lib/contact";
import {
  checkCampaignFrom,
  emailAddressOf,
  RESEND_FREE_SEND_LIMITS,
  type CampaignSendLimits,
} from "@/lib/email/campaign-transport";
import {
  renderMigrationAnnouncementEmail,
  renderMigrationReminderEmail,
  renderMigrationServiceNoticeEmail,
  type CampaignBonusTerms,
} from "@/lib/email/migration";
import type { EmailTransport, RenderedEmail } from "@/lib/email/types";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import {
  listUnsubscribeHeaders,
  probeUnsubscribeRoute,
  probeUnsubscribeSecret,
  unsubscribeLinks,
  UNSUBSCRIBE_ROUTE,
} from "@/lib/marketing-consent/unsubscribe";
import { selectCampaignAudience, isBuyer, type AudienceExclusion, type CampaignAudience } from "./audience";
import {
  CAMPAIGN_BLOCKER_LABEL,
  CAMPAIGN_TEMPLATE_LABEL,
  OFFER_TEMPLATES,
  WAVE_PATTERN,
  type CampaignTemplate,
} from "./campaign";
import {
  claimCampaignSend,
  finishCampaignSend,
  readCampaignWaveStats,
  readRecentCampaignSends,
  readServiceNoticeEnabled,
  sendBudget,
  wavePause,
  type CampaignWaveStats,
} from "./campaign-ledger";
import { mintClaimLink } from "./claim-link";
import { claimBonusOffer } from "@/lib/points/offer";
import { readPointsSettings } from "@/lib/points/server";

/** About two messages a second. */
export const THROTTLE_MS = 500;
/** Stop the wave after this many failures in a row. */
export const MAX_CONSECUTIVE_FAILURES = 5;

/** Resend's answer when the account's daily or monthly quota is used up (`daily_quota_exceeded`, `monthly_quota_exceeded`). */
export function isSendQuotaError(message: string): boolean {
  return /\(429\)/.test(message) && /quota/i.test(message);
}

export interface WaveRequest {
  template: CampaignTemplate;
  /** The wave's label, e.g. `pilot` or `w1`. */
  wave: string;
  /** The most the wave holds. */
  limit: number;
  /** Leave out subscribers who never bought. */
  buyersOnly?: boolean;
  /** Re-claim this wave's failed sends, and nobody else. */
  retryFailed?: boolean;
  /** Send. Without it, a dry run. */
  apply?: boolean;
  /** Run although the latest wave holds a pause condition. */
  resume?: boolean;
}

export interface WaveSetup {
  admin: SupabaseClient;
  /** `getCampaignTransport()`: null without CAMPAIGN_RESEND_API_KEY. */
  transport: EmailTransport | null;
  /** CAMPAIGN_EMAIL_FROM. */
  campaignFrom: string | undefined;
  /** CAMPAIGN_EMAIL_DOMAIN: the sending subdomain. */
  campaignDomain: string | undefined;
  /** The mailbox order email is sent from, which campaign mail must not share. */
  orderFrom: string | null;
  /** The support inbox: Reply-To, and the `mailto:` unsubscribe. */
  replyTo: string | null;
  /** The site every link points at, and whose unsubscribe route is probed. */
  origin: string;
  /** UNSUBSCRIBE_SECRET on this machine: it signs every link sent. */
  unsubscribeSecret: string | undefined;
  /** `campaignSendLimits()`; Resend's free plan when absent. */
  sendLimits?: CampaignSendLimits;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

export interface PreflightCheck {
  key: string;
  ok: boolean;
  detail: string;
}

export interface WavePreflight {
  checks: PreflightCheck[];
  /** Every check passed. */
  ready: boolean;
  /** The Claim bonus as the offer templates state it; null when a sign-in would grant none. */
  bonus: CampaignBonusTerms | null;
  stats: CampaignWaveStats[];
  /** How many this run may send under the send limit; null when the ledger could not be counted. */
  budget: number | null;
}

export type WaveSendOutcome =
  | { customerId: string; email: string; outcome: "sent"; providerMessageId: string | null; ledgerUpdated: boolean }
  | { customerId: string; email: string; outcome: "failed"; error: string }
  | { customerId: string; email: string; outcome: "skipped"; reason: string };

export interface WaveReport {
  request: WaveRequest;
  preflight: WavePreflight;
  audience: CampaignAudience | null;
  /** Error reading the audience, if it could not be read. */
  audienceError: string | null;
  /** True when it sent (apply, and every check passed). */
  ran: boolean;
  claimed: number;
  sent: number;
  failed: number;
  skipped: Partial<Record<string, number>>;
  /** Why it stopped before the end of the selection. */
  stopped: string | null;
  /** Selected, but left for a later run by the send limit. */
  heldBack: number;
  results: WaveSendOutcome[];
}

/** `we***@example.com`: enough to recognise in a terminal, not a mailing list. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

const count = (n: number) => n.toLocaleString("en-US");

const isLocalHost = (host: string) => host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");

async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** What the delivery checks read: the campaign transport, and the site its links point at. */
export type DeliverySetup = Pick<
  WaveSetup,
  "transport" | "campaignFrom" | "campaignDomain" | "orderFrom" | "replyTo" | "origin" | "unsubscribeSecret" | "fetchImpl"
>;

/**
 * The delivery checks that need no network call: the Resend transport, the
 * From on the campaign subdomain, a support inbox for Reply-To, and a public
 * https site. The Email campaigns page's Sending card shows these on every
 * load. Pure.
 */
export function campaignConfigChecks(setup: Omit<DeliverySetup, "fetchImpl" | "unsubscribeSecret">): PreflightCheck[] {
  const checks: PreflightCheck[] = [];
  const add = (key: string, ok: boolean, detail: string) => checks.push({ key, ok, detail });

  const t = setup.transport;
  add(
    "transport",
    t?.name === "resend",
    !t
      ? "CAMPAIGN_RESEND_API_KEY is not set (owner decision 4)"
      : t.name === "resend"
        ? "Resend, from CAMPAIGN_RESEND_API_KEY"
        : `the transport is ${t.name}: campaign mail goes through Resend only, never the order mailbox`,
  );

  const from = checkCampaignFrom({ from: setup.campaignFrom, domain: setup.campaignDomain, orderFrom: setup.orderFrom });
  add("from", from.ok, from.ok ? `${from.from}, on ${from.domain}` : from.reason);

  const replyTo = emailAddressOf(setup.replyTo);
  add(
    "reply_to",
    Boolean(replyTo && !replyTo.endsWith("@resend.dev")),
    replyTo && !replyTo.endsWith("@resend.dev") ? `replies go to ${replyTo}` : "no support inbox for Reply-To: set SUPPORT_EMAIL",
  );

  let site: URL | null = null;
  try {
    site = new URL(setup.origin);
  } catch {
    site = null;
  }
  const siteOk = Boolean(site && site.protocol === "https:" && !isLocalHost(site.hostname));
  add("site", siteOk, siteOk ? `links point at ${site!.origin}` : `${setup.origin} is not a public https site`);
  return checks;
}

/**
 * The checks every campaign email passes before anything is sent, whatever it
 * says: {@link campaignConfigChecks}, then that site answering one-click
 * unsubscribe for links signed here. Shared by the wave sender and the Email
 * campaigns page (lib/email-campaigns/sender.ts). Changes nothing.
 */
export async function campaignDeliveryChecks(setup: DeliverySetup): Promise<PreflightCheck[]> {
  const checks = campaignConfigChecks(setup);
  const add = (key: string, ok: boolean, detail: string) => checks.push({ key, ok, detail });

  const route = await probeUnsubscribeRoute(setup.origin, setup.fetchImpl);
  add("unsubscribe_route", route.ready, route.ready ? `${setup.origin}${UNSUBSCRIBE_ROUTE} answers one-click unsubscribe` : route.reason);
  const secret = route.ready
    ? await probeUnsubscribeSecret(setup.origin, { secret: setup.unsubscribeSecret, fetchImpl: setup.fetchImpl })
    : ({ ready: false, reason: "not checked: the unsubscribe route is not ready" } as const);
  add("unsubscribe_secret", secret.ready, secret.ready ? "the site verifies links signed here" : secret.reason);
  return checks;
}

/**
 * Every check a wave must pass before it sends anything. Runs in a dry run
 * too, so the human sees what an `apply` would refuse. Changes nothing: the
 * probes are a one-click POST with no link, and one with a link for a
 * Customer who does not exist.
 */
export async function campaignPreflight(req: WaveRequest, setup: WaveSetup, now: Date = new Date()): Promise<WavePreflight> {
  const checks: PreflightCheck[] = [];
  const add = (key: string, ok: boolean, detail: string) => checks.push({ key, ok, detail });

  add("wave", WAVE_PATTERN.test(req.wave), WAVE_PATTERN.test(req.wave) ? `wave ${req.wave}` : `"${req.wave}" is not a wave label (1 to 32 letters, digits, - or _)`);
  add("limit", Number.isInteger(req.limit) && req.limit > 0, `at most ${req.limit} in the wave`);

  checks.push(...(await campaignDeliveryChecks(setup)));

  if (req.template === "migration_service_notice") {
    const on = await attempt(() => readServiceNoticeEnabled(setup.admin));
    add(
      "service_notice",
      on.ok && on.value,
      !on.ok
        ? on.error
        : on.value
          ? "owner decision 3: the no-consent group gets the service notice"
          : "owner decision 3 is not answered (migration_service_notice_enabled is not 'true'): the no-consent group gets nothing",
    );
  }

  let bonus: CampaignBonusTerms | null = null;
  if (OFFER_TEMPLATES.has(req.template)) {
    const read = await attempt(() => readPointsSettings(setup.admin));
    if (!read.ok) add("bonus", false, read.error);
    else {
      const offer = claimBonusOffer(read.value, now);
      bonus = offer.live ? { points: offer.points, amount: offer.amount, months: offer.months } : null;
      add(
        "bonus",
        offer.live,
        offer.live
          ? `a sign-in within ${offer.months} months grants ${offer.points} (${offer.amount})`
          : `this email promises points, and a sign-in now would grant none (${offer.reason}): set them in Discounts → Points`,
      );
    }
  }

  let stats: CampaignWaveStats[] = [];
  const read = await attempt(() => readCampaignWaveStats(setup.admin));
  if (!read.ok) add("pause", false, read.error);
  else {
    stats = read.value;
    const pause = wavePause(stats);
    add(
      "pause",
      !pause.paused || Boolean(req.resume),
      pause.paused
        ? `wave ${pause.wave} (${pause.template}): ${pause.reason}; ${req.resume ? "resumed with --resume" : "investigate that segment, then --resume"}`
        : "no wave holds a pause condition",
    );
  }

  let budget: number | null = null;
  const limits = setup.sendLimits ?? RESEND_FREE_SEND_LIMITS;
  const used = await attempt(() => readRecentCampaignSends(setup.admin, now));
  if (!used.ok) add("send_limit", false, used.error);
  else {
    const b = sendBudget(limits, used.value);
    budget = b.remaining;
    const counted = `${count(used.value.lastDay)} of ${count(limits.daily)} sent in the last 24 hours, ${count(used.value.lastMonth)} of ${count(limits.monthly)} in the last 31 days`;
    add(
      "send_limit",
      b.remaining > 0,
      b.remaining > 0
        ? `${counted}: this run sends at most ${count(b.remaining)}`
        : `${counted}: the ${b.binding} limit (CAMPAIGN_${b.binding.toUpperCase()}_SEND_LIMIT) is used up; run it again ${b.binding === "daily" ? "tomorrow" : "once the oldest of them is 31 days old"}`,
    );
  }

  return { checks, ready: checks.every((c) => c.ok), bonus, stats, budget };
}

/** Pure — one campaign email for one recipient. */
export function renderCampaignEmail(
  template: CampaignTemplate,
  p: {
    firstName: string | null;
    email: string;
    claimUrl: string;
    unsubscribeUrl: string;
    bonus: CampaignBonusTerms | null;
    origin: string;
    locale: Locale;
  },
): RenderedEmail {
  const recipient = { firstName: p.firstName, email: p.email, unsubscribeUrl: p.unsubscribeUrl };
  if (template === "migration_service_notice") {
    return renderMigrationServiceNoticeEmail({
      ...recipient,
      signInUrl: p.claimUrl,
      siteHost: new URL(p.origin).host,
      readjustmentUrl: `${p.origin}${withLocale("/appointments", p.locale)}?type=readjustment`,
      supportWhatsAppDisplay: SUPPORT_WHATSAPP_DISPLAY,
      supportWhatsAppUrl: SUPPORT_WHATSAPP_URL,
    });
  }
  if (!p.bonus) throw new Error(`${template} states the Claim bonus, and a sign-in would grant none`);
  const offer = { ...recipient, claimUrl: p.claimUrl, bonus: p.bonus, termsUrl: `${p.origin}${withLocale("/points", p.locale)}` };
  return template === "migration_reminder" ? renderMigrationReminderEmail(offer) : renderMigrationAnnouncementEmail(offer);
}

/**
 * One wave: the checks, the audience, and (with `apply`, when every check
 * passed) the sends. Never throws for one recipient: their outcome is in the
 * report.
 */
export async function runCampaignWave(req: WaveRequest, setup: WaveSetup): Promise<WaveReport> {
  const now = (setup.now ?? (() => new Date()))();
  const sleep = setup.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const preflight = await campaignPreflight(req, setup, now);

  const report: WaveReport = {
    request: req,
    preflight,
    audience: null,
    audienceError: null,
    ran: false,
    claimed: 0,
    sent: 0,
    failed: 0,
    skipped: {},
    stopped: null,
    heldBack: 0,
    results: [],
  };

  const audience = await attempt(() =>
    selectCampaignAudience(
      setup.admin,
      req.template,
      { wave: req.wave, limit: req.limit, buyersOnly: req.buyersOnly, retryFailed: req.retryFailed },
      now,
    ),
  );
  if (!audience.ok) {
    report.audienceError = audience.error;
    return report;
  }
  const selection =
    preflight.budget === null ? audience.value.selection : audience.value.selection.slice(0, preflight.budget);
  report.heldBack = audience.value.selection.length - selection.length;
  report.audience = { ...audience.value, selection };
  if (!req.apply || !preflight.ready) return report;

  report.ran = true;
  const transport = setup.transport!;
  const from = setup.campaignFrom!.trim();
  const replyTo = emailAddressOf(setup.replyTo)!;
  const origin = setup.origin.replace(/\/$/, "");
  let consecutive = 0;

  for (const candidate of selection) {
    if (consecutive >= MAX_CONSECUTIVE_FAILURES) {
      report.stopped = `${MAX_CONSECUTIVE_FAILURES} sends in a row failed. Check the transport, then run again (the ledger skips who was sent)`;
      break;
    }
    const masked = maskEmail(candidate.email);
    const claim = await claimCampaignSend(setup.admin, {
      customerId: candidate.customerId,
      template: req.template,
      wave: req.wave,
      retryFailed: req.retryFailed,
    });
    if ("error" in claim) {
      report.failed++;
      consecutive++;
      report.results.push({ customerId: candidate.customerId, email: masked, outcome: "failed", error: `claim: ${claim.error}` });
      continue;
    }
    if (!claim.claimed) {
      report.skipped[claim.blocker] = (report.skipped[claim.blocker] ?? 0) + 1;
      report.results.push({ customerId: candidate.customerId, email: masked, outcome: "skipped", reason: claim.blocker });
      continue;
    }

    report.claimed++;
    const locale: Locale = isSupportedLocale(claim.locale) ? claim.locale : DEFAULT_LOCALE;
    try {
      const unsubscribe = unsubscribeLinks(candidate.customerId, { origin, locale, secret: setup.unsubscribeSecret });
      if (!unsubscribe) throw new Error("no unsubscribe link could be signed");
      const link = await mintClaimLink(setup.admin, { customerId: candidate.customerId, template: req.template, locale, origin });
      const rendered = renderCampaignEmail(req.template, {
        firstName: claim.firstName,
        email: claim.email,
        claimUrl: link.url,
        unsubscribeUrl: unsubscribe.pageUrl,
        bonus: preflight.bonus,
        origin,
        locale,
      });
      const result = await transport.send({
        ...rendered,
        to: claim.email,
        from,
        replyTo,
        headers: listUnsubscribeHeaders(unsubscribe, { mailto: replyTo }),
      });
      const ledgerUpdated = await finishCampaignSend(setup.admin, {
        sendId: claim.sendId,
        sent: true,
        providerMessageId: result.id ?? null,
      });
      report.sent++;
      consecutive = 0;
      report.results.push({
        customerId: candidate.customerId,
        email: maskEmail(claim.email),
        outcome: "sent",
        providerMessageId: result.id ?? null,
        ledgerUpdated,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await finishCampaignSend(setup.admin, { sendId: claim.sendId, sent: false, error: message });
      report.failed++;
      consecutive++;
      report.results.push({ customerId: candidate.customerId, email: maskEmail(claim.email), outcome: "failed", error: message });
      if (isSendQuotaError(message)) {
        report.stopped =
          "Resend's sending quota is used up. Run the same command again once it resets, and --retry-failed for the send it refused";
        break;
      }
    }
    await sleep(THROTTLE_MS);
  }
  return report;
}

const EXCLUSION_LABEL: Record<AudienceExclusion, string> = {
  ...CAMPAIGN_BLOCKER_LABEL,
  not_a_buyer: "never bought (--buyers-only)",
  not_failed: "nothing of theirs failed in this wave (--retry-failed)",
};

/** Pure — the report as the script prints it. Emails are masked. */
export function formatWaveReport(report: WaveReport): string[] {
  const { request: req, preflight, audience } = report;
  const lines: string[] = [];
  const mode = req.apply ? "SEND" : "DRY RUN (nothing is sent; add --apply to send)";
  lines.push(`${CAMPAIGN_TEMPLATE_LABEL[req.template]} (${req.template}), wave ${req.wave}: ${mode}`);
  lines.push("");
  lines.push("Checks:");
  for (const c of preflight.checks) lines.push(`  ${c.ok ? "ok  " : "FAIL"} ${c.key}: ${c.detail}`);

  if (preflight.stats.length > 0) {
    lines.push("");
    lines.push("Waves so far (handed / bounced / complained / failed / pending):");
    for (const s of preflight.stats) {
      lines.push(`  ${s.template} ${s.wave}: ${s.handed} / ${s.bounced} / ${s.complained} / ${s.failed} / ${s.pending}`);
    }
  }

  lines.push("");
  if (report.audienceError) {
    lines.push(`Could not read the audience: ${report.audienceError}`);
  } else if (audience) {
    lines.push(`Migrated customers: ${audience.considered}`);
    lines.push(`Eligible now: ${audience.eligible.length} (${audience.eligibleBuyers} bought on Shopify)`);
    for (const [why, count] of Object.entries(audience.excluded)) {
      lines.push(`  not eligible, ${EXCLUSION_LABEL[why as AudienceExclusion] ?? why}: ${count}`);
    }
    lines.push(
      req.retryFailed
        ? `Retrying up to ${audience.room} failed send(s) of wave ${req.wave}.`
        : `Wave ${req.wave} already holds ${audience.alreadyInWave} of ${req.limit}; room for ${audience.room}.`,
    );
    lines.push(`Selection (${audience.selection.length}, buyers first, then most recent import):`);
    for (const c of audience.selection) {
      lines.push(`  ${c.customerId}  ${maskEmail(c.email).padEnd(28)} ${isBuyer(c) ? "buyer" : "no orders"}  imported ${c.importedAt.slice(0, 10)}`);
    }
    if (report.heldBack > 0) {
      lines.push(`Held back by the send limit: ${report.heldBack} more. The same command sends them on a later day.`);
    }
  }

  lines.push("");
  if (!req.apply) lines.push(preflight.ready ? "Every check passes: --apply would send." : "An --apply would refuse: a check fails.");
  else if (!report.ran) lines.push("REFUSED: nothing was sent, because a check failed or the audience could not be read.");
  else {
    lines.push(`Sent ${report.sent}, failed ${report.failed}, skipped ${report.results.filter((r) => r.outcome === "skipped").length}.`);
    for (const [why, count] of Object.entries(report.skipped)) lines.push(`  skipped, ${why}: ${count}`);
    for (const r of report.results) {
      if (r.outcome === "failed") lines.push(`  failed ${r.customerId} ${r.email}: ${r.error}`);
      if (r.outcome === "sent" && !r.ledgerUpdated) {
        lines.push(`  sent ${r.customerId} ${r.email}, but the ledger kept it pending: it will not be sent again`);
      }
    }
    if (report.stopped) lines.push(`STOPPED: ${report.stopped}.`);
  }
  return lines;
}
