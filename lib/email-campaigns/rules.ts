/**
 * Email campaigns (PRD-email-marketing): what a Campaign is, who may receive
 * it, and who a wave goes to. Pure; the reads and writes are in ./store.ts and
 * the sends in ./sender.ts.
 *
 * A Campaign is an email Staff write in the Admin Panel and send in waves to
 * one audience. Whatever the audience, only `subscribed` Customers receive it,
 * nobody whose campaign email bounced or drew a complaint, and nobody twice.
 *
 * `composedCampaignBlocker` is the rule the plan uses.
 * `marketing_campaign_blocker()` (20261021100000) is the same rule in SQL,
 * which `claim_marketing_campaign_send()` re-runs at the moment of each send,
 * so the SQL decides. supabase/tests/email-marketing/campaign-rule-cases.json
 * holds the two equal.
 */
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

/** The ledger's `template` for a Campaign: its sends are unique per Customer under this key. */
export const campaignLedgerKey = (campaignId: string) => `campaign:${campaignId}`;

/** A wave's label: what the ledger's check accepts. */
export const WAVE_LABEL = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

/** The most one wave holds, so a mistyped size cannot email the whole list. */
export const MAX_WAVE_SIZE = 1000;
/** The most addresses one test goes to. */
export const MAX_TEST_RECIPIENTS = 3;
/** Segments one campaign may leave out of its audience (PRD-campaign-audiences slice 06). */
export const MAX_EXCLUDED_SEGMENTS = 3;

export const CAMPAIGN_LIMITS = {
  name: 80,
  // The 中文 version's subject and preview line take the same (slice 17).
  subject: CONTENT_LIMITS.subject,
  preheader: CONTENT_LIMITS.preheader,
  body: 10000,
  buttonLabel: 40,
  buttonUrl: 500,
} as const;

/**
 * What an empty field shows, in its own `placeholder` (PRD-campaign-email-editor
 * decision 7). Hint text, never a value: it is not saved, tested or sent. The
 * editor's preview draws the subject, message and button label placeholders
 * dashed and muted where their words would go, so an empty email's layout
 * still reads.
 */
export const CAMPAIGN_PLACEHOLDERS = {
  name: "e.g. December cooling launch",
  subject: "e.g. Sleep cooler this December",
  preheader: "e.g. Our FibreCool covers are back, in every size",
  body: "Write your message. Leave a blank line between paragraphs; start a line with - for a bullet.",
  buttonLabel: "e.g. Shop the covers",
} as const;

const text = (max: number, empty: string) =>
  z.string().trim().min(1, empty).max(max, `At most ${max} characters.`);

/**
 * The draft's checks. Saving needs every word (`required`); the preview takes
 * them empty, so an empty email still shows its layout with its placeholders.
 *
 * An email is either its typed blocks (`content`, PRD-campaign-email-editor
 * slice 03), which every new campaign is, or the plain-text `body` and one
 * button of a campaign written before the editor: never both.
 */
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
      // Slice 06 (PRD-campaign-audiences): Segments whose Customers this campaign leaves out.
      excludeSegmentIds: z
        .array(z.string().uuid())
        .max(MAX_EXCLUDED_SEGMENTS, `Leave out at most ${MAX_EXCLUDED_SEGMENTS} Segments.`)
        .default([]),
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
      // A block campaign fills its Variables in the subject and preview line too.
      for (const field of ["subject", "preheader"] as const) {
        const unknown = unknownVariableMessage(d[field] ?? "");
        if (unknown) ctx.addIssue({ code: "custom", path: [field], message: unknown });
      }
      // Every Variable the email uses has words for a customer who has none (slice 13),
      // in English and, when it has one, in its 中文 version (slice 17).
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

/**
 * What the editor saves. `button` is null for none; `segmentId` only with the
 * Segment audience; `excludeSegmentIds` with any audience, at most 3, never
 * the one it is sent to. Mirrors the table's checks, so a draft that parses
 * saves.
 */
export const CampaignDraftSchema = draftSchema({ required: true });

