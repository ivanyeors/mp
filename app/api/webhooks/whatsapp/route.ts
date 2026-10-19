import { NextResponse } from "next/server";
import { getSiteSettings } from "@/lib/site-settings";
import { markReadjustmentCancelledByEvent, moveReadjustmentByEvent } from "@/lib/readjustment/lifecycle";
import {
  APPOINTMENT_SETTING_KEYS,
  parseAppointmentSettings,
  type AppointmentSettings,
} from "@/lib/appointments/settings";
import { liveSlotHolds } from "@/lib/appointments/book-slot";
import {
  deleteEvent,
  freeBusy,
  patchEventTimes,
} from "@/lib/appointments/calendar";
import {
  addSgtDays,
  offerSlots,
  sgtLocalToUtcMs,
  sgtParts,
  type SlotOffer,
} from "@/lib/appointments/slots";
import { transitionReminder } from "@/lib/appointments/state";
import { formatDateSgt, formatTimeSgt } from "@/lib/appointments/format";
import {
  claimAutoReply,
  getOpenReminderByPhone,
  updateReminder,
} from "@/lib/appointments/reminders-db";
import {
  parseInboundActions,
  sendCancelMessage,
  sendSlotList,
  sendText,
  verifyWebhookChallenge,
  verifyWhatsAppSignature,
  withinServiceWindow,
} from "@/lib/appointments/whatsapp";
import { resolveAppointmentType } from "@/lib/appointments/type";
import { SUPPORT_WHATSAPP_DISPLAY, SUPPORT_WHATSAPP_URL } from "@/lib/contact";

// The sender is an automated Cloud API line: no person reads what guests type
// to it. Anything that needs a human points at the staffed sales line instead.
const TALK_TO_TEAM = `message our team on WhatsApp at ${SUPPORT_WHATSAPP_DISPLAY}: ${SUPPORT_WHATSAPP_URL}`;

