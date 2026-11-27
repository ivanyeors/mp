import { z } from "zod";
import { placeholdersIn } from "@/lib/email/copy";
import type { MarketingEmailState } from "@/lib/marketing-consent/state";
import {
  CampaignContentPreviewSchema,
  CampaignContentSchema,
  CHINESE,
  CONTENT_LIMITS,
  contentWords,
  EMPTY_CAMPAIGN_CONTENT,
  isHttpsUrl,
  unknownVariableMessage,
  variablesUsed,
} from "./content";
import { chineseVersionOf, chineseWords } from "./chinese-version";
import { campaignVariable, fallbackWords, isVariableKey, type VariableKey } from "./variables";
import { KEEP_SENDING_COLUMNS, keepSendingFromRow, type KeepSending } from "./keep-sending";
import { inHoldout } from "./results";
import { LEAD_UNENGAGED_AFTER_MONTHS, UNENGAGED_AFTER_CAMPAIGNS } from "@/lib/crm/engagement";

export { isHttpsUrl };

export const CAMPAIGN_AUDIENCES = ["imported_not_signed_in", "subscribed", "segment"] as const;
export type CampaignAudience = (typeof CAMPAIGN_AUDIENCES)[number];

export const CAMPAIGN_AUDIENCE_LABEL: Record<CampaignAudience, string> = {
  imported_not_signed_in: "Imported from Shopify, not signed in yet",
  subscribed: "Everyone subscribed to marketing email",
  segment: "A saved Segment",
};

export const CAMPAIGN_BUTTON_TARGETS = ["sign_in", "url"] as const;
export type CampaignButtonTarget = (typeof CAMPAIGN_BUTTON_TARGETS)[number];

export const campaignLedgerKey = (campaignId: string) => `campaign:${campaignId}`;

export const WAVE_LABEL = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

export const MAX_WAVE_SIZE = 1000;
export const MAX_TEST_RECIPIENTS = 3;
export const MAX_EXCLUDED_SEGMENTS = 3;

export const REST_DAYS = 7;
export const REST_MAX_PER_30_DAYS = 4;
export const REST_WINDOW_DAYS = 30;

export const REST_PERIOD_TEXT = `Nobody gets a marketing email within ${REST_DAYS} days of their last one, or more than ${REST_MAX_PER_30_DAYS} in ${REST_WINDOW_DAYS} days. Points-expiry reminders count; order and aftercare email never do.`;

export const CAMPAIGN_LIMITS = {
  name: 80,
  subject: CONTENT_LIMITS.subject,
  preheader: CONTENT_LIMITS.preheader,
  body: 10000,
  buttonLabel: 40,
  buttonUrl: 500,
} as const;

export const CAMPAIGN_PLACEHOLDERS = {
  name: "e.g. December cooling launch",
  subject: "e.g. Sleep cooler this December",
  preheader: "e.g. Our FibreCool covers are back, in every size",
  body: "Write your message. Leave a blank line between paragraphs; start a line with - for a bullet.",
  buttonLabel: "e.g. Shop the covers",
} as const;

const text = (max: number, empty: string) =>
  z.string().trim().min(1, empty).max(max, `At most ${max} characters.`);

