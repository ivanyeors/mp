import type { SupabaseClient } from "@supabase/supabase-js";

import type { Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { payLinkExpiry, payLinkPath } from "@/lib/staff-orders/shared";

export type PayLinkRow = {
  order_id: string;
  token: string;
  expires_at: string;
  created_by_email: string | null;
  last_sent_at: string | null;
  last_sent_to: string | null;
  send_count: number;
  created_at: string;
};

export type PayLinkOrder = {
  id: string;
  order_number: string;
  customer_id: string | null;
  email: string;
  status: string;
  paid_at: string | null;
  currency: string;
  subtotal: number;
  shipping_amount: number;
  discount_amount: number;
  coupon_code: string | null;
  tax_amount: number;
  total: number;
  shipping_address: Record<string, unknown> | null;
  shipping_courier: string | null;
  notes: string | null;
  locale: string;
  stripe_session_id: string | null;
  created_at: string;
};

export type PayLinkItem = {
  id: string;
  variant_id: string | null;
  kind: string | null;
  service_key: string | null;
  sku: string;
  product_title: string;
  variant_title: string | null;
  image_url: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
};

export type LoadedPayLink = { link: PayLinkRow; order: PayLinkOrder; items: PayLinkItem[] };

const LINK_COLUMNS =
  "order_id, token, expires_at, created_by_email, last_sent_at, last_sent_to, send_count, created_at";
const ORDER_COLUMNS =
  "id, order_number, customer_id, email, status, paid_at, currency, subtotal, shipping_amount, discount_amount, coupon_code, tax_amount, total, shipping_address, shipping_courier, notes, locale, stripe_session_id, created_at";
const ITEM_COLUMNS =
  "id, variant_id, kind, service_key, sku, product_title, variant_title, image_url, quantity, unit_price, total_price";

const num = (v: unknown) => Number(v ?? 0);

function toOrder(row: Record<string, unknown>): PayLinkOrder {
  return {
    ...(row as unknown as PayLinkOrder),
    subtotal: num(row.subtotal),
    shipping_amount: num(row.shipping_amount),
    discount_amount: num(row.discount_amount),
    tax_amount: num(row.tax_amount),
    total: num(row.total),
  };
}

function toItem(row: Record<string, unknown>): PayLinkItem {
  return {
    ...(row as unknown as PayLinkItem),
    quantity: num(row.quantity),
    unit_price: num(row.unit_price),
    total_price: num(row.total_price),
  };
}

async function loadOrderAndItems(
  admin: SupabaseClient,
  link: PayLinkRow,
): Promise<LoadedPayLink | null> {
  const [{ data: order, error: orderError }, { data: items, error: itemsError }] = await Promise.all([
    admin.from("orders").select(ORDER_COLUMNS).eq("id", link.order_id).maybeSingle(),
    admin.from("order_items").select(ITEM_COLUMNS).eq("order_id", link.order_id).order("created_at"),
  ]);
  if (orderError) throw new Error(orderError.message);
  if (itemsError) throw new Error(itemsError.message);
  if (!order) return null;
  return {
    link,
    order: toOrder(order as Record<string, unknown>),
    items: ((items ?? []) as Record<string, unknown>[]).map(toItem),
  };
}

export async function loadPayLinkByToken(admin: SupabaseClient, token: string): Promise<LoadedPayLink | null> {
  const { data, error } = await admin.from("order_payment_links").select(LINK_COLUMNS).eq("token", token).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? loadOrderAndItems(admin, data as PayLinkRow) : null;
}

export async function loadPayLinkRow(admin: SupabaseClient, orderId: string): Promise<PayLinkRow | null> {
  const { data, error } = await admin
    .from("order_payment_links")
    .select(LINK_COLUMNS)
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PayLinkRow | null) ?? null;
}

export async function loadPayLinkForOrder(admin: SupabaseClient, orderId: string): Promise<LoadedPayLink | null> {
  const link = await loadPayLinkRow(admin, orderId);
  return link ? loadOrderAndItems(admin, link) : null;
}

export function payLinkUrl(origin: string, token: string, locale: Locale): string {
  return `${origin.replace(/\/$/, "")}${withLocale(payLinkPath(token), locale)}`;
}

export async function renewPayLink(admin: SupabaseClient, orderId: string, now: Date): Promise<string> {
  const expiresAt = payLinkExpiry(now).toISOString();
  const { error } = await admin.from("order_payment_links").update({ expires_at: expiresAt }).eq("order_id", orderId);
  if (error) throw new Error(error.message);
  return expiresAt;
}