/**
 * What the editor previews: the same checks with the words allowed empty. It
 * never saves or sends: a placeholder is never a value.
 */
export const CampaignPreviewSchema = draftSchema({ required: false });

export type CampaignDraft = z.output<typeof CampaignDraftSchema>;
export type CampaignDraftInput = z.input<typeof CampaignDraftSchema>;

/**
 * Pure — whether the Campaign promises points anywhere a customer reads it.
 * Such a Campaign goes to customers only while points are live
 * (`claimBonusOffer`, lib/points/offer.ts): an email never promises points a
 * sign-in would not grant (PRD-loyalty-points slice 05).
 */
export function mentionsPoints(c: Pick<CampaignDraft, "subject" | "preheader" | "body" | "button" | "content">): boolean {
  // The 中文 version's words count too (slice 17).
  return wordsMentionPoints([c.subject, c.preheader ?? "", c.body, c.button?.label ?? "", ...(c.content ? contentWords(c.content) : []), ...chineseWords(c.content)].join("\n"));
}

/**
 * Pure — some words promise points: they say "points" (积分 in the 中文
 * version, slice 17), or hold *Points balance* (PRD-campaign-email-editor
 * slice 13). What `mentionsPoints` asks of the whole email, and the checks
 * before a wave of each block (slice 11).
 */
export function wordsMentionPoints(words: string): boolean {
  return /\bpoints?\b|积分/i.test(words) || placeholdersIn(words).some((v) => isVariableKey(v) && Boolean(campaignVariable(v).needsPoints));
}

/**
 * Pure — the Variables a block campaign's email uses, once each, in order:
 * the greeting's *First name* when it is on (slice 13: one fallback for a first
 * name, wherever it appears), then the subject's, the preview line's and the
 * blocks'. None for a campaign written before blocks.
 */
export function variablesInEmail(c: Pick<CampaignDraft, "subject" | "preheader" | "content" | "greeting">): VariableKey[] {
  if (!c.content) return [];
  const greeting: VariableKey[] = c.greeting ? ["first_name"] : [];
  // The 中文 version's too (slice 17): a translation keeps the English's, but Staff may write one more in it.
  const chinese = chineseWords(c.content).flatMap((w) => placeholdersIn(w).filter(isVariableKey));
  return [...new Set([...greeting, ...variablesUsed(c.content, [c.subject, c.preheader ?? ""]), ...chinese])];
}

/** A Campaign as stored. */
export interface Campaign extends CampaignDraft {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** The first wave was planned: content and audience are fixed. */
  lockedAt: string | null;
  archivedAt: string | null;
  createdBy: string | null;
}

/** The one table row's columns, in its order. */
export const CAMPAIGN_COLUMNS =
  "id, name, subject, preheader, body, content, greeting, button_label, button_target, button_url, audience, segment_id, exclude_segment_ids, " +
  "created_at, updated_at, locked_at, archived_at, creator:mp_staff!created_by_profile_id(name)";

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * Pure — one `email_campaigns` row, or null for a malformed one. A block
 * campaign's `content` is read with the preview's checks, the shape and the
 * safety rules, so a row saved under an older limit still opens.
 */
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
    createdAt: str(row.created_at) ?? "",
    updatedAt: str(row.updated_at) ?? "",
    lockedAt: str(row.locked_at),
    archivedAt: str(row.archived_at),
    createdBy: str((creator as { name?: unknown } | null | undefined)?.name),
  };
}

/** Pure — the table's columns for a draft. A block campaign has no body and no button columns. */
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
  };
}

// ---------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------

export const CAMPAIGN_SEND_STATUSES = ["pending", "sent", "failed", "bounced", "complained"] as const;
export type CampaignSendStatus = (typeof CAMPAIGN_SEND_STATUSES)[number];

/** This Campaign's send to one Customer. */
export interface OwnSend {
  status: CampaignSendStatus;
  wave: string;
  sentAt: string;
}

