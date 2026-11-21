import { supabaseAdmin } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/i18n/currencies";
import { EMAIL_REGISTRY } from "@/lib/email/registry";
import { ORDERS_GROUP } from "@/lib/crm/timeline/groups";
import { joinBatches, readStream } from "@/lib/crm/timeline/read";
import type { TimelineAdapter, TimelineRef } from "@/lib/crm/timeline/types";

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  total: number | string;
  currency: string;
  created_at: string;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  refund_requested_at: string | null;
};

const ORDER_COLUMNS =
  "id, order_number, status, total, currency, created_at, paid_at, shipped_at, delivered_at, cancelled_at, refund_requested_at";

type Step = {
  column: "created_at" | "paid_at" | "shipped_at" | "delivered_at" | "cancelled_at" | "refund_requested_at";
  kind: string;
  line: (o: OrderRow) => string;
};

const STEPS: readonly Step[] = [
  {
    column: "created_at",
    kind: "order.placed",
    line: (o) => `Order #${o.order_number} placed · ${formatCurrency(Number(o.total), o.currency)}`,
  },
  { column: "paid_at", kind: "order.paid", line: (o) => `Order #${o.order_number} paid` },
  { column: "shipped_at", kind: "order.shipped", line: (o) => `Order #${o.order_number} shipped` },
  { column: "delivered_at", kind: "order.delivered", line: (o) => `Order #${o.order_number} delivered` },
  { column: "cancelled_at", kind: "order.cancelled", line: (o) => `Order #${o.order_number} cancelled` },
  {
    column: "refund_requested_at",
    kind: "order.refund_requested",
    line: (o) => `Refund requested on order #${o.order_number}`,
  },
];

const orderRef = (id: string): TimelineRef => ({ type: "order", id, href: `/settings/orders/${id}` });

export const ordersAdapter: TimelineAdapter = {
  key: "orders",
  group: ORDERS_GROUP,
  kinds: STEPS.map((s) => s.kind),
  permission: "orders",
  async load(customer, before, limit) {
    const db = supabaseAdmin();
    const batches = await Promise.all(
      STEPS.map((step) =>
        readStream<OrderRow>(
          db.from("orders").select(ORDER_COLUMNS).eq("customer_id", customer.id),
          step.column,
          before,
          limit,
          (o) => ({
            id: `${step.kind}:${o.id}`,
            at: o[step.column] as string,
            kind: step.kind,
            ref: orderRef(o.id),
            summary: step.line(o),
            ...(step.column === "created_at" ? { status: o.status } : {}),
          }),
        ),
      ),
    );
    return joinBatches(batches);
  },
};

type OrderEmailRow = {
  id: string;
  order_id: string;
  template: string;
  created_at: string;
  orders: { order_number: string } | { order_number: string }[] | null;
};

export function orderEmailLabel(template: string): string {
  return EMAIL_REGISTRY.find((c) => c.id === `order.${template}`)?.label ?? template.replace(/_/g, " ");
}

export const orderEmailsAdapter: TimelineAdapter = {
  key: "order-emails",
  group: ORDERS_GROUP,
  kinds: ["order.email_sent"],
  permission: "orders",
  load(customer, before, limit) {
    return readStream<OrderEmailRow>(
      supabaseAdmin()
        .from("order_emails")
        .select("id, order_id, template, created_at, orders!inner(customer_id, order_number)")
        .eq("orders.customer_id", customer.id)
        .eq("status", "sent"),
      "created_at",
      before,
      limit,
      (e) => {
        const order = Array.isArray(e.orders) ? e.orders[0] : e.orders;
        const on = order ? ` (order #${order.order_number})` : "";
        return {
          id: `order.email_sent:${e.id}`,
          at: e.created_at,
          kind: "order.email_sent",
          ref: orderRef(e.order_id),
          summary: `Email sent: ${orderEmailLabel(e.template)}${on}`,
        };
      },
    );
  },
};
