import { SUPPORT_WHATSAPP_DISPLAY } from "@/lib/contact";
import { formatDateSgt, formatTimeSgt } from "./format";

export const TALK_TO_TEAM = `message our team on WhatsApp at ${SUPPORT_WHATSAPP_DISPLAY}`;

export const CANCEL_ANYWAY_BUTTON = "Cancel anyway";

export const whenLabel = (iso: string) => `${formatDateSgt(iso)} at ${formatTimeSgt(iso)}`;

export const guestText = {
  autoReply: () =>
    `Hi! This number only sends automated messages from Mpillow, so no one here will see your reply. Please ${TALK_TO_TEAM}.`,
  stopReply: () =>
    "Thanks, we'll switch off aftercare messages for you. You can also turn them off yourself in your Mpillow account.",
  cancelQuestion: (startsAt: string) =>
    `Do you want to cancel your appointment on ${whenLabel(startsAt)}? Reply "cancel appointment" to cancel it. To stop aftercare messages, reply "stop".`,
  visitDayCancelQuestion: (startsAt: string, fee: { amount: number; currency: string }) =>
    [
      `Your appointment is today at ${formatTimeSgt(startsAt)}. Cancellations on the day of the visit are refunded manually only, so if you cancel now, your ${fee.currency} ${fee.amount.toFixed(2)} fee won't be refunded automatically. Our team will review it and let you know.`,
      `Tap "${CANCEL_ANYWAY_BUTTON}" to cancel. To keep your appointment, you don't need to do anything.`,
    ].join("\n\n"),
  slotHint: () =>
    `To move your appointment, tap "View times" above and pick one, or reply "none of these" to cancel it. For anything else, please ${TALK_TO_TEAM}.`,
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
  slotListBody: () => "Please pick a new appointment time:",
  slotListNone: () =>
    'Reply "none of these" if none of the times work — we will cancel and send a rebook link.',
  listClosed: (startsAt: string) =>
    `That list of times has closed — your appointment is still on ${whenLabel(startsAt)}. Tap Reschedule on our reminder for fresh times. For anything else, please ${TALK_TO_TEAM}.`,
  slotTaken: () => "Sorry — that time was just taken. Reply Reschedule for fresh times.",
  rescheduled: (startsAt: string) =>
    `Done — your appointment is now ${whenLabel(startsAt)} (Asia/Singapore). See you then!`,
  stillOn: (startsAt: string) =>
    `Your appointment is still on for ${whenLabel(startsAt)}. To change it, tap Reschedule on our reminder. For anything else, please ${TALK_TO_TEAM}.`,
  cancelled: (p: {
    guestName: string;
    typeLabel: string;
    startsAt: string;
    bookingUrl: string;
    mentionRefundTime?: boolean;
  }) =>
    [
      `Hi ${p.guestName}, your ${p.typeLabel} appointment on ${whenLabel(p.startsAt)} has been cancelled.`,
      `You can rebook here: ${p.bookingUrl}`,
      `If you have any questions, please ${TALK_TO_TEAM}.`,
      ...(p.mentionRefundTime ? ["If your fee is refunded, please expect it to take 5–10 business days to be processed."] : []),
    ].join("\n\n"),
  cancelFailed: () => `Sorry — we couldn't cancel that automatically. Please ${TALK_TO_TEAM}.`,
};
