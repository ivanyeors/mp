import { DEFAULT_CHECKUP_SETTINGS, CHECKUP_EMAIL_ID } from "@/lib/aftercare/checkup";
import { DEFAULT_REVIEW_REQUEST_SETTINGS, REVIEW_REQUEST_TEMPLATE } from "@/lib/aftercare/review-request";
import { parseCustomerFilters } from "@/lib/crm/customer-filters";
import { AT_RISK_AFTER_MONTHS, LAPSED_AFTER_MONTHS, LIFECYCLE_STAGES, type LifecycleStage } from "@/lib/crm/lifecycle-stage";
import { DRAFT_REMINDERS } from "@/lib/draft-reminders";
import { PLAYBOOK_DRAFTS } from "@/lib/email-campaigns/starters";

export const FUNNEL_PATHS = {
  campaigns: "/settings/campaigns",
  draftReminders: "/settings/general",
  aftercare: "/settings/customers?view=settings",
  emailTemplates: "/settings/email-templates",
} as const;

export const campaignPath = (id: string) => `${FUNNEL_PATHS.campaigns}/${id}`;
export const newFromStarterPath = (starterId: string) => `${FUNNEL_PATHS.campaigns}/new?starter=${encodeURIComponent(starterId)}`;

export type FunnelSwitch = "draftReminders" | "reviewRequests" | "checkups";

interface StepBase {
  id: string;
  stages: readonly LifecycleStage[];
  name: string;
  purpose: "service" | "marketing";
  consent: string;
  who: string;
  when: string;
  stops: string;
  href: string;
}

export interface AutomaticStep extends StepBase {
  kind: "automatic";
  templates: readonly string[];
  switch: FunnelSwitch | null;
  outcome: string | null;
  afterDays?: readonly number[];
}

export interface PlaybookStep extends StepBase {
  kind: "playbook";
  starterId: string;
  segment: { name: string; filters: string };
  includeUnengaged: boolean;
}

export type ProgrammeStep = AutomaticStep | PlaybookStep;

export interface ProgrammeSettings {
  checkupMonths?: number;
  reviewRequestDays?: number;
}

const CONSENT = {
  service: "Service: sent whatever their marketing consent",
  marketing: "Marketing consent: only to people subscribed",
} as const;

export function daysWords(n: number): string {
  if (n === 7) return "1 week";
  if (n === 30) return "1 month";
  return n === 1 ? "1 day" : `${n} days`;
}

