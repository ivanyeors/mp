/**
 * Aftercare preferences (PRD customer-crm slice 13, ADR 0027 decision l): the
 * types, the approved copy and the pure rules. No IO, so the Profile, the Admin
 * Panel card and the server share one definition. The reads and the one write
 * path are in ./preferences.
 */

import { formatWhatsAppDisplay } from "@/lib/contact";
import { sgtParts } from "@/lib/appointments/slots";

export const AFTERCARE_PREFERENCES = ["aftercare_email", "aftercare_whatsapp"] as const;
export type AftercarePreference = (typeof AFTERCARE_PREFERENCES)[number];

/** Who made a change: the customer in their Profile, or Staff with the switch. */
export type PreferenceSource = "profile" | "staff";

/** A Staff note on a change is at most this long (the table's check). */
export const PREFERENCE_NOTE_MAX = 300;

/** One `customer_preference_events` row, as the Admin Panel shows it. */
export type PreferenceEvent = {
  preference: AftercarePreference;
  toValue: boolean;
  source: PreferenceSource;
  /** The Staff profile that made it, when Staff did and chose who they are. */
  profileName: string | null;
  note: string | null;
  /** The opt-in text the customer saw, when they turned WhatsApp on. */
  wording: string | null;
  createdAt: string;
};

/** What the Customer page's Aftercare switches show. */
export type AftercareView = {
  email: { on: boolean; last: PreferenceEvent | null };
  whatsapp: {
    on: boolean;
    last: PreferenceEvent | null;
    /** When an open STOP request was sent, or null when there is none. */
    stopRequestedAt: string | null;
    /** The latest WhatsApp send failed with 131050: their WhatsApp setting, not ours. */
    marketingOff: boolean;
  };
  /** Every change, newest first. */
  history: PreferenceEvent[];
};

// ─── Approved copy (owner, 2026-10-20) ───────────────────────────────────────

/** The Profile's email toggle. */
export const AFTERCARE_EMAIL_LABEL = "Emails after a purchase";

/**
 * The Profile's WhatsApp toggle, word for word. It states exactly what the
 * customer agrees to, and the text with their number in it is stored on the
 * event as the evidence of consent. It names the paid check-up, which is what
 * lets the check-up go by WhatsApp (a "specified message" under the PDPA's Do
 * Not Call rules).
 */
export function aftercareWhatsAppWording(mobile: string): string {
  return `Mpillow may WhatsApp me at ${mobile} with a review request after delivery and, for a Premium Mpillow, a yearly reminder about a paid re-adjustment visit. I can turn this off here at any time.`;
}

/**
 * The aftercare emails' footer (slices 07 and 08). The reply line is what the
 * Spam Control Act asks for: an address the person can unsubscribe through,
 * handled with Staff's switch within 10 business days.
 */
export const AFTERCARE_EMAIL_FOOTER =
  "You're getting this because you bought from Mpillow. To stop these emails, turn them off in your account, or reply to this email and we'll do it for you.";

/** "+65 9123 4567" for an E.164 number, the way the opt-in wording shows it. */
export function mobileForWording(e164: string): string {
  return formatWhatsAppDisplay(e164.replace(/\D/g, ""));
}

// ─── Rules ───────────────────────────────────────────────────────────────────

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

/**
 * Whether a Customer has an open STOP request: the latest `stop` message from
 * their number is newer than their latest WhatsApp preference change. Derived,
 * never stored. Any later change closes it: Staff switching WhatsApp off, or
 * the customer choosing in their Profile. While it is open, aftercare WhatsApp
 * skips them (`stop_requested`).
 *
 * With WhatsApp already off there is nothing to stop and nothing Staff could
 * change (switching it off again writes no event), so it is not open.
 */
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

/** "20 Oct", a day in Singapore. */
export function shortDateSgt(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const p = sgtParts(t);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${p.d} ${months[p.m - 1]}`;
}

/** Who made a change, in the switch's status line. */
export function changedBy(event: Pick<PreferenceEvent, "source" | "profileName">): string {
  if (event.source === "profile") return "the customer in their Profile";
  return event.profileName?.trim() || "Staff";
}

/**
 * A switch's status line, e.g. "Off since 20 Oct: switched off by Mei: asked
 * on WhatsApp." With no change yet, the default it is on.
 */
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

/** The notice beside the WhatsApp switch while a STOP request is open. */
export function describeStopRequest(stopRequestedAt: string): string {
  return `Asked to stop on WhatsApp, ${shortDateSgt(stopRequestedAt)}`;
}

/** Shown when WhatsApp refused a send because they turned marketing messages off. */
export const WHATSAPP_MARKETING_OFF_NOTICE = "Turned off marketing messages in WhatsApp";
