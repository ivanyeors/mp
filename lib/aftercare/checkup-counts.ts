/**
 * Check-up reminder counts (CRM slice 08), for the Aftercare card. Counts
 * only: nothing that names a customer leaves this file.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CHECKUP_TEMPLATE_LIKE } from "./checkup";

export type CheckupWindow = { from: string; to: string };

/** A booking that is a booking: not a checkout left open, cancelled or expired. */
const BOOKED = ["booked", "attended", "no_show", "needs_reschedule"] as const;

type SentRow = { customer_id: string; template: string; entity_id: string; sent_at: string };

/**
 * Check-ups sent in `window`: one per Order and milestone, whatever carried
 * it; the messages by channel; and how many were followed by a Re-adjustment
 * booking, made by that Customer on or after the check-up's first send.
 */
export function summariseCheckupSends(input: {
  email: readonly SentRow[];
  whatsapp: readonly SentRow[];
  bookings: ReadonlyArray<{ customer_id: string; created_at: string; status: string }>;
}): { sent: number; email: number; whatsapp: number; followedByBooking: number } {
  const first = new Map<string, { customerId: string; at: number }>();
  for (const row of [...input.email, ...input.whatsapp]) {
    const key = `${row.customer_id}|${row.template}|${row.entity_id}`;
    const at = Date.parse(row.sent_at);
    const prev = first.get(key);
    if (!prev || at < prev.at) first.set(key, { customerId: row.customer_id, at });
  }
  const bookedAt = new Map<string, number[]>();
  for (const b of input.bookings) {
    if (!(BOOKED as readonly string[]).includes(b.status)) continue;
    bookedAt.set(b.customer_id, [...(bookedAt.get(b.customer_id) ?? []), Date.parse(b.created_at)]);
  }
  let followedByBooking = 0;
  for (const { customerId, at } of first.values()) {
    if ((bookedAt.get(customerId) ?? []).some((t) => t >= at)) followedByBooking += 1;
  }
  return { sent: first.size, email: input.email.length, whatsapp: input.whatsapp.length, followedByBooking };
}

export async function countCheckupSends(
  admin: SupabaseClient,
  window: CheckupWindow,
): Promise<{ sent: number; email: number; whatsapp: number; followedByBooking: number }> {
  const sent = (table: "customer_emails" | "customer_whatsapp") =>
    admin
      .from(table)
      .select("customer_id, template, entity_id, sent_at")
      .like("template", CHECKUP_TEMPLATE_LIKE)
      .eq("status", "sent")
      .gte("sent_at", window.from)
      .lt("sent_at", window.to);
  const [email, whatsapp] = await Promise.all([sent("customer_emails"), sent("customer_whatsapp")]);
  const failed = email.error ?? whatsapp.error;
  if (failed) throw new Error(`check-up sends: ${failed.message}`);
  const rows = { email: (email.data ?? []) as SentRow[], whatsapp: (whatsapp.data ?? []) as SentRow[] };

  const customerIds = [...new Set([...rows.email, ...rows.whatsapp].map((r) => r.customer_id))];
  let bookings: Array<{ customer_id: string; created_at: string; status: string }> = [];
  if (customerIds.length > 0) {
    // ponytail: one IN list; a quarter of check-ups is a few dozen Customers.
    const { data, error } = await admin
      .from("readjustment_bookings")
      .select("customer_id, created_at, status")
      .in("customer_id", customerIds)
      .gte("created_at", window.from);
    if (error) throw new Error(`readjustment_bookings: ${error.message}`);
    bookings = (data ?? []) as typeof bookings;
  }
  return summariseCheckupSends({ ...rows, bookings });
}
