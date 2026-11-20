import type { UnsubscribeReason } from "./unsubscribe-reasons";
import { formatAdminDateMY } from "@/lib/format/admin-date";

export const MARKETING_EMAIL_STATES = ["subscribed", "not_subscribed", "unsubscribed"] as const;
export type MarketingEmailState = (typeof MARKETING_EMAIL_STATES)[number];

export const CONSENT_SOURCES = [
  "shopify_import",
  "import_default",
  "shopify_unsubscribed",
  "checkout",
  "customisation",
  "appointment",
  "sign_in",
  "newsletter",
  "explore_claim",
  "account",
  "unsubscribe_link",
  "complaint",
  "support",
] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

export const MARKETING_EMAIL_LABEL = "Email me news and offers";

export const MARKETING_BOX_LABEL = "Email me important updates, event invites and offers. No spam, unsubscribe anytime.";

export const CONSENT_BOX_SOURCES = ["checkout", "customisation", "appointment", "sign_in", "newsletter"] as const;
export type ConsentBoxSource = (typeof CONSENT_BOX_SOURCES)[number];

export const MARKETING_EMAIL_STATE_LABEL: Record<MarketingEmailState, string> = {
  subscribed: "Subscribed",
  not_subscribed: "Not subscribed",
  unsubscribed: "Unsubscribed",
};

export const CONSENT_SOURCE_LABEL: Record<ConsentSource, string> = {
  shopify_import: "the Shopify export",
  import_default: "the import, by default",
  shopify_unsubscribed: "Shopify's unsubscribed list",
  checkout: "the box at checkout",
  customisation: "the box when they customised",
  appointment: "the box when they booked",
  sign_in: "the box when they signed in",
  newsletter: "the email sign-up in the site footer",
  explore_claim: "the Claim button on the Explore page",
  account: "the customer, in their account",
  unsubscribe_link: "the unsubscribe link in an email",
  complaint: "a spam complaint",
  support: "Staff, at the customer's request",
};

export function isMarketingEmailState(value: unknown): value is MarketingEmailState {
  return typeof value === "string" && (MARKETING_EMAIL_STATES as readonly string[]).includes(value);
}

export function isConsentSource(value: unknown): value is ConsentSource {
  return typeof value === "string" && (CONSENT_SOURCES as readonly string[]).includes(value);
}

export function marketingEmailState(value: unknown): MarketingEmailState {
  return isMarketingEmailState(value) ? value : "not_subscribed";
}

export interface ConsentEvent {
  fromState: MarketingEmailState;
  toState: MarketingEmailState;
  source: ConsentSource;
  createdAt: string;
  reason?: { reason: UnsubscribeReason; text: string | null };
}

export interface MarketingConsentView {
  state: MarketingEmailState;
  source: ConsentSource | null;
  updatedAt: string | null;
  history: ConsentEvent[];
}

const FROM_SOURCES: readonly ConsentSource[] = ["shopify_import", "import_default", "shopify_unsubscribed", ...CONSENT_BOX_SOURCES];

export function consentSourcePhrase(source: ConsentSource): string {
  return `${FROM_SOURCES.includes(source) ? "from" : "by"} ${CONSENT_SOURCE_LABEL[source]}`;
}

export function describeConsent(view: Pick<MarketingConsentView, "state" | "source" | "updatedAt">): string {
  if (view.state === "not_subscribed" || !view.source) {
    return "Not subscribed. They have not agreed to marketing email.";
  }
  const label = MARKETING_EMAIL_STATE_LABEL[view.state];
  const on = view.updatedAt ? ` on ${formatAdminDateMY(view.updatedAt)}` : "";
  return `${label}${on}, ${consentSourcePhrase(view.source)}.`;
}

export function describeConsentChange(event: Pick<ConsentEvent, "fromState" | "toState">): string {
  return `${MARKETING_EMAIL_STATE_LABEL[event.fromState]} → ${MARKETING_EMAIL_STATE_LABEL[event.toState]}`;
}