const listWords = (xs: readonly string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

const playbook = (
  id: string,
  starterId: string,
  stages: readonly LifecycleStage[],
  parts: Pick<StepBase, "who" | "when" | "stops">,
): PlaybookStep => {
  const p = PLAYBOOK_DRAFTS.find((x) => x.id === starterId);
  if (!p || p.audience?.audience !== "segment") throw new Error(`Playbook ${starterId} has no Segment`);
  return {
    kind: "playbook",
    id,
    stages,
    name: p.label,
    purpose: "marketing",
    consent: CONSENT.marketing,
    href: FUNNEL_PATHS.campaigns,
    starterId,
    segment: { name: p.audience.segment, filters: p.audience.filters },
    includeUnengaged: p.audience.includeUnengaged === true,
    ...parts,
  };
};

const QUOTE_TEMPLATES = [
  "results.held",
  "results.assigned",
  "results.assigned_balance",
  "results.updated",
  "results.balance_due",
  "results.hold_expired",
  "results.hold_expired_unpaid",
  "results.declined",
] as const;

const ORDER_TEMPLATES = [
  "order.order_confirmation",
  "order.payment_receipt",
  "order.payment_request",
  "order.shipping",
  "order.tracking_out_for_delivery",
  "order.tracking_delivery_attempt",
  "order.tracking_delivered",
  "order.tracking_exception",
  "order.refund",
] as const;

const RETURN_TEMPLATES = [
  "rma.rma_requested",
  "rma.rma_approved",
  "rma.rma_rejected",
  "rma.rma_instructions",
  "rma.rma_completed",
  "rma.rma_refunded",
] as const;

export function funnelProgramme(settings: ProgrammeSettings = {}): ProgrammeStep[] {
  const checkupMonths = settings.checkupMonths ?? DEFAULT_CHECKUP_SETTINGS.months;
  const reviewDays = settings.reviewRequestDays ?? DEFAULT_REVIEW_REQUEST_SETTINGS.daysAfter;
  const reminderDays = DRAFT_REMINDERS.map((r) => r.afterDays);
  const second = PLAYBOOK_DRAFTS.find((p) => p.id === "playbook_second_purchase")?.audience;
  const secondPurchaseDays =
    second?.audience === "segment" ? parseCustomerFilters(new URLSearchParams(second.filters)).filters.delivered?.days : undefined;
  return [
    {
      kind: "automatic",
      id: "lead.draft_reminders",
      stages: ["lead"],
      name: `Finish your pillow (${DRAFT_REMINDERS.length} reminders)`,
      purpose: "marketing",
      consent: CONSENT.marketing,
      who: "Someone subscribed with an unfinished Draft, who has not finished a Result since. Listed under Lead, where they usually are: a past buyer who starts a new Draft gets them too",
      when: `${listWords(reminderDays.map(daysWords))} after they last saved it`,
      stops: "They hold it, pay or start another; or they unsubscribe",
      href: FUNNEL_PATHS.draftReminders,
      templates: DRAFT_REMINDERS.map((r) => r.template),
      switch: "draftReminders",
      outcome: "Drafts finished afterwards",
      afterDays: reminderDays,
    },
    {
      kind: "automatic",
      id: "lead.quote_emails",
      stages: ["lead"],
      name: "Build ready, payment due, hold expired",
      purpose: "service",
      consent: CONSENT.service,
      who: "Someone with a priced build",
      when: "On the event",
      stops: "Paid, declined or expired",
      href: FUNNEL_PATHS.emailTemplates,
      templates: QUOTE_TEMPLATES,
      switch: null,
      outcome: null,
    },
    playbook("lead.how_its_made", "playbook_how_its_made", ["lead"], {
      who: "Every subscribed Lead",
      when: "As they become a Lead",
      stops: "They buy or attend a booking (New or Loyal)",
    }),
    {
      kind: "automatic",
      id: "new.order_emails",
      stages: ["new"],
      name: "Order, delivery and refund emails",
      purpose: "service",
      consent: CONSENT.service,
      who: "Every buyer",
      when: "On the event",
      stops: "",
      href: FUNNEL_PATHS.emailTemplates,
      templates: ORDER_TEMPLATES,
      switch: null,
      outcome: null,
    },
    {
      kind: "automatic",
      id: "new.return_emails",
      stages: ["new"],
      name: "Return emails",
      purpose: "service",
      consent: CONSENT.service,
      who: "A buyer who asks to return",
      when: "On the event",
      stops: "",
      href: FUNNEL_PATHS.emailTemplates,
      templates: RETURN_TEMPLATES,
      switch: null,
      outcome: null,
    },
    {
      kind: "automatic",
      id: "new.review_request",
      stages: ["new"],
      name: "Review request",
      purpose: "service",
      consent: "Service: sent whatever their marketing consent, unless they turned off aftercare email",
      who: "Delivered",
      when: `${daysWords(reviewDays)} after delivery, once per Customer ever`,
      stops: "",
      href: FUNNEL_PATHS.aftercare,
      templates: [REVIEW_REQUEST_TEMPLATE],
      switch: "reviewRequests",
      outcome: "Opened the review link",
    },
    playbook("new.second_purchase", "playbook_second_purchase", ["new"], {
      who: `Delivered over ${secondPurchaseDays} days ago`,
      when: `As they pass ${secondPurchaseDays} days`,
      stops: "A second purchase (Loyal)",
    }),
    playbook("loyal.thank_you", "playbook_thank_you", ["loyal"], {
      who: "2 or more purchases, or an attended booking",
      when: "As they become Loyal",
      stops: "",
    }),
    {
      kind: "automatic",
      id: "aftercare.checkup_reminder",
      stages: checkupMonths < AT_RISK_AFTER_MONTHS ? ["new", "loyal", "at_risk"] : ["loyal", "at_risk"],
      name: "Check-up reminder",
      purpose: "marketing",
      consent: "Marketing consent, and aftercare email not turned off",
      who: "Premium Mpillow owners",
      when: `Every ${checkupMonths} months after delivery`,
      stops: "Re-adjusted or reminded in the period",
      href: FUNNEL_PATHS.aftercare,
      templates: [CHECKUP_EMAIL_ID],
      switch: "checkups",
      outcome: "Followed by a booking",
    },
    playbook("at_risk.we_miss_you", "playbook_we_miss_you", ["at_risk"], {
      who: `${AT_RISK_AFTER_MONTHS} to ${LAPSED_AFTER_MONTHS} months since their last purchase or booking`,
      when: `As they pass ${AT_RISK_AFTER_MONTHS} months`,
      stops: "A purchase or an attended booking (Loyal)",
    }),
    playbook("at_risk.welcome_back", "playbook_welcome_back", ["at_risk"], {
      who: `Lapsed: over ${LAPSED_AFTER_MONTHS} months, the Unengaged included`,
      when: `As they pass ${LAPSED_AFTER_MONTHS} months`,
      stops: "A purchase or an attended booking (Loyal)",
    }),
  ];
}

export const FUNNEL_PROGRAMME: readonly ProgrammeStep[] = funnelProgramme();

export const stepsOfStage = (programme: readonly ProgrammeStep[], stage: LifecycleStage): ProgrammeStep[] =>
  programme.filter((s) => s.stages.includes(stage));

export interface StageEntry {
  enters: string;
  nothingSent: string | null;
  sunsetRule: boolean;
}

export const STAGE_ENTRIES: Record<LifecycleStage, StageEntry> = {
  lead: {
    enters: "Someone who gave us their email and has no purchase or attended booking yet",
    nothingSent: null,
    sunsetRule: true,
  },
  new: { enters: "Their first purchase", nothingSent: null, sunsetRule: false },
  loyal: { enters: "A second purchase, or an attended re-adjustment booking", nothingSent: null, sunsetRule: false },
  at_risk: {
    enters: `No purchase or attended booking for over ${AT_RISK_AFTER_MONTHS} months`,
    nothingSent: null,
    sunsetRule: true,
  },
  lost: {
    enters: "They unsubscribed from marketing email",
    nothingSent:
      "No marketing email is sent: they unsubscribed. Service emails about an order (order, return and review request emails) still are.",
    sunsetRule: false,
  },
};

export const FUNNEL_STAGES: readonly LifecycleStage[] = LIFECYCLE_STAGES;
