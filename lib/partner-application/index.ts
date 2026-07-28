/**
 * Partner application domain logic (Partner Hub #73). Pure — no server-only
 * imports, no DB, no I/O — so the apply form, the hub guard, and the #83 test
 * slice can all import it. Mirrors the `lib/rma/transitions.ts` state-machine
 * style (a TRANSITIONS map + a `canTransition` reader).
 */

import { isValidPhone } from "@/lib/appointments/phone";

/**
 * The current static agreement version (dated string). Bumping this forces
 * every approved partner through re-acceptance on next hub entry — the money
 * terms and the AHPC disclosure clause live in that agreement, so a change
 * must be re-consented (ADR 0015).
 */
export const AGREEMENT_VERSION = "2026-07-28";

export type ApplicationStatus = "pending" | "approved" | "rejected";

/** Allowed status transitions. Approved/rejected are terminal (#76 owns approval). */
const APPLICATION_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  pending: ["approved", "rejected"],
  approved: [],
  rejected: [],
};

export function canTransitionApplication(
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean {
  return (APPLICATION_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * True when an approved partner's recorded `agreed_version` no longer matches
 * the current agreement (null/missing ⇒ true), so the hub must gate them
 * through re-acceptance before rendering.
 */
export function needsReaccept(
  agreedVersion: string | null | undefined,
  currentVersion = AGREEMENT_VERSION,
): boolean {
  return !agreedVersion || agreedVersion !== currentVersion;
}

export const BUSINESS_CATEGORIES = [
  "physio",
  "chiro",
  "tcm",
  "wellness",
  "retail",
  "other",
] as const;

export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number];

export const BUSINESS_CATEGORY_LABELS: Record<BusinessCategory, string> = {
  physio: "Physiotherapy",
  chiro: "Chiropractic",
  tcm: "TCM",
  wellness: "Wellness",
  retail: "Retail",
  other: "Other",
};

export interface ApplicationFields {
  companyName: string;
  uen: string;
  website: string;
  category: BusinessCategory;
  contactName: string;
  contactMobile: string;
  businessEmail: string;
  introPlan: string;
}

/** Ordered questionnaire fields + labels for the Staff review queue (#76). */
export const APPLICATION_FIELD_LABELS: Array<[keyof ApplicationFields, string]> = [
  ["companyName", "Company name"],
  ["uen", "ACRA UEN"],
  ["website", "Business website or social link"],
  ["category", "Business category"],
  ["contactName", "Contact person name"],
  ["contactMobile", "Contact mobile"],
  ["businessEmail", "Business email"],
  ["introPlan", "How they'll introduce Mpillow"],
];

export type ApplicationOutcome = "approved" | "rejected";

/**
 * PLAIN transactional copy for the approve/reject outcome emails (#76). Pure —
 * no interpolation of applicant-supplied data (only the site URL + a constant
 * support address), so no escaping is needed. The branded HTML base is #84's job.
 */
export function renderApplicationOutcomeEmail(
  outcome: ApplicationOutcome,
  opts: { partnerSignInUrl: string; supportEmail: string },
): { subject: string; text: string; html: string } {
  if (outcome === "approved") {
    return {
      subject: "You're approved — welcome to the Mpillow Partner programme",
      text: `Good news — your Mpillow Partner application has been approved.

Sign in to your Partner Hub to get started:
${opts.partnerSignInUrl}

Questions? Reply to this email or reach us at ${opts.supportEmail}.

— The Mpillow team`,
      html: `<p>Good news — your Mpillow Partner application has been approved.</p>
<p><a href="${opts.partnerSignInUrl}">Sign in to your Partner Hub</a> to get started.</p>
<p>Questions? Reply to this email or reach us at <a href="mailto:${opts.supportEmail}">${opts.supportEmail}</a>.</p>
<p>— The Mpillow team</p>`,
    };
  }
  return {
    subject: "An update on your Mpillow Partner application",
    text: `Thank you for your interest in the Mpillow Partner programme.

After reviewing your application, we're not able to move forward at this time.

If you think this was a mistake or your details have changed, reply to this email or contact us at ${opts.supportEmail}.

— The Mpillow team`,
    html: `<p>Thank you for your interest in the Mpillow Partner programme.</p>
<p>After reviewing your application, we're not able to move forward at this time.</p>
<p>If you think this was a mistake or your details have changed, reply to this email or contact us at <a href="mailto:${opts.supportEmail}">${opts.supportEmail}</a>.</p>
<p>— The Mpillow team</p>`,
  };
}

/**
 * Required checks + lenient format sanity (Staff eyeball verifies — no ACRA
 * API). Returns a field→message map; `{}` means valid.
 * - UEN: SG ACRA shapes are 9–10 alphanumerics (ROB `12345678A`, ROC
 *   `201812345A`, other-agency `T09LL0001B`); we only check that envelope.
 * - Mobile: reuses the appointments phone normalizer (SG 8-digit or +65…).
 */
export function validateApplication(
  fields: ApplicationFields,
): Partial<Record<keyof ApplicationFields, string>> {
  const errors: Partial<Record<keyof ApplicationFields, string>> = {};
  const require = (key: keyof ApplicationFields, message: string) => {
    if (!String(fields[key] ?? "").trim()) errors[key] = message;
  };

  require("companyName", "Company name is required");
  require("website", "Business website or social link is required");
  require("contactName", "Contact person name is required");
  require("introPlan", "Tell us how you'll introduce Mpillow to your clients");

  const uen = String(fields.uen ?? "").trim().toUpperCase();
  if (!uen) errors.uen = "ACRA UEN is required";
  else if (!/^[A-Z0-9]{9,10}$/.test(uen)) errors.uen = "Enter a valid ACRA UEN";

  if (!(BUSINESS_CATEGORIES as readonly string[]).includes(fields.category)) {
    errors.category = "Select a business category";
  }

  const mobile = String(fields.contactMobile ?? "").trim();
  if (!mobile) errors.contactMobile = "Contact mobile is required";
  else if (!isValidPhone(mobile)) {
    errors.contactMobile = "Enter a valid mobile number";
  }

  const email = String(fields.businessEmail ?? "").trim();
  if (!email) errors.businessEmail = "Business email is required";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.businessEmail = "Enter a valid email";
  }

  return errors;
}
