import { supabaseAdmin } from "@/lib/supabase/server";
import { formatAdminDateMY, formatAdminDateTimeMY } from "@/lib/format/admin-date";
import { READJUSTMENTS_GROUP } from "@/lib/crm/timeline/groups";
import { canonicalAt, EMPTY_BATCH } from "@/lib/crm/timeline/merge";
import { cappedBatch, joinBatches, newestRows, readStream } from "@/lib/crm/timeline/read";
import type { TimelineAdapter, TimelineEntry, TimelineRef } from "@/lib/crm/timeline/types";

type BookingRow = {
  id: string;
  status: string;
  product_label: string;
  location_name: string;
  start_at: string;
  complimentary: boolean;
  created_at: string;
};

export const BOOKINGS_CAP = 100;

const STAFF_ACTIONS: Record<string, { kind: string; line: (date: string) => string }> = {
  "readjustment.attended": { kind: "readjustment.attended", line: (d) => `Re-adjustment on ${d} attended` },
  "readjustment.no_show": { kind: "readjustment.no_show", line: (d) => `Re-adjustment on ${d}: no-show` },
  "readjustment.cancel": { kind: "readjustment.cancelled", line: (d) => `Re-adjustment on ${d} cancelled by Staff` },
};

const refOf = (id: string): TimelineRef => ({ type: "readjustment_booking", id, href: "/settings/appointments" });

type AuditRow = { id: string; action: string; entity_id: string; created_at: string };

export const readjustmentsAdapter: TimelineAdapter = {
  key: "readjustments",
  group: READJUSTMENTS_GROUP,
  kinds: ["readjustment.booked", ...Object.values(STAFF_ACTIONS).map((a) => a.kind)],
  permission: "appointments",
  async load(customer, before, limit) {
    const db = supabaseAdmin();
    const bookings = await newestRows<BookingRow>(
      db
        .from("readjustment_bookings")
        .select("id, status, product_label, location_name, start_at, complimentary, created_at")
        .eq("customer_id", customer.id),
      "created_at",
      before,
      BOOKINGS_CAP,
    );

    const booked: TimelineEntry[] = bookings.map((b) => ({
      id: `readjustment.booked:${b.id}`,
      at: b.created_at,
      kind: "readjustment.booked",
      ref: refOf(b.id),
      summary: `Re-adjustment booked: ${b.product_label} at ${b.location_name}, ${formatAdminDateTimeMY(b.start_at)}${
        b.complimentary ? " (complimentary)" : ""
      }`,
      status: b.status,
    }));
    const capped = bookings.length >= BOOKINGS_CAP ? canonicalAt(bookings[bookings.length - 1]!.created_at) : null;

    const byId = new Map(bookings.map((b) => [b.id, b]));
    const marked = byId.size
      ? await readStream<AuditRow>(
          db
            .from("admin_audit_log")
            .select("id, action, entity_id, created_at")
            .eq("entity_type", "readjustment_booking")
            .in("action", Object.keys(STAFF_ACTIONS))
            .in("entity_id", [...byId.keys()]),
          "created_at",
          before,
          limit,
          (a) => {
            const action = STAFF_ACTIONS[a.action];
            const booking = byId.get(a.entity_id);
            if (!action || !booking) return null;
            return {
              id: `${action.kind}:${a.id}`,
              at: a.created_at,
              kind: action.kind,
              ref: refOf(booking.id),
              summary: action.line(formatAdminDateMY(booking.start_at)),
            };
          },
        )
      : EMPTY_BATCH;

    return joinBatches([cappedBatch(booked, before, capped), marked]);
  },
};