/** One auto-reply per phone per window, however many messages it sends. */
const AUTO_REPLY_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const challenge = verifyWebhookChallenge({
    mode: url.searchParams.get("hub.mode"),
    token: url.searchParams.get("hub.verify_token"),
    challenge: url.searchParams.get("hub.challenge"),
  });
  if (challenge == null) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!verifyWhatsAppSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  const actions = parseInboundActions(
    payload,
    process.env.WHATSAPP_PHONE_NUMBER_ID?.trim(),
  );
  if (actions.length === 0) return NextResponse.json({ ok: true });

  const stored = await getSiteSettings([...APPOINTMENT_SETTING_KEYS]);
  const settings = parseAppointmentSettings(stored);

  // Admin kill switch (Settings → Appointments). Ack so Meta stops retrying,
  // but neither reply nor mutate the reminder while notifications are off.
  if (!settings.whatsappEnabled) {
    return NextResponse.json({ ok: true, disabled: true });
  }

  // Always 200 to Meta after signature ok — process best-effort.
  for (const action of actions) {
    try {
      await handleAction(action, settings);
    } catch (e) {
      console.error(
        "[whatsapp/webhook]",
        action.kind,
        e instanceof Error ? e.message : e,
      );
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleAction(
  action: ReturnType<typeof parseInboundActions>[number],
  settings: AppointmentSettings,
): Promise<void> {
  if (action.kind === "unknown") {
    // Free text, a photo, a voice note: nothing here can act on it, and nobody
    // will see it. Say so and point at the staffed line, so the guest is not
    // left waiting on an answer that never comes. The inbound message opens the
    // 24h service window, so free text is allowed.
    if (await claimAutoReply(action.fromE164, AUTO_REPLY_COOLDOWN_MS)) {
      await sendText(
        action.fromE164,
        `Hi! This number only sends automated appointment messages, so no one here will see your reply. To chat with us, ${TALK_TO_TEAM}`,
      );
    }
    return;
  }

  const row = await getOpenReminderByPhone(action.fromE164);
  if (!row) {
    // A real intent (confirm/reschedule/cancel) with no open reminder — already
    // confirmed/cancelled, or booked but not yet reminded. The inbound message
    // opens the 24h service window, so a free-text reply is allowed; don't drop
    // it silently (only unknown chatter returned earlier reaches this quietly).
    await sendText(
      action.fromE164,
      `Thanks for your message. To change or cancel your appointment, ${TALK_TO_TEAM}`,
    );
    return;
  }

  if (action.kind === "confirm") {
    const t = transitionReminder(row.status, { type: "confirm" });
    if (!t.ok || t.noop) return;
    const ok = await updateReminder(
      row.calendar_event_id,
      { status: "confirmed" },
      row.status,
    );
    if (!ok) return;
    await sendText(
      row.phone,
      `Thanks ${row.guest_name} — your appointment is confirmed for ${formatDateSgt(row.starts_at)} at ${formatTimeSgt(row.starts_at)}.`,
    );
    return;
  }

  if (action.kind === "reschedule") {
    const t = transitionReminder(row.status, { type: "request_reschedule" });
    if (!t.ok) return;

    const now = new Date();
    const p = sgtParts(now.getTime());
    const endDay = addSgtDays(p.y, p.m, p.d, settings.slotLookaheadDays + 1);
    const timeMin = now.toISOString();
    const timeMax = new Date(
      sgtLocalToUtcMs(endDay.y, endDay.m, endDay.d, 0, 0),
    ).toISOString();

    // A slot someone is paying for (re-adjustment Checkout open) is not on the
    // calendar yet but is taken all the same (ADR 0024).
    const [calendarBusy, holds] = await Promise.all([
      freeBusy(timeMin, timeMax),
      liveSlotHolds(timeMin, timeMax),
    ]);
    const slots = offerSlots([...calendarBusy, ...holds], settings, now);

    if (slots.length === 0) {
      await sendText(
        row.phone,
        `Sorry — no open slots in the next two weeks. To find another time, ${TALK_TO_TEAM}`,
      );
      return;
    }

    // Append a reject row via text instruction (list has no native reject).
    const waId = await sendSlotList(row.phone, slots);
    await sendText(
      row.phone,
      'Reply "none of these" if none of the times work — we will cancel and send a rebook link.',
    );

    await updateReminder(
      row.calendar_event_id,
      {
        status: "offering_slots",
        offered_slots: slots,
        last_wa_id: waId,
        last_outbound_at: now.toISOString(),
      },
      row.status,
    );
    return;
  }

  if (action.kind === "slot") {
    const t = transitionReminder(row.status, { type: "slot_picked" });
    if (!t.ok) return;

    const offered = (row.offered_slots ?? []) as SlotOffer[];
    const picked =
      offered.find((s) => s.id === action.slotId) ??
      parseSlotId(action.slotId, settings.durationMinutes);
    if (!picked) {
      await sendText(row.phone, "That slot is no longer available. Tap Reschedule again.");
      return;
    }

    await patchEventTimes(row.calendar_event_id, picked.startIso, picked.endIso);
    // A Re-adjustment booking's times follow its event (ADR 0024).
    await moveReadjustmentByEvent(row.calendar_event_id, picked.startIso, picked.endIso);

    const ok = await updateReminder(
      row.calendar_event_id,
      {
        status: "rescheduled",
        starts_at: picked.startIso,
        last_outbound_at: new Date().toISOString(),
      },
      "offering_slots",
    );
    if (!ok) return;

    await sendText(
      row.phone,
      `Done — your appointment is now ${formatDateSgt(picked.startIso)} at ${formatTimeSgt(picked.startIso)} (Asia/Singapore). See you then!`,
    );
    return;
  }

  if (action.kind === "reject_slots") {
    const t = transitionReminder(row.status, { type: "slots_rejected" });
    if (!t.ok) return;

    await deleteEvent(row.calendar_event_id);
    // The visit is gone: a complimentary Re-adjustment gives its free visit back.
    await markReadjustmentCancelledByEvent(row.calendar_event_id);

    const resolved = resolveAppointmentType(
      row.appointment_type === "readjustment"
        ? settings.readjustmentSummaryMatch
        : settings.customisationSummaryMatch,
      settings,
    );
    // Prefer stored type for URL
    const bookingUrl =
      row.appointment_type === "readjustment"
        ? settings.readjustmentBookingUrl
        : settings.customisationBookingUrl;
    const typeLabel =
      row.appointment_type === "readjustment" ? "Re-adjustment" : "Customisation";

    const waId = await sendCancelMessage(row.phone, {
      bookingUrl,
      typeLabel: typeLabel || resolved.label,
      within24h: withinServiceWindow(row.last_outbound_at),
    });

    await updateReminder(
      row.calendar_event_id,
      {
        status: "cancelled",
        last_wa_id: waId,
        last_outbound_at: new Date().toISOString(),
      },
      "offering_slots",
    );
  }
}

function parseSlotId(
  slotId: string,
  durationMinutes: number,
): SlotOffer | null {
  if (!slotId.startsWith("slot_")) return null;
  const startIso = slotId.slice("slot_".length);
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return null;
  const endIso = new Date(startMs + durationMinutes * 60 * 1000).toISOString();
  return { id: slotId, startIso, endIso };
}
