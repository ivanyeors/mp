/**
 * Campaign emails (PRD-shopify-customer-migration slice 08; ADR 0028 i): the
 * three templates, and who may receive each, as one pure rule.
 *
 * | Template                   | Who                                                                 |
 * |----------------------------|---------------------------------------------------------------------|
 * | `migration_announcement`   | Migrated, unclaimed, `subscribed`                                   |
 * | `migration_reminder`       | ...and the announcement was sent at least 7 days ago; once          |
 * | `migration_service_notice` | Migrated, unclaimed, `not_subscribed` (never `unsubscribed`); once  |
 *
 * Nobody `unsubscribed`, bounced or complained receives anything. Every
 * template goes to a Customer at most once: `customer_campaign_sends` is
 * unique on (Customer, template).
 *
 * `campaignBlocker` is the rule the dry run plans with.
 * `campaign_send_blocker()` (20261020130000) is the same rule in SQL, which
 * `claim_campaign_send()` re-runs at the moment of each send, so the SQL
 * decides. supabase/tests/customer-migration/campaign-cases.json holds the
 * two equal: `__tests__/campaign.test.ts` runs it here, and
 * `assert-08-campaign-sends.sql` runs it against Postgres.
 *
 * Owner decision 3 (the service notice, or nothing) is the
 * `migration_service_notice_enabled` setting. It is a precondition of a whole
 * wave, not of one Customer, so it is not part of this rule: the sender
 * refuses, and the claim function refuses too.
 */
import type { MarketingEmailState } from "@/lib/marketing-consent/state";

export const CAMPAIGN_TEMPLATES = [
  "migration_announcement",
  "migration_reminder",
  "migration_service_notice",
] as const;
export type CampaignTemplate = (typeof CAMPAIGN_TEMPLATES)[number];

export function isCampaignTemplate(value: unknown): value is CampaignTemplate {
  return typeof value === "string" && (CAMPAIGN_TEMPLATES as readonly string[]).includes(value);
}

/** The email registry id (lib/email/registry.ts) of each template. */
export const CAMPAIGN_EMAIL_IDS: Record<CampaignTemplate, string> = {
  migration_announcement: "migration.announcement",
  migration_reminder: "migration.reminder",
  migration_service_notice: "migration.service_notice",
};

/** How Staff and the sender name each one. */
export const CAMPAIGN_TEMPLATE_LABEL: Record<CampaignTemplate, string> = {
  migration_announcement: "Account announcement",
  migration_reminder: "Account reminder",
  migration_service_notice: "Service notice: Mpillow has moved",
};

/**
 * The templates that state the Welcome-back voucher. The service notice
 * carries no offer, voucher or promotion (PRD, legal points), so it is not
 * here.
 */
export const OFFER_TEMPLATES: ReadonlySet<CampaignTemplate> = new Set(["migration_announcement", "migration_reminder"]);

/** The reminder waits this long after the announcement. */
export const REMINDER_AFTER_DAYS = 7;

/** Owner decision 3, seeded 'false' (20261020130000). */
export const SERVICE_NOTICE_SETTING_KEY = "migration_service_notice_enabled";

/** A wave's label: what the SQL check accepts. */
export const WAVE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

export const CAMPAIGN_SEND_STATUSES = ["pending", "sent", "failed", "bounced", "complained"] as const;
export type CampaignSendStatus = (typeof CAMPAIGN_SEND_STATUSES)[number];

export function isCampaignSendStatus(value: unknown): value is CampaignSendStatus {
  return typeof value === "string" && (CAMPAIGN_SEND_STATUSES as readonly string[]).includes(value);
}

/** The provider accepted these: they reached, or were refused by, an inbox. */
export const HANDED_STATUSES: ReadonlySet<CampaignSendStatus> = new Set(["sent", "bounced", "complained"]);

/** One of the Customer's campaign sends, as `customer_campaign_candidates.sends` holds it. */
export interface CampaignSendFact {
  status: CampaignSendStatus;
  /** The wave that claimed it last. */
  wave?: string;
  /** When it was claimed, then when the provider accepted it. */
  sentAt: string;
  /** A hard bounce came back. */
  bounced?: boolean;
  /** The recipient marked it as spam. */
  complained?: boolean;
}

/** What the rule reads about one Customer. */
export interface CampaignFacts {
  /** A `migrated_customers` row exists. */
  migrated: boolean;
  /** The **Claim**; null until then. */
  claimedAt: string | null;
  marketingEmail: MarketingEmailState;
  /** Every campaign send of theirs, by template. */
  sends: Partial<Record<string, CampaignSendFact>>;
}

/** Why a Customer may not receive a template now, in the order the rule checks. */
export const CAMPAIGN_BLOCKERS = [
  "not_migrated",
  "claimed",
  "unsubscribed",
  "suppressed",
  "not_subscribed",
  "subscribed",
  "failed",
  "already_sent",
  "no_announcement",
  "announcement_too_recent",
] as const;
export type CampaignBlocker = (typeof CAMPAIGN_BLOCKERS)[number];

export const CAMPAIGN_BLOCKER_LABEL: Record<CampaignBlocker, string> = {
  not_migrated: "not a Migrated customer",
  claimed: "already Claimed",
  unsubscribed: "unsubscribed",
  suppressed: "an email of theirs bounced or drew a complaint",
  not_subscribed: "not subscribed to marketing email",
  subscribed: "subscribed: they get the announcement instead",
  failed: "failed before (retry with --retry-failed)",
  already_sent: "already sent, or in flight",
  no_announcement: "no announcement sent yet",
  announcement_too_recent: `announcement sent less than ${REMINDER_AFTER_DAYS} days ago`,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Why `facts`' Customer may not receive `template` at `now`, or null when they
 * may. The same checks, in the same order, as `campaign_send_blocker()`.
 */
export function campaignBlocker(
  template: CampaignTemplate,
  facts: CampaignFacts,
  { now = new Date(), retryFailed = false }: { now?: Date; retryFailed?: boolean } = {},
): CampaignBlocker | null {
  if (!facts.migrated) return "not_migrated";
  if (facts.claimedAt) return "claimed";
  if (facts.marketingEmail === "unsubscribed") return "unsubscribed";

  const sends = Object.values(facts.sends).filter((s): s is CampaignSendFact => Boolean(s));
  if (sends.some((s) => s.status === "bounced" || s.status === "complained" || s.bounced || s.complained)) {
    return "suppressed";
  }

  if (OFFER_TEMPLATES.has(template) && facts.marketingEmail !== "subscribed") return "not_subscribed";
  if (template === "migration_service_notice" && facts.marketingEmail !== "not_subscribed") return "subscribed";

  const own = facts.sends[template];
  if (own?.status === "failed" && !retryFailed) return "failed";
  if (own && own.status !== "failed") return "already_sent";

  if (template === "migration_reminder") {
    const announcement = facts.sends.migration_announcement;
    if (announcement?.status !== "sent") return "no_announcement";
    if (Date.parse(announcement.sentAt) > now.getTime() - REMINDER_AFTER_DAYS * DAY_MS) {
      return "announcement_too_recent";
    }
  }
  return null;
}