/** One Customer as a Campaign's plan sees them (`marketing_campaign_candidates`). */
export interface CampaignCandidate {
  customerId: string;
  email: string;
  firstName: string | null;
  marketingEmail: MarketingEmailState;
  /** A `migrated_customers` row exists. */
  migrated: boolean;
  /** The Claim; null until then. */
  claimedAt: string | null;
  /** Orders here and on Shopify: a buyer has at least one. */
  ordersCount: number;
  /** The import, else the account's creation: newest first after buyers. */
  since: string;
  /** A campaign email of theirs bounced or drew a complaint. */
  suppressed: boolean;
  /** This Campaign's send to them, if any. */
  own: OwnSend | null;
  /** The language they use the site in (`customers.locale`): `zh-CN` gets a campaign's 中文 version (slice 17). */
  locale: string;
}

/** Why a Customer may not receive a Campaign now, in the order the rule checks. */
export const CAMPAIGN_RULE_BLOCKERS = [
  "not_migrated",
  "claimed",
  "unsubscribed",
  "suppressed",
  "not_subscribed",
  "failed",
  "already_sent",
] as const;
export type CampaignRuleBlocker = (typeof CAMPAIGN_RULE_BLOCKERS)[number];

/** What the SQL claim can answer besides the rule's own reasons. */
export type CampaignClaimBlocker = CampaignRuleBlocker | "unknown_campaign" | "campaign_archived" | "not_found";

export const CAMPAIGN_BLOCKER_TEXT: Record<CampaignClaimBlocker | "not_failed", string> = {
  not_migrated: "not imported from Shopify",
  claimed: "already signed in to their account",
  unsubscribed: "unsubscribed",
  suppressed: "an earlier campaign email bounced or was marked as spam",
  not_subscribed: "never agreed to marketing email",
  failed: "the send failed before (use Retry failed sends)",
  already_sent: "already sent this campaign",
  not_failed: "nothing of theirs failed",
  unknown_campaign: "the campaign no longer exists",
  campaign_archived: "the campaign is archived",
  not_found: "the customer no longer exists",
};

/**
 * Why `c` may not receive a Campaign for `audience` now, or null when they
 * may. The same checks, in the same order, as `marketing_campaign_blocker()`.
 * A Segment's membership is decided before this, when the wave is planned.
 */
