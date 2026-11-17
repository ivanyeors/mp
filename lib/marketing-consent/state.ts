import type { UnsubscribeReason } from "./unsubscribe-reasons";
import { formatAdminDateMY } from "@/lib/format/admin-date";

/**
 * **Marketing consent** (CONTEXT.md; PRD-shopify-customer-migration slice 07,
 * ADR 0029 h): whether a Customer agreed to marketing email, with the source
 * and time of the change that set it. Pure, so the Profile, the unsubscribe
 * page, the Customer page and the Customers list share one vocabulary.
 *
 * Writes go through `set_marketing_email()` (20261020120000) only, which
 * appends every change to `customer_consent_events`. Nothing moves a Customer
 * back to `not_subscribed`, and nothing moves `unsubscribed` → `subscribed`
 * except the customer's own `account` action. The import's default, the
 * boxes (checkout, customisation, booking, Sign in), the footer sign-up and
 * the Explore page's Claim button subscribe only someone nobody has asked
 * (ADR 0039).
 */

export const MARKETING_EMAIL_STATES = ["subscribed", "not_subscribed", "unsubscribed"] as const;
export type MarketingEmailState = (typeof MARKETING_EMAIL_STATES)[number];

/** Who or what made a change. The migrations' checks list the same thirteen (20261117100000). */
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

/** The Profile toggle: the platform's first first-party consent capture. */
export const MARKETING_EMAIL_LABEL = "Email me news and offers";

/**
 * The box where people give their email, ticked by default (owner, 2026-10-31):
 * what the emails are, and the promise, in one line. The same words at
 * checkout, on a customisation's contact step and on booking; the booking
 * form's Chinese is in its messages (`slides.bookAppointment.flow.marketingEmail`).
 */
export const MARKETING_BOX_LABEL = "Email me important updates, event invites and offers. No spam, unsubscribe anytime.";

/**
 * The sources a box records (ADR 0039): subscribe only, only someone nobody has
 * asked. The sign-up acts as one (PRD-campaign-audiences slice 03): `sign_in`
 * is the box on Sign in's Customer tab, `newsletter` the footer's "Get our
 * emails"; both are recorded only once the address is proven.
 */
export const CONSENT_BOX_SOURCES = ["checkout", "customisation", "appointment", "sign_in", "newsletter"] as const;
export type ConsentBoxSource = (typeof CONSENT_BOX_SOURCES)[number];

export const MARKETING_EMAIL_STATE_LABEL: Record<MarketingEmailState, string> = {
  subscribed: "Subscribed",
  not_subscribed: "Not subscribed",
  unsubscribed: "Unsubscribed",
};

/** How the Customer page names each source, after "by" or "from". */
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

/** An unknown or missing value reads as nobody having asked. */
export function marketingEmailState(value: unknown): MarketingEmailState {
  return isMarketingEmailState(value) ? value : "not_subscribed";
}

/** One row of `customer_consent_events`. */
export interface ConsentEvent {
  fromState: MarketingEmailState;
  toState: MarketingEmailState;
  source: ConsentSource;
  /** When the change took effect; the export day for a Shopify one. */
  createdAt: string;
  /** An unsubscribe's answer to *Mind telling us why?* (PRD-crm-retention-loop slice 11), when given. */
  reason?: { reason: UnsubscribeReason; text: string | null };
}

/** What the Customer page shows: the state, its provenance, and every change. */
export interface MarketingConsentView {
  state: MarketingEmailState;
  source: ConsentSource | null;
  updatedAt: string | null;
  /** Newest first. */
  history: ConsentEvent[];
}

/** Sources that read "from …", not "by …": a file or a form, not a person. */
const FROM_SOURCES: readonly ConsentSource[] = ["shopify_import", "import_default", "shopify_unsubscribed", ...CONSENT_BOX_SOURCES];

/** "from the Shopify export", "by the customer, in their account". */
export function consentSourcePhrase(source: ConsentSource): string {
  return `${FROM_SOURCES.includes(source) ? "from" : "by"} ${CONSENT_SOURCE_LABEL[source]}`;
}

/**
 * The state with its provenance, in one line: "Subscribed on 15 Oct 2026, from
 * the Shopify export." A Customer nobody has asked has none.
 */
export function describeConsent(view: Pick<MarketingConsentView, "state" | "source" | "updatedAt">): string {
  if (view.state === "not_subscribed" || !view.source) {
    return "Not subscribed. They have not agreed to marketing email.";
  }
  const label = MARKETING_EMAIL_STATE_LABEL[view.state];
  const on = view.updatedAt ? ` on ${formatAdminDateMY(view.updatedAt)}` : "";
  return `${label}${on}, ${consentSourcePhrase(view.source)}.`;
}

/** One history line: "Subscribed → Unsubscribed". */
export function describeConsentChange(event: Pick<ConsentEvent, "fromState" | "toState">): string {
  return `${MARKETING_EMAIL_STATE_LABEL[event.fromState]} → ${MARKETING_EMAIL_STATE_LABEL[event.toState]}`;
}
