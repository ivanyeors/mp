import { formatWhatsAppDisplay } from "@/lib/contact";
import { sgtParts } from "@/lib/appointments/slots";

export const AFTERCARE_PREFERENCES = ["aftercare_email", "aftercare_whatsapp"] as const;
export type AftercarePreference = (typeof AFTERCARE_PREFERENCES)[number];

export type PreferenceSource = "profile" | "staff";

export const PREFERENCE_NOTE_MAX = 300;

export type PreferenceEvent = {
  preference: AftercarePreference;
  toValue: boolean;
  source: PreferenceSource;
  profileName: string | null;
  note: string | null;
  wording: string | null;
  createdAt: string;
};

export type AftercareView = {
  email: { on: boolean; last: PreferenceEvent | null };
  whatsapp: {
    on: boolean;
    last: PreferenceEvent | null;
    stopRequestedAt: string | null;
    marketingOff: boolean;
  };
  history: PreferenceEvent[];
};

export const AFTERCARE_EMAIL_LABEL = "Emails after a purchase";

export function aftercareWhatsAppWording(mobile: string): string {
  return `Mpillow may WhatsApp me at ${mobile} with a review request after delivery and, for a Premium Mpillow, a yearly reminder about a paid re-adjustment visit. I can turn this off here at any time.`;
}

export const AFTERCARE_EMAIL_FOOTER =
  "You're getting this because you bought from Mpillow. To stop these emails, turn them off in your account, or reply to this email and we'll do it for you.";

export function mobileForWording(e164: string): string {
  return formatWhatsAppDisplay(e164.replace(/\D/g, ""));
}

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

export function isStopRequestOpen(input: {
  whatsappOn: boolean;
  latestStopAt: string | null | undefined;
  latestWhatsAppChangeAt: string | null | undefined;
}): boolean {
  if (!input.whatsappOn) return false;
  const stop = ms(input.latestStopAt);
  if (!Number.isFinite(stop)) return false;
  const change = ms(input.latestWhatsAppChangeAt);
  return !Number.isFinite(change) || stop > change;
}

export function shortDateSgt(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const p = sgtParts(t);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${p.d} ${months[p.m - 1]}`;
}

export function changedBy(event: Pick<PreferenceEvent, "source" | "profileName">): string {
  if (event.source === "profile") return "the customer in their Profile";
  return event.profileName?.trim() || "Staff";
}

export function describeSwitch(
  preference: AftercarePreference,
  on: boolean,
  last: PreferenceEvent | null,
): string {
  if (!last) {
    return preference === "aftercare_email" ? "On by default." : "Off until the customer opts in.";
  }
  const state = on ? "On" : "Off";
  const verb = last.toValue ? "on" : "off";
  const note = last.note?.trim() ? `: ${last.note.trim().replace(/[.\s]+$/, "")}` : "";
  return `${state} since ${shortDateSgt(last.createdAt)}: switched ${verb} by ${changedBy(last)}${note}.`;
}

export function describeStopRequest(stopRequestedAt: string): string {
  return `Asked to stop on WhatsApp, ${shortDateSgt(stopRequestedAt)}`;
}

export const WHATSAPP_MARKETING_OFF_NOTICE = "Turned off marketing messages in WhatsApp";