export function composedCampaignBlocker(
  audience: CampaignAudience,
  c: Pick<CampaignCandidate, "migrated" | "claimedAt" | "marketingEmail" | "suppressed" | "own">,
  { retryFailed = false }: { retryFailed?: boolean } = {},
): CampaignRuleBlocker | null {
  if (audience === "imported_not_signed_in") {
    if (!c.migrated) return "not_migrated";
    if (c.claimedAt) return "claimed";
  }
  if (c.marketingEmail === "unsubscribed") return "unsubscribed";
  if (c.suppressed) return "suppressed";
  if (c.marketingEmail !== "subscribed") return "not_subscribed";
  if (c.own?.status === "failed" && !retryFailed) return "failed";
  if (c.own && c.own.status !== "failed") return "already_sent";
  return null;
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

export const isBuyer = (c: Pick<CampaignCandidate, "ordersCount">) => c.ordersCount >= 1;

/** Buyers first, then the newest, then the id, so two plans order one list the same way. */
export function compareSendOrder(a: CampaignCandidate, b: CampaignCandidate): number {
  const buyer = Number(isBuyer(b)) - Number(isBuyer(a));
  if (buyer !== 0) return buyer;
  const since = Date.parse(b.since) - Date.parse(a.since);
  if (since !== 0 && Number.isFinite(since)) return since;
  return a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0;
}

export type PlanExclusion = CampaignRuleBlocker | "not_failed";

export interface CampaignPlan {
  /** Customers in the audience before the rule. */
  considered: number;
  /** Everyone the rule allows now, in send order. */
  eligible: number;
  /** Of `eligible`, those with an order here or on Shopify. */
  eligibleBuyers: number;
  /** Who this wave goes to: the first `size` of the eligible. */
  selection: CampaignCandidate[];
  /** Why the others are left out, by reason. */
  excluded: Partial<Record<PlanExclusion, number>>;
  /** Sends already handed to the provider for this Campaign. */
  alreadySent: number;
  /** This Campaign's failed sends, which a retry would send again. */
  failed: number;
  /** Of `eligible`, and of the wave, those who read the site in Chinese (PRD-campaign-email-editor slice 17). */
  eligibleChinese: number;
  selectedChinese: number;
}

/** Pure — a wave of `size` from every candidate. A retry selects this Campaign's failed sends only. */
export function planCampaignWave(
  audience: CampaignAudience,
  candidates: readonly CampaignCandidate[],
  { size, retryFailed = false }: { size: number; retryFailed?: boolean },
): CampaignPlan {
  const excluded: Partial<Record<PlanExclusion, number>> = {};
  const exclude = (why: PlanExclusion) => {
    excluded[why] = (excluded[why] ?? 0) + 1;
  };
  const eligible: CampaignCandidate[] = [];
  let alreadySent = 0;
  let failed = 0;
  for (const c of candidates) {
    if (c.own && c.own.status !== "failed" && c.own.status !== "pending") alreadySent++;
    if (c.own?.status === "failed") failed++;
    const blocker = composedCampaignBlocker(audience, c, { retryFailed });
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
    failed,
    eligibleChinese: eligible.filter(readsChinese).length,
    selectedChinese: selection.filter(readsChinese).length,
  };
}

// ---------------------------------------------------------------------------
// Leaving Segments out (PRD-campaign-audiences slice 06)
// ---------------------------------------------------------------------------

/** A Segment the campaign leaves out, resolved when the wave is planned: who it chooses now. */
export interface SegmentExclusion {
  segmentId: string;
  name: string;
  customerIds: ReadonlySet<string>;
}

/** How many of the audience one left-out Segment took away. */
export interface LeftOutBySegment {
  segmentId: string;
  name: string;
  count: number;
}

/**
 * Pure — the audience less everyone a left-out Segment chooses, before the
 * rule runs. It only drops: what comes out is a subset of what went in, in the
 * same order. Someone in two left-out Segments counts once, against the first
 * in the campaign's order; every left-out Segment is listed, at 0 when it took
 * nobody away.
 */
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

/** Pure — the next wave's label: `w1`, `w2`, … after the ones the Campaign has. */
export function nextWaveLabel(existing: readonly string[]): string {
  const taken = new Set(existing);
  let n = existing.length + 1;
  while (taken.has(`w${n}`)) n++;
  return `w${n}`;
}

const isSendStatus = (v: unknown): v is CampaignSendStatus =>
  typeof v === "string" && (CAMPAIGN_SEND_STATUSES as readonly string[]).includes(v);

/** The view's columns, in its order. */
export const CANDIDATE_COLUMNS =
  "customer_id, email, first_name, locale, marketing_email, migrated, claimed_at, orders_count, since, suppressed, campaign_sends";

/** Pure — one `marketing_campaign_candidates` row for `campaignId`, or null for a malformed one. */
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
  };
}

/**
 * The sign-in invitation: the imported customers' invitation to the new
 * website, with the Claim bonus (PRD-loyalty-points: 1,000 points, S$10 off a
 * shop order, for signing in within 3 months of this email). It names no old
 * platform (owner, 2026-10-21). No longer where a new campaign starts
 * (PRD-campaign-email-editor decision 7): it is the Starter *New website:
 * sign in for points* (`INVITATION_STARTER`, slice 08), as blocks, the one
 * with finished words. Staff change any of it before sending.
 */
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
};

/**
 * An empty email (PRD-campaign-email-editor decision 7): every word empty and
 * on its placeholder, no blocks yet, the greeting on, and today's default
 * audience. A new campaign is written in blocks (slice 03). It does not save
 * until Staff write the email.
 */
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
};

/**
 * The draft a new campaign starts from: {@link EMPTY_CAMPAIGN_DRAFT}, whatever
 * the start. `?segment=<id>` from *Email this Segment* on Customers
 * (PRD-crm-retention-loop slice 02) sends it to that Segment and names it
 * after it, when the id is a live Segment that does not need review.
 */
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