function draftSchema({ required }: { required: boolean }) {
  const words = (max: number, empty: string) =>
    required ? text(max, empty) : z.string().trim().max(max, `At most ${max} characters.`);
  return z
    .object({
      name: words(CAMPAIGN_LIMITS.name, "Give the campaign a name."),
      subject: words(CAMPAIGN_LIMITS.subject, "Write a subject."),
      preheader: z
        .string()
        .trim()
        .max(CAMPAIGN_LIMITS.preheader, `At most ${CAMPAIGN_LIMITS.preheader} characters.`)
        .transform((v) => v || null)
        .nullable()
        .default(null),
      body: z.string().max(CAMPAIGN_LIMITS.body, `At most ${CAMPAIGN_LIMITS.body} characters.`).default(""),
      content: (required ? CampaignContentSchema : CampaignContentPreviewSchema).nullable().default(null),
      greeting: z.boolean().default(true),
      button: z
        .object({
          target: z.enum(CAMPAIGN_BUTTON_TARGETS),
          label: words(CAMPAIGN_LIMITS.buttonLabel, "Give the button a label."),
          url: z.string().trim().max(CAMPAIGN_LIMITS.buttonUrl).nullable().default(null),
        })
        .nullable()
        .default(null)
        .superRefine((b, ctx) => {
          if (b?.target !== "url") return;
          if (!b.url || !isHttpsUrl(b.url)) {
            ctx.addIssue({ code: "custom", path: ["url"], message: "The button's link must be a full https:// address." });
          }
        }),
      audience: z.enum(CAMPAIGN_AUDIENCES),
      segmentId: z.string().uuid().nullable().default(null),
      excludeSegmentIds: z
        .array(z.string().uuid())
        .max(MAX_EXCLUDED_SEGMENTS, `Leave out at most ${MAX_EXCLUDED_SEGMENTS} Segments.`)
        .default([]),
      includeUnengaged: z.boolean().default(false),
    })
    .superRefine((d, ctx) => {
      if (d.audience === "segment" && !d.segmentId) {
        ctx.addIssue({ code: "custom", path: ["segmentId"], message: "Choose the Segment to send to." });
      }
      if (new Set(d.excludeSegmentIds).size !== d.excludeSegmentIds.length) {
        ctx.addIssue({ code: "custom", path: ["excludeSegmentIds"], message: "A Segment is left out twice." });
      }
      if (d.audience === "segment" && d.segmentId && d.excludeSegmentIds.includes(d.segmentId)) {
        ctx.addIssue({ code: "custom", path: ["excludeSegmentIds"], message: "It cannot leave out the Segment it is sent to." });
      }
      if (!d.content) {
        if (required && !d.body.trim()) ctx.addIssue({ code: "custom", path: ["body"], message: "Write the email." });
        return;
      }
      if (d.body.trim() || d.button) {
        ctx.addIssue({ code: "custom", path: ["content"], message: "An email is its blocks or its message, not both." });
      }
      for (const field of ["subject", "preheader"] as const) {
        const unknown = unknownVariableMessage(d[field] ?? "");
        if (unknown) ctx.addIssue({ code: "custom", path: [field], message: unknown });
      }
      if (!required) return;
      const chinese = chineseVersionOf(d.content);
      for (const key of variablesInEmail(d)) {
        const missing = `Write what to say to a customer with no ${campaignVariable(key).label.toLowerCase()}`;
        if (!fallbackWords(key, d.content.fallbacks)) ctx.addIssue({ code: "custom", path: ["content", "fallbacks", key], message: `${missing}.` });
        if (chinese && !fallbackWords(key, chinese.fallbacks, { chinese: true })) {
          ctx.addIssue({ code: "custom", path: ["content", "translations", CHINESE, "fallbacks", key], message: `${missing}, in Chinese.` });
        }
      }
    })
    .transform((d) => ({
      ...d,
      segmentId: d.audience === "segment" ? d.segmentId : null,
      button: d.button ? { ...d.button, url: d.button.target === "url" ? d.button.url : null } : null,
    }));
}

export const CampaignDraftSchema = draftSchema({ required: true });

export const CampaignPreviewSchema = draftSchema({ required: false });

export type CampaignDraft = z.output<typeof CampaignDraftSchema>;
export type CampaignDraftInput = z.input<typeof CampaignDraftSchema>;

export function mentionsPoints(c: Pick<CampaignDraft, "subject" | "preheader" | "body" | "button" | "content">): boolean {
  return wordsMentionPoints([c.subject, c.preheader ?? "", c.body, c.button?.label ?? "", ...(c.content ? contentWords(c.content) : []), ...chineseWords(c.content)].join("\n"));
}

export function wordsMentionPoints(words: string): boolean {
  return /\bpoints?\b|积分/i.test(words) || placeholdersIn(words).some((v) => isVariableKey(v) && Boolean(campaignVariable(v).needsPoints));
}

export function variablesInEmail(c: Pick<CampaignDraft, "subject" | "preheader" | "content" | "greeting">): VariableKey[] {
  if (!c.content) return [];
  const greeting: VariableKey[] = c.greeting ? ["first_name"] : [];
  const chinese = chineseWords(c.content).flatMap((w) => placeholdersIn(w).filter(isVariableKey));
  return [...new Set([...greeting, ...variablesUsed(c.content, [c.subject, c.preheader ?? ""]), ...chinese])];
}

