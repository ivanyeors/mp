import { isValidPhone } from "@/lib/appointments/phone";

export const AGREEMENT_VERSION = "2026-07-28";

export type ApplicationStatus = "pending" | "approved" | "rejected";

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

export function canWithdrawApplication(
  status: ApplicationStatus,
  partnerId: string | null | undefined,
): boolean {
  return status === "pending" && !partnerId;
}

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
  description: string;
  logoUrl?: string | null;
}

export const DESCRIPTION_MAX = 4000;

export const APPLICATION_FIELD_LABELS: Array<[Exclude<keyof ApplicationFields, "logoUrl">, string]> = [
  ["companyName", "Company name"],
  ["uen", "ACRA UEN"],
  ["website", "Business website or social link"],
  ["category", "Business category"],
  ["contactName", "Contact person name"],
  ["contactMobile", "Contact mobile"],
  ["businessEmail", "Business email"],
  ["introPlan", "How they'll introduce Mpillow"],
  ["description", "Public write-up"],
];

export type ApplicationOutcome = "approved" | "rejected";

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
  require("description", "Tell customers what your practice does");
  if (String(fields.description ?? "").trim().length > DESCRIPTION_MAX) {
    errors.description = `Keep it under ${DESCRIPTION_MAX} characters`;
  }

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
