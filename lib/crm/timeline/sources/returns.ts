import { supabaseAdmin } from "@/lib/supabase/server";
import { humanizeToken } from "@/lib/rma/admin-view";
import { RETURNS_GROUP } from "@/lib/crm/timeline/groups";
import { joinBatches, readStream } from "@/lib/crm/timeline/read";
import type { TimelineAdapter, TimelineRef } from "@/lib/crm/timeline/types";

/**
 * Returns on the Customer timeline (`returns`): when each was opened
 * (`rma_requests`), and every Status event after that (`rma_status_events`,
 * the Return's own append-only timeline). The event that opens a Return
 * (`from_status` null) is the opened entry already, so it is not read twice.
 */

type RequestRow = {
  id: string;
  resolution: string;
  status: string;
  created_at: string;
  orders: { order_number: string } | { order_number: string }[] | null;
};

type EventRow = { id: string; rma_request_id: string; to_status: string; actor: string; created_at: string };

const refOf = (id: string): TimelineRef => ({ type: "rma", id, href: `/settings/rma/${id}` });

const BY: Record<string, string> = { staff: " by Staff", customer: " by the customer" };

export const returnsAdapter: TimelineAdapter = {
  key: "returns",
  group: RETURNS_GROUP,
  kinds: ["return.opened", "return.status_changed"],
  permission: "returns",
  async load(customer, before, limit) {
    const db = supabaseAdmin();
    const [opened, changed] = await Promise.all([
      readStream<RequestRow>(
        db
          .from("rma_requests")
          .select("id, resolution, status, created_at, orders!inner(order_number)")
          .eq("customer_id", customer.id),
        "created_at",
        before,
        limit,
        (r) => {
          const order = Array.isArray(r.orders) ? r.orders[0] : r.orders;
          return {
            id: `return.opened:${r.id}`,
            at: r.created_at,
            kind: "return.opened",
            ref: refOf(r.id),
            summary: `Return opened${order ? ` on order #${order.order_number}` : ""} (${r.resolution})`,
            status: r.status,
          };
        },
      ),
      readStream<EventRow>(
        db
          .from("rma_status_events")
          .select("id, rma_request_id, to_status, actor, created_at, rma_requests!inner(customer_id)")
          .eq("rma_requests.customer_id", customer.id)
          .not("from_status", "is", null),
        "created_at",
        before,
        limit,
        (e) => ({
          id: `return.status_changed:${e.id}`,
          at: e.created_at,
          kind: "return.status_changed",
          ref: refOf(e.rma_request_id),
          summary: `Return ${humanizeToken(e.to_status).toLowerCase()}${BY[e.actor] ?? ""}`,
        }),
      ),
    ]);
    return joinBatches([opened, changed]);
  },
};
