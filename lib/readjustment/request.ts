/**
 * What both re-adjustment booking routes share (ADR 0024): who is asking, which
 * purchase they mean, and what it costs today — all decided on the server. The
 * client's id is only a pointer into the signed-in customer's own purchases, and
 * its belief that a visit is free is never trusted.
 */

import { z } from "zod/v4";
import type { SupabaseClient } from "@supabase/supabase-js";

import { LANGUAGE_PREFERENCES } from "@/lib/appointments/language";
import { normalizePhone } from "@/lib/appointments/phone";
import { getAppointmentSettings } from "@/lib/appointments/settings-store";
import { isOfferableSlot } from "@/lib/appointments/slots";
import { getAuthUser } from "@/lib/auth/user";
import { getLocation } from "@/lib/locations";
import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { evaluateReadjustment, type ReadjustmentQuote } from "@/lib/readjustment/eligibility";
import { loadReadjustmentContext, type ReadjustablePurchaseView } from "@/lib/readjustment/purchases";
import type { Customer } from "@/lib/types/ecommerce";

export const UNLISTED_WHERE = ["online_before_accounts", "in_store", "gift", "other"] as const;
export type UnlistedWhere = (typeof UNLISTED_WHERE)[number];

export const UNLISTED_WHERE_LABELS: Record<UnlistedWhere, string> = {
  online_before_accounts: "Online, before accounts",
  in_store: "In store",
  gift: "A gift",
  other: "Somewhere else",
};

export const ReadjustmentBookingSchema = z
  .object({
    order_item_id: z.uuid().optional(),
    unlisted: z
      .object({
        where: z.enum(UNLISTED_WHERE),
        reference: z.string().trim().max(120).optional(),
      })
      .optional(),
    location_id: z.string().min(1),
    start_iso: z.string().min(1),
    end_iso: z.string().min(1),
    guest_name: z.string().trim().min(1).max(200),
    phone: z.string().min(1),
    language_preference: z.enum(LANGUAGE_PREFERENCES).default("none"),
    /**
     * The marketing email box, ticked by default (ADR 0037; PRD-campaign-audiences
     * slice 02). Absent, as from a booking tab opened before it, is unticked.
     */
    marketing_email: z.boolean().optional(),
  })
  .refine((b) => Boolean(b.order_item_id) !== Boolean(b.unlisted), {
    message: "Pick one of your purchases, or say it isn't listed",
  });

export type ReadjustmentBookingBody = z.infer<typeof ReadjustmentBookingSchema>;

/** The signed-in Customer, linked on the way (which also backfills guest orders by email). */
export async function resolveSignedInCustomer(): Promise<Customer | null> {
  const user = await getAuthUser();
  if (!user?.email) return null;
  return linkCustomerToAuthUser(user);
}

export type BookingTarget =
  | { kind: "platform"; purchase: ReadjustablePurchaseView; quote: ReadjustmentQuote }
  | { kind: "unlisted"; where: UnlistedWhere; reference: string | null; quote: ReadjustmentQuote };

/**
 * Resolve the body's purchase against the customer's own Orders and quote it.
 * `null` means the line is not one of theirs (or not a pillow/bolster) — a 404,
 * never a hint about whose it is.
 */
export async function resolveBookingTarget(
  admin: SupabaseClient,
  customerId: string,
  body: ReadjustmentBookingBody,
): Promise<{ target: BookingTarget; fee: number } | null> {
  const ctx = await loadReadjustmentContext(admin, customerId);
  if (body.unlisted) {
    return {
      fee: ctx.fee,
      target: {
        kind: "unlisted",
        where: body.unlisted.where,
        reference: body.unlisted.reference?.trim() || null,
        quote: evaluateReadjustment(
          { source: "unlisted", orderItemId: null, productType: "pillow", tier: null, paidAt: null, units: 1 },
          [],
          ctx.policy,
          ctx.fee,
          ctx.today,
        ),
      },
    };
  }
  const purchase = ctx.purchases.find((p) => p.orderItemId === body.order_item_id);
  if (!purchase) return null;
  return { fee: ctx.fee, target: { kind: "platform", purchase, quote: purchase.quote } };
}