export interface Campaign extends CampaignDraft {
  id: string;
  createdAt: string;
  updatedAt: string;
  lockedAt: string | null;
  archivedAt: string | null;
  createdBy: string | null;
  keepSending?: KeepSending;
}

export const CAMPAIGN_COLUMNS =
  "id, name, subject, preheader, body, content, greeting, button_label, button_target, button_url, audience, segment_id, exclude_segment_ids, include_unengaged, " +
  `created_at, updated_at, locked_at, archived_at, ${KEEP_SENDING_COLUMNS}, creator:mp_staff!created_by_profile_id(name)`;

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function campaignFromRow(row: Record<string, unknown>): Campaign | null {
  const id = str(row.id);
  const audience = str(row.audience);
  if (!id || !audience || !(CAMPAIGN_AUDIENCES as readonly string[]).includes(audience)) return null;
  const content = row.content == null ? null : CampaignContentPreviewSchema.safeParse(row.content);
  if (content && !content.success) return null;
  const target = str(row.button_target);
  const creator = Array.isArray(row.creator) ? row.creator[0] : row.creator;
  return {
    id,
    name: str(row.name) ?? "",
    subject: str(row.subject) ?? "",
    preheader: str(row.preheader),
    body: str(row.body) ?? "",
    content: content ? content.data : null,
    greeting: row.greeting !== false,
    button:
      target === "sign_in" || target === "url"
        ? { target, label: str(row.button_label) ?? "", url: target === "url" ? str(row.button_url) : null }
        : null,
    audience: audience as CampaignAudience,
    segmentId: str(row.segment_id),
    excludeSegmentIds: Array.isArray(row.exclude_segment_ids)
      ? row.exclude_segment_ids.filter((v): v is string => typeof v === "string")
      : [],
    includeUnengaged: row.include_unengaged === true,
    createdAt: str(row.created_at) ?? "",
    updatedAt: str(row.updated_at) ?? "",
    lockedAt: str(row.locked_at),
    archivedAt: str(row.archived_at),
    createdBy: str((creator as { name?: unknown } | null | undefined)?.name),
    keepSending: keepSendingFromRow(row),
  };
}

export function campaignRowFromDraft(d: CampaignDraft) {
  return {
    name: d.name,
    subject: d.subject,
    preheader: d.preheader,
    body: d.content ? null : d.body,
    content: d.content,
    greeting: d.greeting,
    button_label: d.button?.label ?? null,
    button_target: d.button?.target ?? null,
    button_url: d.button?.target === "url" ? d.button.url : null,
    audience: d.audience,
    segment_id: d.audience === "segment" ? d.segmentId : null,
    exclude_segment_ids: d.excludeSegmentIds,
    include_unengaged: d.includeUnengaged,
  };
}

export const CAMPAIGN_SEND_STATUSES = ["pending", "sent", "failed", "bounced", "complained", "held_out"] as const;
export type CampaignSendStatus = (typeof CAMPAIGN_SEND_STATUSES)[number];

export interface OwnSend {
  status: CampaignSendStatus;
  wave: string;
  sentAt: string;
}

export interface CampaignCandidate {
  customerId: string;
  email: string;
  firstName: string | null;
  marketingEmail: MarketingEmailState;
  migrated: boolean;
  claimedAt: string | null;
  ordersCount: number;
  since: string;
  suppressed: boolean;
  own: OwnSend | null;
  locale: string;
  recentMarketing?: readonly string[];
  holdoutBucket?: number | null;
  unengaged?: boolean;
}

export const CAMPAIGN_RULE_BLOCKERS = [
  "not_migrated",
  "claimed",
  "unsubscribed",
  "suppressed",
  "not_subscribed",
  "failed",
  "held_out",
  "already_sent",
  "unengaged",
  "resting",
] as const;
export type CampaignRuleBlocker = (typeof CAMPAIGN_RULE_BLOCKERS)[number];

export type CampaignClaimBlocker = CampaignRuleBlocker | "unknown_campaign" | "campaign_archived" | "not_found";

