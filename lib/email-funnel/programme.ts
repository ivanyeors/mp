/**
 * The designed programme of the **Email funnel** (PRD-email-funnel, *The
 * programme*; ADR 0054 (2)): every **Funnel step** each **Lifecycle stage** is
 * designed to receive, as data. Pure, and safe in the browser.
 *
 * A step is an **Automatic email** (it already sends, from the daily job or on
 * an event) or a **Playbook** (a ready-written campaign a person starts and
 * sets to keep sending). Nothing here sends: the page reads this list beside
 * what is set up (./model.ts).
 *
 * Timings are read from the code that sends, never retyped: the draft
 * reminders' days (`DRAFT_REMINDERS`), the Review request's days and the
 * Check-up's months (their settings, defaulting to the code's defaults), and
 * the stage thresholds (lib/crm/lifecycle-stage.ts). A new automatic email is
 * added here to appear on the page (ADR 0054, consequences).
 */

import { DEFAULT_CHECKUP_SETTINGS, CHECKUP_EMAIL_ID } from "@/lib/aftercare/checkup";
import { DEFAULT_REVIEW_REQUEST_SETTINGS, REVIEW_REQUEST_TEMPLATE } from "@/lib/aftercare/review-request";
import { parseCustomerFilters } from "@/lib/crm/customer-filters";
import { AT_RISK_AFTER_MONTHS, LAPSED_AFTER_MONTHS, LIFECYCLE_STAGES, type LifecycleStage } from "@/lib/crm/lifecycle-stage";
import { DRAFT_REMINDERS } from "@/lib/draft-reminders";
import { PLAYBOOK_DRAFTS } from "@/lib/email-campaigns/starters";

/** Where each step is changed, as Admin Panel paths without the locale (the page adds it). */
export const FUNNEL_PATHS = {
  campaigns: "/settings/campaigns",
  /** The draft reminders' switch is on General, beside the Results SLA. */
  draftReminders: "/settings/general",
  /** The Aftercare card: the Review request's and the Check-up reminder's switches and timings. */
  aftercare: "/settings/customers?view=settings",
  emailTemplates: "/settings/email-templates",
} as const;

/** A campaign's own page. */
export const campaignPath = (id: string) => `${FUNNEL_PATHS.campaigns}/${id}`;
/** New campaign started from a Playbook (PRD-email-funnel slice 04). */
export const newFromStarterPath = (starterId: string) => `${FUNNEL_PATHS.campaigns}/new?starter=${encodeURIComponent(starterId)}`;

/** The switches an Automatic step reads (`FunnelFacts.switches`). A step without one is always on. */
export type FunnelSwitch = "draftReminders" | "reviewRequests" | "checkups";

interface StepBase {
  /** Stable: `lead.draft_reminders`. Automatic emails' counts are keyed by it. */
  id: string;
  /** The stages it is listed under, in funnel order. One step may sit under two (the Check-up reminder). */
  stages: readonly LifecycleStage[];
  name: string;
  /** *Service* is sent whatever the Marketing consent; *Marketing* reads it. */
  purpose: "service" | "marketing";
  /** Which consent it reads, in words. */
  consent: string;
  who: string;
  when: string;
  /** What ends it for a person; empty when nothing but leaving the stage does. */
  stops: string;
  /** Where it is changed. */
  href: string;
}

export interface AutomaticStep extends StepBase {
  kind: "automatic";
  /** Its emails' ids in lib/email/registry.ts (the `customer_emails` template, or the registry id it renders). */
  templates: readonly string[];
  /** The switch that turns it off, or null for one that is always on. */
  switch: FunnelSwitch | null;
  /**
   * The one outcome it records, as the Results row names it; null for a
   * Service step that shows no numbers (order, return and quote emails).
   */
  outcome: string | null;
  /** Days after the trigger, where the step has fixed days (the draft reminders). */
  afterDays?: readonly number[];
}

export interface PlaybookStep extends StepBase {
  kind: "playbook";
  /** Its Starter's id in `PLAYBOOK_DRAFTS`. */
  starterId: string;
  /** The Segment it sends to, as the Playbook names it, and that Segment's filters (a Customers list query). */
  segment: { name: string; filters: string };
  /** A win-back: it reaches the **Unengaged** too. */
  includeUnengaged: boolean;
}

export type ProgrammeStep = AutomaticStep | PlaybookStep;

/** The settings the timings read; each defaults to the code's own default. */
export interface ProgrammeSettings {
  /** Months between Check-up reminders (`checkup_months`). */
  checkupMonths?: number;
  /** Days after delivery the Review request goes (`review_request_days_after`). */
  reviewRequestDays?: number;
}

const CONSENT = {
  service: "Service: sent whatever their marketing consent",
  marketing: "Marketing consent: only to people subscribed",
} as const;

/** `1` → *1 day*, `7` → *1 week*, `30` → *1 month*, else *n days*, as the settings write them. */
export function daysWords(n: number): string {
  if (n === 7) return "1 week";
  if (n === 30) return "1 month";
  return n === 1 ? "1 day" : `${n} days`;
}

/** `a`, `a and b`, `a, b and c`. */
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

/** The quote emails: a priced build's notices (lib/email/registry.ts `results.*`). */
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

/**
 * Pure — the programme, in funnel order and, within a stage, in the order its
 * steps reach a person. `settings` are the timings people can change.
 */
export function funnelProgramme(settings: ProgrammeSettings = {}): ProgrammeStep[] {
  const checkupMonths = settings.checkupMonths ?? DEFAULT_CHECKUP_SETTINGS.months;
  const reviewDays = settings.reviewRequestDays ?? DEFAULT_REVIEW_REQUEST_SETTINGS.daysAfter;
  const reminderDays = DRAFT_REMINDERS.map((r) => r.afterDays);
  // The *Second purchase* Playbook's days are its Segment's *Delivered* filter.
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
      who: "A guest with a Draft and no order",
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
      // The stages a Customer can be in a year after delivery.
      stages: ["loyal", "at_risk"],
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

/** The programme at the code's default timings. */
export const FUNNEL_PROGRAMME: readonly ProgrammeStep[] = funnelProgramme();

/** Pure — a stage's steps, in order. *Lost* has none. */
export const stepsOfStage = (programme: readonly ProgrammeStep[], stage: LifecycleStage): ProgrammeStep[] =>
  programme.filter((s) => s.stages.includes(stage));

/** What the Email flow says before a stage's steps. */
export interface StageEntry {
  /** Who enters the stage, in words. */
  enters: string;
  /** Said in place of steps: *Lost* is sent nothing. Null where the stage has steps. */
  nothingSent: string | null;
  /** The sunset rule (**Unengaged**) applies here: shown on *Lead* and *At risk* only. */
  sunsetRule: boolean;
}

/** Each stage's entry, every stage listed. */
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
    nothingSent: "Nothing is sent: they unsubscribed from marketing email.",
    sunsetRule: false,
  },
};

/** Every stage has an entry: the walk the tests and the page share. */
export const FUNNEL_STAGES: readonly LifecycleStage[] = LIFECYCLE_STAGES;