const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short", year: "numeric" }).format(
    new Date(iso),
  );

/** What Staff read on the calendar event: the pillow, its order, and the fee status. */
export function bookingNotes(
  target: BookingTarget,
  payment:
    | { kind: "complimentary" }
    | { kind: "no_fee" }
    | { kind: "paid"; amount: number; orderNumber: string | null },
): string[] {
  const lines =
    target.kind === "platform"
      ? [
          `Re-adjustment: ${target.purchase.label}`,
          `Order #${target.purchase.orderNumber}${
            target.purchase.paidAt ? ` · bought ${dateLabel(target.purchase.paidAt)}` : ""
          }`,
        ]
      : [
          "Re-adjustment: pillow not listed on the customer's account",
          `Bought: ${UNLISTED_WHERE_LABELS[target.where]}${target.reference ? ` · ref ${target.reference}` : ""}`,
          "Check proof of purchase at the visit.",
        ];
  lines.push(
    payment.kind === "complimentary"
      ? "Complimentary visit"
      : payment.kind === "no_fee"
        ? "No fee (re-adjustment fee is $0)"
        : `Paid SGD ${payment.amount.toFixed(2)}${payment.orderNumber ? ` · Order #${payment.orderNumber}` : ""}`,
  );
  return lines;
}

/** Columns describing the purchase, for a `readjustment_bookings` insert. */
export function purchaseColumns(target: BookingTarget) {
  return target.kind === "platform"
    ? {
        purchase_source: "platform" as const,
        order_item_id: target.purchase.orderItemId,
        unlisted_where: null,
        unlisted_reference: null,
        product_label: target.purchase.label,
        product_type: target.purchase.productType,
        tier: target.purchase.tier,
        purchase_paid_at: target.purchase.paidAt,
        order_number: target.purchase.orderNumber,
      }
    : {
        purchase_source: "unlisted" as const,
        order_item_id: null,
        unlisted_where: target.where,
        unlisted_reference: target.reference,
        product_label: "Pillow not listed",
        product_type: "pillow" as const,
        tier: null,
        purchase_paid_at: null,
        order_number: null,
      };
}

export type CheckedSlot = {
  location: { id: string; name: string; address: string };
  phone: string;
  startIso: string;
  endIso: string;
};

/** The slot and Location half of a booking body, checked the way the guest route checks it. */
export async function checkSlotRequest(
  body: ReadjustmentBookingBody,
): Promise<{ ok: true; slot: CheckedSlot } | { ok: false; status: number; error: string }> {
  const startMs = Date.parse(body.start_iso);
  const endMs = Date.parse(body.end_iso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    return { ok: false, status: 400, error: "Invalid start_iso/end_iso" };
  }
  if (startMs < Date.now()) return { ok: false, status: 400, error: "That time has already passed" };
  if (!isOfferableSlot(body.start_iso, body.end_iso, await getAppointmentSettings())) {
    return { ok: false, status: 400, error: "That time is not a bookable slot" };
  }
  const phone = normalizePhone(body.phone);
  if (!phone) return { ok: false, status: 400, error: "Invalid phone" };
  const location = await getLocation(body.location_id);
  if (!location) return { ok: false, status: 404, error: "Unknown location" };
  if (!location.address) return { ok: false, status: 400, error: "Location has no address" };
  if (!location.bookable) {
    return { ok: false, status: 409, error: "This location is not taking bookings right now" };
  }
  return {
    ok: true,
    slot: {
      location: { id: location.id, name: location.name, address: location.address },
      phone,
      startIso: new Date(startMs).toISOString(),
      endIso: new Date(endMs).toISOString(),
    },
  };
}