export const CAMPAIGN_BLOCKER_TEXT: Record<CampaignClaimBlocker | "not_failed", string> = {
  not_migrated: "not imported from Shopify",
  claimed: "already signed in to their account",
  unsubscribed: "unsubscribed",
  suppressed: "an earlier campaign email bounced or was marked as spam",
  not_subscribed: "never agreed to marketing email",
  failed: "the send failed before (use Retry failed sends)",
  held_out: "held out to measure the campaign, so never sent it",
  already_sent: "already sent this campaign",
  unengaged: `unengaged (clicked none of their last ${UNENGAGED_AFTER_CAMPAIGNS} campaigns, and Lapsed or a Lead for over ${LEAD_UNENGAGED_AFTER_MONTHS} months)`,
  resting: `resting (emailed in the last ${REST_DAYS} days, or ${REST_MAX_PER_30_DAYS} times in ${REST_WINDOW_DAYS} days)`,
  not_failed: "nothing of theirs failed",
  unknown_campaign: "the campaign no longer exists",
  campaign_archived: "the campaign is archived",
  not_found: "the customer no longer exists",
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function restUntil(recent: readonly string[] | undefined, now: Date = new Date()): string | null {
  const t = now.getTime();
  const times = (recent ?? [])
    .map((at) => Date.parse(at))
    .filter((at) => Number.isFinite(at) && at <= t && at > t - REST_WINDOW_DAYS * DAY_MS)
    .sort((a, b) => b - a);
  if (!times.length) return null;
  let until = times[0] + REST_DAYS * DAY_MS;
  if (times.length >= REST_MAX_PER_30_DAYS) {
    until = Math.max(until, times[REST_MAX_PER_30_DAYS - 1] + REST_WINDOW_DAYS * DAY_MS);
  }
  return until > t ? new Date(until).toISOString() : null;
}

export function composedCampaignBlocker(
  audience: CampaignAudience,
  c: Pick<CampaignCandidate, "migrated" | "claimedAt" | "marketingEmail" | "suppressed" | "own" | "recentMarketing" | "unengaged">,
  {
    retryFailed = false,
    now = new Date(),
    includeUnengaged = false,
  }: { retryFailed?: boolean; now?: Date; includeUnengaged?: boolean } = {},
): CampaignRuleBlocker | null {
  if (audience === "imported_not_signed_in") {
    if (!c.migrated) return "not_migrated";
    if (c.claimedAt) return "claimed";
  }
  if (c.marketingEmail === "unsubscribed") return "unsubscribed";
  if (c.suppressed) return "suppressed";
  if (c.marketingEmail !== "subscribed") return "not_subscribed";
  if (c.own?.status === "failed" && !retryFailed) return "failed";
  if (c.own?.status === "held_out") return "held_out";
  if (c.own && c.own.status !== "failed") return "already_sent";
  if (c.unengaged && !includeUnengaged) return "unengaged";
  if (restUntil(c.recentMarketing, now)) return "resting";
  return null;
}

export const isBuyer = (c: Pick<CampaignCandidate, "ordersCount">) => c.ordersCount >= 1;

export function compareSendOrder(a: CampaignCandidate, b: CampaignCandidate): number {
  const buyer = Number(isBuyer(b)) - Number(isBuyer(a));
  if (buyer !== 0) return buyer;
  const since = Date.parse(b.since) - Date.parse(a.since);
  if (since !== 0 && Number.isFinite(since)) return since;
  return a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0;
}

export type PlanExclusion = CampaignRuleBlocker | "not_failed";

export interface CampaignPlan {
  considered: number;
  eligible: number;
  eligibleBuyers: number;
  selection: CampaignCandidate[];
  excluded: Partial<Record<PlanExclusion, number>>;
  alreadySent: number;
  heldOut: number;
  failed: number;
  eligibleChinese: number;
  selectedChinese: number;
  restingUntil: string | null;
}

export function planCampaignWave(
  audience: CampaignAudience,
  candidates: readonly CampaignCandidate[],
  {
    size,
    retryFailed = false,
    now = new Date(),
    holdout = false,
    includeUnengaged = false,
  }: { size: number; retryFailed?: boolean; now?: Date; holdout?: boolean; includeUnengaged?: boolean },
): CampaignPlan {
  const excluded: Partial<Record<PlanExclusion, number>> = {};
  const exclude = (why: PlanExclusion) => {
    excluded[why] = (excluded[why] ?? 0) + 1;
  };
  const eligible: CampaignCandidate[] = [];
  let alreadySent = 0;
  let failed = 0;
  let restingUntil: string | null = null;
  for (const c of candidates) {
    if (c.own && c.own.status !== "failed" && c.own.status !== "pending" && c.own.status !== "held_out") alreadySent++;
    if (c.own?.status === "failed") failed++;
    const blocker = composedCampaignBlocker(audience, c, { retryFailed, now, includeUnengaged });
    if (blocker === "resting") {
      const until = restUntil(c.recentMarketing, now);
      if (until && (!restingUntil || until < restingUntil)) restingUntil = until;
    }
    if (blocker) exclude(blocker);
    else if (retryFailed && c.own?.status !== "failed") exclude("not_failed");
    else eligible.push(c);
  }
  eligible.sort(compareSendOrder);
  const n = Math.max(0, Math.min(MAX_WAVE_SIZE, Math.floor(size)));
  const selection = eligible.slice(0, n);
  const readsChinese = (c: CampaignCandidate) => c.locale === CHINESE;
  return {
    considered: candidates.length,
    eligible: eligible.length,
    eligibleBuyers: eligible.filter(isBuyer).length,
    selection,
    excluded,
    alreadySent,
    heldOut: holdout && !retryFailed ? selection.filter((c) => inHoldout(c.holdoutBucket)).length : 0,
    failed,
    eligibleChinese: eligible.filter(readsChinese).length,
    selectedChinese: selection.filter(readsChinese).length,
    restingUntil,
  };
}

export interface StillToSend {
  readyNow: number;
  resting: number;
  restingUntil: string | null;
}

export function stillToSend(
  audience: CampaignAudience,
  candidates: readonly CampaignCandidate[],
  { now = new Date(), holdout = false, includeUnengaged = false }: { now?: Date; holdout?: boolean; includeUnengaged?: boolean } = {},
): StillToSend {
  const left: StillToSend = { readyNow: 0, resting: 0, restingUntil: null };
  for (const c of candidates) {
    if (holdout && inHoldout(c.holdoutBucket)) continue;
    const blocker = composedCampaignBlocker(audience, c, { now, includeUnengaged });
    if (blocker === null) left.readyNow++;
    if (blocker !== "resting") continue;
    left.resting++;
    const until = restUntil(c.recentMarketing, now);
    if (until && (!left.restingUntil || until < left.restingUntil)) left.restingUntil = until;
  }
  return left;
}

export interface SegmentExclusion {
  segmentId: string;
  name: string;
  customerIds: ReadonlySet<string>;
}

export interface LeftOutBySegment {
  segmentId: string;
  name: string;
  count: number;
}

export function excludeSegmentMembers<C extends Pick<CampaignCandidate, "customerId">>(
  candidates: readonly C[],
  exclusions: readonly SegmentExclusion[],
): { candidates: C[]; leftOut: LeftOutBySegment[] } {
  const leftOut = exclusions.map((x) => ({ segmentId: x.segmentId, name: x.name, count: 0 }));
  const kept: C[] = [];
  for (const c of candidates) {
    const at = exclusions.findIndex((x) => x.customerIds.has(c.customerId));
    if (at < 0) kept.push(c);
    else leftOut[at]!.count++;
  }
  return { candidates: kept, leftOut };
}

export function selfDefeatingAudience(
  campaignId: string,
  segment: { name: string; filters: { campaign: { id: string; state: string } | null } },
): string | null {
  const c = segment.filters.campaign;
  if (!c || c.id !== campaignId.toLowerCase() || c.state === "not-sent") return null;
  return (
    `“${segment.name}” chooses people this campaign has already been sent, and nobody gets a campaign twice, ` +
    `so it would never send. Send it to another Segment, or use “${segment.name}” for a follow-up campaign.`
  );
}

export function nextWaveLabel(existing: readonly string[]): string {
  const taken = new Set(existing);
  let n = existing.filter((w) => /^w\d+$/.test(w)).length + 1;
  while (taken.has(`w${n}`)) n++;
  return `w${n}`;
}

const isSendStatus = (v: unknown): v is CampaignSendStatus =>
  typeof v === "string" && (CAMPAIGN_SEND_STATUSES as readonly string[]).includes(v);

export const CANDIDATE_COLUMNS =
  "customer_id, email, first_name, locale, marketing_email, migrated, claimed_at, orders_count, since, suppressed, campaign_sends, marketing_recent, holdout_bucket";

export function candidateFromRow(row: Record<string, unknown>, campaignId: string): CampaignCandidate | null {
  if (typeof row.customer_id !== "string" || typeof row.email !== "string") return null;
  const sends = (row.campaign_sends && typeof row.campaign_sends === "object" ? row.campaign_sends : {}) as Record<
    string,
    { status?: unknown; wave?: unknown; sent_at?: unknown } | undefined
  >;
  const mine = sends[campaignId];
  const own: OwnSend | null =
    mine && isSendStatus(mine.status)
      ? { status: mine.status, wave: typeof mine.wave === "string" ? mine.wave : "", sentAt: typeof mine.sent_at === "string" ? mine.sent_at : "" }
      : null;
  const consent = row.marketing_email;
  const orders = Number(row.orders_count ?? 0);
  return {
    customerId: row.customer_id,
    email: row.email,
    firstName: typeof row.first_name === "string" && row.first_name.trim() ? row.first_name.trim() : null,
    marketingEmail: consent === "subscribed" || consent === "unsubscribed" ? consent : "not_subscribed",
    migrated: row.migrated === true,
    claimedAt: typeof row.claimed_at === "string" ? row.claimed_at : null,
    ordersCount: Number.isFinite(orders) ? orders : 0,
    since: typeof row.since === "string" ? row.since : "",
    suppressed: row.suppressed === true,
    own,
    locale: typeof row.locale === "string" ? row.locale : "en-US",
    recentMarketing: Array.isArray(row.marketing_recent)
      ? row.marketing_recent.filter((at): at is string => typeof at === "string")
      : [],
    holdoutBucket: typeof row.holdout_bucket === "number" ? row.holdout_bucket : null,
  };
}

export const FIRST_CAMPAIGN_DRAFT: CampaignDraft = {
  name: "New website: sign in for points",
  subject: "Our new website is here, with points waiting for you",
  preheader: "Sign in within 3 months to collect 1,000 points, worth S$10 off your next order.",
  body: [
    "We have a new website, and your Mpillow account is ready on it. There's nothing to fill in and no password to set: sign in with this email address, and it's yours.",
    "",
    "## Points for signing in",
    "Sign in within 3 months of this email and we'll add 1,000 points to your account. That's S$10 off your next shop order, taken off at checkout.",
    "",
    "## What your account does",
    "- Saves your delivery addresses for a faster checkout",
    "- Books a re-adjustment for your pillow",
    "- Follows your orders and their delivery",
    "- Starts a return from the order it belongs to",
    "",
    "Questions? Just reply to this email.",
  ].join("\n"),
  content: null,
  greeting: true,
  button: { target: "sign_in", label: "Sign in and collect your points", url: null },
  audience: "imported_not_signed_in",
  segmentId: null,
  excludeSegmentIds: [],
  includeUnengaged: false,
};

export const EMPTY_CAMPAIGN_DRAFT: CampaignDraft = {
  name: "",
  subject: "",
  preheader: null,
  body: "",
  content: EMPTY_CAMPAIGN_CONTENT,
  greeting: true,
  button: null,
  audience: "imported_not_signed_in",
  segmentId: null,
  excludeSegmentIds: [],
  includeUnengaged: false,
};

export function newCampaignDraft(
  segmentParam: string | string[] | undefined,
  segments: readonly { id: string; name: string; needsReview: boolean }[],
): CampaignDraft {
  const id = Array.isArray(segmentParam) ? segmentParam[0] : segmentParam;
  const segment = id ? segments.find((s) => s.id === id && !s.needsReview) : undefined;
  if (!segment) return EMPTY_CAMPAIGN_DRAFT;
  return {
    ...EMPTY_CAMPAIGN_DRAFT,
    name: segment.name.slice(0, CAMPAIGN_LIMITS.name),
    audience: "segment",
    segmentId: segment.id,
  };
}
