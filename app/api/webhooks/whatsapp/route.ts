import { NextResponse } from "next/server";
import { getSiteSettings } from "@/lib/site-settings";
import { moveReadjustmentByEvent } from "@/lib/readjustment/lifecycle";
import {
  APPOINTMENT_SETTING_KEYS,
  parseAppointmentSettings,
  type AppointmentSettings,
} from "@/lib/appointments/settings";
import { isSlotFree, liveSlotHolds } from "@/lib/appointments/book-slot";
import { freeBusy, patchEventTimes } from "@/lib/appointments/calendar";
import { cancelAppointment } from "@/lib/appointments/cancel";
import {
  addSgtDays,
  offerSlots,
  sgtLocalToUtcMs,
  sgtParts,
  type SlotOffer,
} from "@/lib/appointments/slots";
import { transitionReminder } from "@/lib/appointments/state";
import { guestText } from "@/lib/appointments/messages";
import {
  claimAutoReply,
  claimInboundMessage,
  getOpenReminderByPhone,
  recordDeliveryFailure,
  recordInboundOutcome,
  updateReminder,
  type ReminderRow,
} from "@/lib/appointments/reminders-db";
import {
  askBeforeCancel,
  parseFailedDeliveries,
  parseInboundActions,
  sendSlotList,
  sendText,
  verifyWebhookChallenge,
  verifyWhatsAppSignature,
} from "@/lib/appointments/whatsapp";
import {
  latestAftercareSentAt,
  recordAftercareDeliveryFailure,
} from "@/lib/whatsapp/aftercare-notify";

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
  const signature = req.headers.get("x-hub-signature-256");
  if (!verifyWhatsAppSignature(rawBody, signature)) {
    console.warn(
      "[whatsapp/webhook] signature rejected",
      signature ? "(signed with another secret)" : "(unsigned)",
    );
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();

  for (const f of parseFailedDeliveries(payload, phoneNumberId)) {
    console.error("[whatsapp/webhook] delivery failed", f.recipient, f.reason);
    try {
      await recordDeliveryFailure(f.waId, f.reason);
    } catch (e) {
      console.error("[whatsapp/webhook] record failure", e instanceof Error ? e.message : e);
    }
    try {
      await recordAftercareDeliveryFailure(f.waId, f.reason);
    } catch (e) {
      console.error("[whatsapp/webhook] record aftercare failure", e instanceof Error ? e.message : e);
    }
  }

  const actions = parseInboundActions(payload, phoneNumberId);
  if (actions.length === 0) return NextResponse.json({ ok: true });

  const stored = await getSiteSettings([...APPOINTMENT_SETTING_KEYS]);
  const settings = parseAppointmentSettings(stored);

  for (const action of actions) {
    let fresh = true;
    try {
      fresh = await claimInboundMessage(action.messageId, action.fromE164, action.kind);
    } catch (e) {
      console.error("[whatsapp/webhook] claim", e instanceof Error ? e.message : e);
    }
    if (!fresh) continue;

    if (!settings.whatsappEnabled) {
      await recordInboundOutcome(action.messageId, "notifications off").catch(() => {});
      continue;
    }

    let outcome: string;
    try {
      outcome = await handleAction(action, settings);
    } catch (e) {
      outcome = `error: ${e instanceof Error ? e.message : String(e)}`;
      console.error("[whatsapp/webhook]", action.kind, outcome);
    }
    await recordInboundOutcome(action.messageId, outcome).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

async function handleAction(
  action: ReturnType<typeof parseInboundActions>[number],
  settings: AppointmentSettings,
): Promise<string> {
  const from = action.fromE164;

  if (action.kind === "stop") {
    await sendText(from, guestText.stopReply());
    return "stop: replied";
  }

  const row = await getOpenReminderByPhone(from);

  if (action.kind === "unknown") {
    if (row?.status === "offering_slots") {
      await sendText(from, guestText.slotHint());
      return "unknown: slot hint";
    }
    if (!(await claimAutoReply(from, AUTO_REPLY_COOLDOWN_MS))) {
      return "unknown: auto-reply cooling down";
    }
    await sendText(from, guestText.autoReply());
    return "unknown: auto-reply";
  }

  if (!row) {
    await sendText(from, guestText.noUpcoming());
    return `${action.kind}: no upcoming appointment`;
  }

  if (action.kind === "confirm") return confirm(row);
  if (action.kind === "reschedule") return offerNewTimes(row, settings);
  if (action.kind === "slot") return pickSlot(row, action.slotId, settings);

  if (action.kind === "reject_slots" && row.status !== "offering_slots") {
    await sendText(from, guestText.stillOn(row.starts_at));
    return "reject_slots: no list open";
  }

  if (action.kind === "cancel" && action.bare) {
    let ask: boolean;
    try {
      ask = askBeforeCancel({
        bare: true,
        lastAftercareSentAt: await latestAftercareSentAt(from),
        reminderLastOutboundAt: row.last_outbound_at,
      });
    } catch (e) {
      console.error("[whatsapp/webhook] aftercare lookup", e instanceof Error ? e.message : e);
      ask = true;
    }
    if (ask) {
      await sendText(from, guestText.cancelQuestion(row.starts_at));
      return "cancel: asked first (aftercare since the reminder)";
    }
  }
  return cancelByGuest(row, settings);
}

async function confirm(row: ReminderRow): Promise<string> {
  const t = transitionReminder(row.status, { type: "confirm" });
  if (t.ok && t.noop) {
    await sendText(row.phone, guestText.alreadyConfirmed(row.starts_at));
    return "confirm: already confirmed";
  }
  if (!t.ok) {
    await sendText(row.phone, guestText.cannotConfirm(row.starts_at));
    return `confirm: ${t.error}`;
  }
  if (!(await updateReminder(row.calendar_event_id, { status: "confirmed" }, row.status))) {
    return "confirm: row changed underneath";
  }
  await sendText(row.phone, guestText.confirmed(row.guest_name, row.starts_at));
  return "confirmed";
}

async function offerNewTimes(row: ReminderRow, settings: AppointmentSettings): Promise<string> {
  const t = transitionReminder(row.status, { type: "request_reschedule" });
  if (!t.ok) {
    await sendText(row.phone, guestText.cannotReschedule());
    return `reschedule: ${t.error}`;
  }

  const now = new Date();
  const p = sgtParts(now.getTime());
  const endDay = addSgtDays(p.y, p.m, p.d, settings.slotLookaheadDays + 1);
  const timeMin = now.toISOString();
  const timeMax = new Date(
    sgtLocalToUtcMs(endDay.y, endDay.m, endDay.d, 0, 0),
  ).toISOString();

  const [calendarBusy, holds] = await Promise.all([
    freeBusy(timeMin, timeMax),
    liveSlotHolds(timeMin, timeMax),
  ]);
  const slots = offerSlots([...calendarBusy, ...holds], settings, now);

  if (slots.length === 0) {
    await sendText(row.phone, guestText.noSlots(row.starts_at));
    return "reschedule: no slots";
  }

  const waId = await sendSlotList(row.phone, slots);
  await sendText(row.phone, guestText.slotListNone());

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
  return "offered slots";
}

async function pickSlot(
  row: ReminderRow,
  slotId: string,
  settings: AppointmentSettings,
): Promise<string> {
  const t = transitionReminder(row.status, { type: "slot_picked" });
  if (!t.ok || t.noop) {
    await sendText(row.phone, guestText.listClosed(row.starts_at));
    return `slot: ${t.error ?? "already rescheduled"}`;
  }

  const offered = (row.offered_slots ?? []) as SlotOffer[];
  const picked =
    offered.find((s) => s.id === slotId) ??
    parseSlotId(slotId, settings.durationMinutes);
  if (!picked || !(await isSlotFree(picked.startIso, picked.endIso))) {
    await sendText(row.phone, guestText.slotTaken());
    return "slot: taken";
  }

  await patchEventTimes(row.calendar_event_id, picked.startIso, picked.endIso);
  await moveReadjustmentByEvent(row.calendar_event_id, picked.startIso, picked.endIso);

  const ok = await updateReminder(
    row.calendar_event_id,
    {
      status: "rescheduled",
      starts_at: picked.startIso,
      offered_slots: null,
      last_outbound_at: new Date().toISOString(),
    },
    "offering_slots",
  );
  if (!ok) return "slot: row changed underneath";

  await sendText(row.phone, guestText.rescheduled(picked.startIso));
  return "rescheduled";
}

async function cancelByGuest(row: ReminderRow, settings: AppointmentSettings): Promise<string> {
  try {
    const outcome = await cancelAppointment(row, settings, { cause: "guest", within24h: true });
    return outcome.kind === "cancelled" ? "cancelled" : `cancel: ${outcome.kind}`;
  } catch (e) {
    await sendText(row.phone, guestText.cancelFailed()).catch(() => {});
    throw e;
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
