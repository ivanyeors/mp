/**
 * Send every message a guest can get from the utility sender to one phone, in
 * the order a guest would meet them, each preceded by a short label — so the
 * whole customer-facing copy can be read on a real phone before guests see it.
 *
 *   npx tsx --env-file=.env.local scripts/whatsapp-preview.ts +65XXXXXXXX
 *
 * The templates (day-before, morning-of, cancelled, confirmation) go anywhere.
 * Everything else is free text, which Meta only delivers inside the 24h window
 * the recipient's own last message opened: message the sender from that phone
 * first. Outside it the sends are still accepted, then fail silently (#131047).
 *
 * Sample data only — no booking is created or changed. But a tap on these is a
 * real reply: Confirm, Reschedule or a time acts on that phone's next upcoming
 * appointment, if it has one.
 */
import { getSiteSettings } from "@/lib/site-settings";
import {
  APPOINTMENT_SETTING_KEYS,
  DEFAULT_APPOINTMENT_SETTINGS,
  parseAppointmentSettings,
} from "@/lib/appointments/settings";
import { formatDateSgt, formatTimeSgt } from "@/lib/appointments/format";
import { guestText } from "@/lib/appointments/messages";
import { normalizePhone } from "@/lib/appointments/phone";
import { addSgtDays, sgtLocalToUtcMs, sgtParts, type SlotOffer } from "@/lib/appointments/slots";
import {
  sendCancelMessage,
  sendDayBeforeTemplate,
  sendMorningOfTemplate,
  sendSlotList,
  sendTemplateMessage,
  sendText,
} from "@/lib/appointments/whatsapp";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const to = normalizePhone(process.argv[2] ?? "");
  if (!to) {
    console.error("Pass the phone to preview on:\n  npx tsx --env-file=.env.local scripts/whatsapp-preview.ts +65XXXXXXXX");
    process.exit(2);
  }

  // Real rebook link and venue when the database is reachable; defaults if not.
  let settings = DEFAULT_APPOINTMENT_SETTINGS;
  try {
    settings = parseAppointmentSettings(await getSiteSettings([...APPOINTMENT_SETTING_KEYS]));
  } catch {
    console.log("(site settings unreachable — using defaults for the link and venue)");
  }

  // A sample visit tomorrow at 17:00 SGT, and three new times the day after.
  const now = sgtParts(Date.now());
  const day = (n: number, hour: number) => {
    const d = addSgtDays(now.y, now.m, now.d, n);
    return new Date(sgtLocalToUtcMs(d.y, d.m, d.d, hour, 0)).toISOString();
  };
  const startsAt = day(1, 17);
  const slots: SlotOffer[] = [10, 14, 16].map((h) => {
    const startIso = day(2, h);
    const endIso = new Date(Date.parse(startIso) + settings.durationMinutes * 60_000).toISOString();
    return { id: `slot_${startIso}`, startIso, endIso };
  });
  const guestName = "Test";
  const typeLabel = "Customisation";
  const bookingUrl = settings.customisationBookingUrl;

  const steps: Array<[label: string, send: () => Promise<unknown>]> = [
    ["Day-before reminder (template, with Confirm / Reschedule)", () =>
      sendDayBeforeTemplate(to, { guestName, dateLabel: formatDateSgt(startsAt), timeLabel: formatTimeSgt(startsAt), typeLabel })],
    ["Morning-of reminder (template), if they did not reply", () =>
      sendMorningOfTemplate(to, { guestName, dateLabel: formatDateSgt(startsAt), timeLabel: formatTimeSgt(startsAt), venue: settings.venue })],
    ["They tap Confirm", () => sendText(to, guestText.confirmed(guestName, startsAt))],
    ["They tap Confirm again", () => sendText(to, guestText.alreadyConfirmed(startsAt))],
    ["They tap Reschedule: the list of times", () => sendSlotList(to, slots)],
    ["…followed by", () => sendText(to, guestText.slotListNone())],
    ["They type something else while the list is open", () => sendText(to, guestText.slotHint())],
    ["They pick a time", () => sendText(to, guestText.rescheduled(slots[0]!.startIso))],
    ["The time they picked was just taken", () => sendText(to, guestText.slotTaken())],
    ["They pick from a list that has closed", () => sendText(to, guestText.listClosed(startsAt))],
    ["No free times in the next two weeks", () => sendText(to, guestText.noSlots(startsAt))],
    ['They reply "cancel" or "none of these" (free text, within 24h of their message)', () =>
      sendText(to, guestText.cancelled({ guestName, typeLabel, startsAt, bookingUrl }))],
    ["Cancelled when they have not messaged in 24h (template)", () =>
      sendCancelMessage(to, { guestName, typeLabel, startsAt, bookingUrl }, { within24h: false })],
    ['"none of these" when no list is open', () => sendText(to, guestText.stillOn(startsAt))],
    ["Any other message (once per 12 hours)", () => sendText(to, guestText.autoReply())],
    ["A tap or command with no upcoming appointment", () => sendText(to, guestText.noUpcoming())],
    ["Cancelling failed on our side", () => sendText(to, guestText.cancelFailed())],
  ];
  const confirmTemplate = process.env.WHATSAPP_TEMPLATE_CONFIRM?.trim();
  if (confirmTemplate) {
    steps.unshift(["Booking confirmation (template)", () =>
      sendTemplateMessage(to, confirmTemplate, [guestName, formatDateSgt(startsAt), formatTimeSgt(startsAt), typeLabel])]);
  }

  let failed = 0;
  for (const [i, [label, send]] of steps.entries()) {
    const tag = `${i + 1}/${steps.length} ${label}`;
    try {
      await sendText(to, `[Preview ${tag}]`);
      await pause(1200);
      await send();
      console.log(`✓ ${tag}`);
    } catch (e) {
      failed += 1;
      console.log(`✗ ${tag}: ${e instanceof Error ? e.message : e}`);
    }
    // Spaced out so they land in order.
    await pause(1800);
  }
  console.log(
    failed
      ? `\n${failed} send(s) failed (above).`
      : "\nAll accepted. Nothing on the phone? Message the sender from it first — free text needs that 24h window.",
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
