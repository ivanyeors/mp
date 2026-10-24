import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { deleteEvent } from "@/lib/appointments/calendar";
import { cancelAppointment } from "@/lib/appointments/cancel";
import { getReminderByEventId } from "@/lib/appointments/reminders-db";
import {
  APPOINTMENT_SETTING_KEYS,
  parseAppointmentSettings,
} from "@/lib/appointments/settings";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { addOrderTimelineEvent } from "@/lib/ecommerce/orders";
import { STAFF_ACTIONS, type StaffAction } from "@/lib/readjustment/lifecycle";
import { getSiteSettings } from "@/lib/site-settings";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLUMNS =
  "id, status, purchase_source, order_item_id, order_number, product_label, product_type, tier, purchase_paid_at, unlisted_where, unlisted_reference, complimentary, fee_amount, fee_order_id, location_name, start_at, end_at, guest_name, phone, email, calendar_event_id, created_at";

async function load(id: string) {
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("readjustment_bookings").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  // The purchase's own Order, for the Staff link (order_items → orders).
  const { data: line } = data.order_item_id
    ? await admin.from("order_items").select("order_id").eq("id", data.order_item_id).maybeSingle()
    : { data: null };
  const { data: feeOrder } = data.fee_order_id
    ? await admin.from("orders").select("order_number, status").eq("id", data.fee_order_id).maybeSingle()
    : { data: null };
  return {
    ...data,
    purchase_order_id: (line?.order_id as string | undefined) ?? null,
    fee_order_number: (feeOrder?.order_number as string | undefined) ?? null,
    fee_order_status: (feeOrder?.status as string | undefined) ?? null,
  };
}

/** GET /api/settings/readjustments/[id] — what Staff see at the visit (ADR 0024). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("appointments");
  if (denied) return denied;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const booking = await load(id);
    if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, booking });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load" }, { status: 500 });
  }
}

const ActionSchema = z.object({ action: z.enum(Object.keys(STAFF_ACTIONS) as [StaffAction, ...StaffAction[]]) });

/**
 * POST /api/settings/readjustments/[id] — Staff mark the visit.
 *
 * - attended: the service was rendered; a paid booking's service Order is delivered.
 * - no_show: a complimentary visit stays used (cancel instead to give it back).
 * - cancel: the calendar event goes (Google tells the customer) and a complimentary
 *   visit is given back. A paid one is refunded, if at all, from its Order.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("appointments");
  if (denied) return denied;
  const { id } = await params;
  const parsed = ActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  const action = parsed.data.action;
  const rule = STAFF_ACTIONS[action];

  const before = await load(id).catch(() => null);
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(rule.from as readonly string[]).includes(before.status as string)) {
    return NextResponse.json(
      { error: `A booking that is ${before.status} cannot be marked ${action.replace("_", "-")}` },
      { status: 409 },
    );
  }

  const admin = supabaseAdmin();
  const now = new Date().toISOString();

  if (action === "cancel" && before.calendar_event_id) {
    const eventId = before.calendar_event_id as string;
    try {
      await deleteEvent(eventId);
    } catch (e) {
      return NextResponse.json(
        { error: `Could not remove the calendar event: ${e instanceof Error ? e.message : e}` },
        { status: 502 },
      );
    }
    // The guest hears it on WhatsApp too, with a rebook link — unless the
    // Calendar push already told them. Never fails the staff action.
    try {
      const row = await getReminderByEventId(eventId);
      if (row) {
        const settings = parseAppointmentSettings(
          await getSiteSettings([...APPOINTMENT_SETTING_KEYS]),
        );
        await cancelAppointment(row, settings, { cause: "removed" });
      }
    } catch (e) {
      console.error("[readjustments] cancel notice", e instanceof Error ? e.message : e);
    }
  }

  const { data: moved, error } = await admin
    .from("readjustment_bookings")
    .update({ status: rule.to, updated_at: now })
    .eq("id", id)
    .eq("status", before.status as string)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!moved?.length) {
    // Removing the event can itself cancel the booking (the Calendar push, or
    // the notice above): already where this action was taking it is success.
    const { data: current } = await admin
      .from("readjustment_bookings")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (current?.status !== rule.to) {
      return NextResponse.json({ error: "This booking just changed — refresh" }, { status: 409 });
    }
  }

  // A paid visit that happened: its service Order is fulfilled.
  if (action === "attended" && before.fee_order_id && before.fee_order_status === "confirmed") {
    await admin
      .from("orders")
      .update({ status: "delivered", delivered_at: now })
      .eq("id", before.fee_order_id as string)
      .eq("status", "confirmed");
    await addOrderTimelineEvent(
      before.fee_order_id as string,
      "service_rendered",
      "Re-adjustment visit attended",
      { readjustment_booking_id: id },
    ).catch(() => {});
  }

  await recordAdminAction({
    actor: await getAdminContext(),
    action: `readjustment.${action}`,
    entityType: "readjustment_booking",
    entityId: id,
    before: { status: before.status },
    after: { status: rule.to },
  });

  return NextResponse.json({ ok: true, booking: await load(id) });
}
