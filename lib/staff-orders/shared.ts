import { z } from "zod";

import { usesPostalCode } from "@/lib/shipping/countries";
import { SERVICE_KEYS, type ServiceKey } from "@/lib/pricing/service-prices";
import { OUTSIDE_STRIPE_METHODS, OUTSIDE_STRIPE_METHOD_LABELS } from "@/lib/ecommerce/outside-stripe";

export const PAY_LINK_LIFETIME_DAYS = 7;

export const STAFF_ORDER_PURPOSE = "staff_order";

export const MIN_CHARGE = 0.5;

export const MAX_GOODS_QUANTITY = 99;
export const MAX_SERVICE_QUANTITY = 20;
export const NOTE_MAX = 500;
export const INTERNAL_NOTE_MAX = 1000;

const AddressSchema = z
  .object({
    recipient: z.string().trim().min(1, "Who receives it").max(120),
    line1: z.string().trim().min(1, "Address line 1").max(200),
    line2: z.string().trim().max(200).optional(),
    city: z.string().trim().min(1, "City").max(100),
    state: z.string().trim().max(100).optional(),
    postal_code: z.string().trim().max(20).default(""),
    country: z.string().trim().toUpperCase().length(2).default("SG"),
    phone: z.string().trim().max(40).optional(),
  })
  .refine((a) => !usesPostalCode(a.country) || a.postal_code.length > 0, {
    message: "Postal code is required",
    path: ["postal_code"],
  });

export type StaffOrderAddress = z.infer<typeof AddressSchema>;

const DraftFields = z.object({
  customer_id: z.string().uuid("Customer not found"),
  goods: z
    .array(
      z.object({
        variant_id: z.string().uuid("A product in this order can't be found. Remove it and try again."),
        quantity: z.number().int().min(1).max(MAX_GOODS_QUANTITY),
      }),
    )
    .max(50)
    .default([]),
  services: z
    .array(
      z.object({
        key: z.enum(SERVICE_KEYS),
        quantity: z.number().int().min(1).max(MAX_SERVICE_QUANTITY),
      }),
    )
    .max(SERVICE_KEYS.length * 2)
    .default([]),
  delivery: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("studio"), location_id: z.string().trim().min(1).max(64) }),
    z.object({
      kind: z.literal("ship"),
      shipping_method_id: z.string().uuid("Pick a delivery method"),
      address: AddressSchema,
    }),
  ]),
  code: z.string().trim().max(64).optional(),
  note: z.string().trim().max(NOTE_MAX).optional(),
  internal_note: z.string().trim().max(INTERNAL_NOTE_MAX).optional(),
});

export const PaidHowSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("stripe"),
      payment_intent_id: z.string().regex(/^pi_[A-Za-z0-9_]+$/, "Pick a Stripe payment"),
    }),
    z.object({
      kind: z.literal("outside"),
      method: z.enum(OUTSIDE_STRIPE_METHODS),
      note: z.string().trim().max(NOTE_MAX).optional(),
    }),
  ])
  .refine((how) => how.kind !== "outside" || how.method !== "other" || Boolean(how.note), {
    message: "Say how it was paid",
    path: ["note"],
  });
export type PaidHow = z.infer<typeof PaidHowSchema>;

export type StripePaymentOption = {
  id: string;
  amount: number;
  currency: string;
  paidAt: string;
  method: string | null;
  description: string | null;
  email: string | null;
};

export function paidHowLabel(how: PaidHow): string {
  return how.kind === "stripe" ? `Stripe payment ${how.payment_intent_id}` : OUTSIDE_STRIPE_METHOD_LABELS[how.method];
}

const hasALine = (d: { goods: unknown[]; services: unknown[] }) => d.goods.length + d.services.length > 0;
const NO_LINES = { message: "Add at least one product or service", path: ["goods"] };

export const StaffOrderDraftSchema = DraftFields.refine(hasALine, NO_LINES);
export type StaffOrderDraft = z.infer<typeof StaffOrderDraftSchema>;

export const CreateStaffOrderSchema = DraftFields.extend({
  send_email: z.boolean().default(true),
  paid: PaidHowSchema.optional(),
}).refine(hasALine, NO_LINES);
export type CreateStaffOrderInput = z.infer<typeof CreateStaffOrderSchema>;

export function mergeQuantities<K extends string, T extends Record<K, string> & { quantity: number }>(
  rows: readonly T[],
  key: K,
): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const seen = byKey.get(row[key]);
    if (seen) byKey.set(row[key], { ...seen, quantity: seen.quantity + row.quantity });
    else byKey.set(row[key], { ...row });
  }
  return [...byKey.values()];
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type StaffOrderLine =
  | {
      kind: "goods";
      variantId: string;
      productId: string;
      categoryId: string | null;
      sku: string;
      title: string;
      variantTitle: string | null;
      imageUrl: string | null;
      unitPrice: number;
      quantity: number;
      stockAvailable: number;
    }
  | {
      kind: "service";
      serviceKey: ServiceKey;
      sku: string;
      title: string;
      unitPrice: number;
      quantity: number;
    };

export function lineTotal(line: Pick<StaffOrderLine, "unitPrice" | "quantity">): number {
  return round2(line.unitPrice * line.quantity);
}

export function subtotals(lines: readonly StaffOrderLine[]): { goods: number; services: number; all: number } {
  let goods = 0;
  let services = 0;
  for (const line of lines) {
    if (line.kind === "goods") goods += lineTotal(line);
    else services += lineTotal(line);
  }
  return { goods: round2(goods), services: round2(services), all: round2(goods + services) };
}

export type StaffOrderDeliverySummary =
  | { kind: "studio"; locationId: string; locationName: string }
  | { kind: "ship"; methodId: string; label: string };

export type StaffOrderQuoteView = {
  currency: "SGD";
  lines: StaffOrderLine[];
  goodsSubtotal: number;
  servicesSubtotal: number;
  subtotal: number;
  shippingAmount: number;
  discountAmount: number;
  discountCode: string | null;
  taxAmount: number;
  taxLabel: string | null;
  total: number;
  delivery: StaffOrderDeliverySummary;
};

export type PayLinkState = "payable" | "paid" | "closed" | "expired";

export const PAYABLE_STATUSES: ReadonlySet<string> = new Set(["pending", "payment_failed"]);

export function payLinkState(
  order: { status: string; paid_at: string | null },
  link: { expires_at: string },
  now: Date,
): PayLinkState {
  if (order.paid_at) return "paid";
  if (!PAYABLE_STATUSES.has(order.status)) return "closed";
  return Date.parse(link.expires_at) <= now.getTime() ? "expired" : "payable";
}

export function payLinkExpiry(now: Date): Date {
  return new Date(now.getTime() + PAY_LINK_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
}

export function payLinkPath(token: string): string {
  return `/pay/${token}`;
}

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPayLinkToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_RE.test(value);
}
