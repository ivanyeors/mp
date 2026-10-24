/**
 * Every free-text message a guest can get from the utility sender, in one
 * place: the webhook and the cancel path send these, and
 * scripts/whatsapp-preview.ts sends each one to a phone so the copy can be read
 * the way a guest reads it. The approved templates (day-before, morning-of,
 * cancelled, confirmation) live on Meta; their wording is in
 * scripts/whatsapp-create-templates.ts, and the two aftercare templates' in
 * lib/whatsapp/aftercare-templates.ts.
 *
 * Free text only reaches a guest inside the 24h window their own last message
 * opened — see withinServiceWindow in ./whatsapp.
 */

import { SUPPORT_WHATSAPP_DISPLAY } from "@/lib/contact";
import { formatDateSgt, formatTimeSgt } from "./format";

/**
 * The sender is an automated Cloud API line: no person reads what guests type
 * to it. Anything that needs a human points at the staffed sales line instead.
 * The bare number is enough: WhatsApp underlines it and a tap offers "Chat
 * with" it. WhatsApp text has no link-with-label, so a wa.me URL beside it
 * only repeats the number.
 */
export const TALK_TO_TEAM = `message our team on WhatsApp at ${SUPPORT_WHATSAPP_DISPLAY}`;

/** "Tue 20 Oct 2026 at 17:00" (SGT). */
export const whenLabel = (iso: string) => `${formatDateSgt(iso)} at ${formatTimeSgt(iso)}`;

/**
 * Copy approved by the owner word for word (CRM slice 13, 2026-10-20): the
 * auto-reply, the stop reply and the cancel question. Changing any of it needs
 * the owner again.
 */
export const guestText = {
  /**
   * Anything the line cannot act on: chatter, photos, voice notes. The line
   * sends aftercare messages too, so it no longer says "appointment messages".
   */
  autoReply: () =>
    `Hi! This number only sends automated messages from Mpillow, so no one here will see your reply. Please ${TALK_TO_TEAM}.`,
  /**
   * A "stop" reply. Sent every time, with no cooldown. It switches nothing
   * off: Staff see it as an open request, and the customer can do it in their
   * Profile.
   */
  stopReply: () =>
    "Thanks, we'll switch off aftercare messages for you. You can also turn them off yourself in your Mpillow account.",
  /** A bare "cancel" right after an aftercare message: ask, do not cancel. */
  cancelQuestion: (startsAt: string) =>
    `Do you want to cancel your appointment on ${whenLabel(startsAt)}? Reply "cancel appointment" to cancel it. To stop aftercare messages, reply "stop".`,
  /** Chatter while a list of new times is open. */
  slotHint: () =>
    `To move your appointment, tap "View times" above and pick one, or reply "none of these" to cancel it. For anything else, please ${TALK_TO_TEAM}.`,
  /** A tap or "confirm" / "cancel" with nothing upcoming to apply it to. */
  noUpcoming: () =>
    `Thanks for your message. We couldn't find an upcoming appointment for this number. To book or change one, please ${TALK_TO_TEAM}.`,
  confirmed: (guestName: string, startsAt: string) =>
    `Thanks ${guestName} — your appointment is confirmed for ${whenLabel(startsAt)}.`,
  alreadyConfirmed: (startsAt: string) =>
    `You're all set — your appointment is confirmed for ${whenLabel(startsAt)}.`,
  cannotConfirm: (startsAt: string) =>
    `Thanks! Your appointment is on ${whenLabel(startsAt)}. To change it, please ${TALK_TO_TEAM}.`,
  cannotReschedule: () => `To change your appointment, please ${TALK_TO_TEAM}.`,
  noSlots: (startsAt: string) =>
    `Sorry — there are no open times in the next two weeks, so your appointment on ${whenLabel(startsAt)} is unchanged. To find another time, please ${TALK_TO_TEAM}.`,
  /** Body of the interactive list of new times. */
  slotListBody: () => "Please pick a new appointment time:",
  /** Sent right after the list, which has no native "none" row. */
  slotListNone: () =>
    'Reply "none of these" if none of the times work — we will cancel and send a rebook link.',
  listClosed: (startsAt: string) =>
    `That list of times has closed — your appointment is still on ${whenLabel(startsAt)}. Tap Reschedule on our reminder for fresh times. For anything else, please ${TALK_TO_TEAM}.`,
  slotTaken: () => "Sorry — that time was just taken. Reply Reschedule for fresh times.",
  rescheduled: (startsAt: string) =>
    `Done — your appointment is now ${whenLabel(startsAt)} (Asia/Singapore). See you then!`,
  /** "none of these" with no list open. */
  stillOn: (startsAt: string) =>
    `Your appointment is still on for ${whenLabel(startsAt)}. To change it, tap Reschedule on our reminder. For anything else, please ${TALK_TO_TEAM}.`,
  cancelled: (p: { guestName: string; typeLabel: string; startsAt: string; bookingUrl: string }) =>
    [
      `Hi ${p.guestName}, your ${p.typeLabel} appointment on ${whenLabel(p.startsAt)} has been cancelled.`,
      `You can rebook here: ${p.bookingUrl}`,
      `If you have any questions, please ${TALK_TO_TEAM}.`,
    ].join("\n\n"),
  cancelFailed: () => `Sorry — we couldn't cancel that automatically. Please ${TALK_TO_TEAM}.`,
};
