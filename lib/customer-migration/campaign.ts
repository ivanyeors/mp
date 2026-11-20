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

export const CAMPAIGN_EMAIL_IDS: Record<CampaignTemplate, string> = {
  migration_announcement: "migration.announcement",
  migration_reminder: "migration.reminder",
  migration_service_notice: "migration.service_notice",
};

export const CAMPAIGN_TEMPLATE_LABEL: Record<CampaignTemplate, string> = {
  migration_announcement: "Account announcement",
  migration_reminder: "Account reminder",
  migration_service_notice: "Service notice: Mpillow has moved",
};

export const OFFER_TEMPLATES: ReadonlySet<CampaignTemplate> = new Set(["migration_announcement", "migration_reminder"]);

export const REMINDER_AFTER_DAYS = 7;

export const SERVICE_NOTICE_SETTING_KEY = "migration_service_notice_enabled";

export const WAVE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

export const CAMPAIGN_SEND_STATUSES = ["pending", "sent", "failed", "bounced", "complained"] as const;
export type CampaignSendStatus = (typeof CAMPAIGN_SEND_STATUSES)[number];

export function isCampaignSendStatus(value: unknown): value is CampaignSendStatus {
  return typeof value === "string" && (CAMPAIGN_SEND_STATUSES as readonly string[]).includes(value);
}

export const HANDED_STATUSES: ReadonlySet<CampaignSendStatus> = new Set(["sent", "bounced", "complained"]);

export interface CampaignSendFact {
  status: CampaignSendStatus;
  wave?: string;
  sentAt: string;
  bounced?: boolean;
  complained?: boolean;
}

export interface CampaignFacts {
  migrated: boolean;
  claimedAt: string | null;
  marketingEmail: MarketingEmailState;
  sends: Partial<Record<string, CampaignSendFact>>;
}

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
