import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Easyship webhook: fails closed without a secret, rejects a bad signature,
 * marks the order shipped from a label event and delivered from a tracking event
 * — once. Only Supabase and the email sender are faked.
 */

const h = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown> | null>,
  updates: [] as Array<{ table: string; row: Record<string, unknown> }>,
  timeline: [] as Array<Record<string, unknown>>,
  sendShippingEmail: vi.fn(),
}));

vi.mock("@/lib/email", () => ({ sendShippingEmail: h.sendShippingEmail }));
vi.mock("@/lib/supabase/server", () => ({
  /** One row per table — enough for one order and its shipment. */
  supabaseAdmin: () => ({
    from(table: string) {
      const filters: Array<[string, string, unknown]> = [];
      let write: Record<string, unknown> | null = null;
      let upsert = false;
      const row = () => h.tables[table] ?? null;
      const matches = () =>
        row() != null &&
        filters.every(([op, col, val]) => {
          const v = row()![col];
          if (op === "eq") return String(v) === String(val);
          if (op === "in") return (val as unknown[]).includes(v);
          if (op === "is") return v == null;
          return true;
        });
      const run = () => {
        if (table === "order_timeline") return { data: null, error: null };
        if (write && upsert) {
          h.tables[table] = { ...(row() ?? {}), ...write };
          h.updates.push({ table, row: write });
          return { data: [{ ...h.tables[table] }], error: null };
        }
        if (write) {
          if (!matches()) return { data: [], error: null };
          h.updates.push({ table, row: write });
          Object.assign(row()!, write);
          return { data: [{ ...row() }], error: null };
        }
        return { data: matches() ? { ...row() } : null, error: null };
      };
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => (filters.push(["eq", c, v]), b),
        in: (c: string, v: unknown[]) => (filters.push(["in", c, v]), b),
        is: (c: string, v: unknown) => (filters.push(["is", c, v]), b),
        update: (r: Record<string, unknown>) => ((write = r), b),
        upsert: (r: Record<string, unknown>) => ((write = r), (upsert = true), b),
        insert: (r: Record<string, unknown>) => (h.timeline.push(r), b),
        maybeSingle: async () => run(),
        single: async () => {
          const r = run();
          return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: null };
        },
        then: (resolve: (v: unknown) => unknown) => resolve(run()),
      };
      return b;
    },
  }),
}));

const { POST } = await import("@/app/api/shipping/easyship/webhook/route");

const SECRET = "whsec_test";
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
function signature(key = SECRET) {
  const head = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ iat: Math.floor(Date.now() / 1000) })}`;
  return `${head}.${createHmac("sha256", key).update(head).digest("base64url")}`;
}

const send = (body: unknown, sig: string | null = signature()) =>
  POST(
    new Request("https://x.test/api/shipping/easyship/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(sig ? { "X-EASYSHIP-SIGNATURE": sig } : {}) },
      body: JSON.stringify(body),
    }),
  );

const labelCreated = {
  event_type: "shipment.label.created",
  resource_type: "shipment",
  resource_id: "ESSG1",
  data: {
    easyship_shipment_id: "ESSG1",
    label_url: "https://labels.test/ESSG1.pdf",
    tracking_number: "NV123",
    tracking_page_url: "https://track.test/ESSG1",
  },
};
const tracking = (status: string) => ({
  event_type: "shipment.tracking.status.changed",
  resource_id: "ESSG1",
  data: { easyship_shipment_id: "ESSG1", status, tracking_number: "NV123" },
});

beforeEach(() => {
  vi.stubEnv("EASYSHIP_WEBHOOK_SECRET", SECRET);
  h.tables = {
    orders: {
      id: "order-1",
      order_number: "MP-1",
      email: "ada@x.test",
      status: "confirmed",
      shipped_at: null,
      delivered_at: null,
    },
    order_shipments: { order_id: "order-1", easyship_shipment_id: "ESSG1", courier_service_id: "cs_ninja" },
  };
  h.updates.length = 0;
  h.timeline.length = 0;
  h.sendShippingEmail.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/shipping/easyship/webhook", () => {
  it("accepts nothing while no secret is configured", async () => {
    vi.stubEnv("EASYSHIP_WEBHOOK_SECRET", "");
    expect((await send(labelCreated)).status).toBe(503);
    expect(h.updates).toHaveLength(0);
  });

  it("verifies with the secret captured by the settings sync when the env var is unset", async () => {
    vi.stubEnv("EASYSHIP_WEBHOOK_SECRET", "");
    h.tables.api_configs = { slug: "easyship", config: { sync: { webhook_secret_token: "whsec_synced" } } };
    expect((await send(labelCreated, signature("whsec_synced"))).status).toBe(200);
    expect((await send(labelCreated, signature(SECRET))).status).toBe(401);
  });

  it("rejects a missing or forged signature", async () => {
    expect((await send(labelCreated, null)).status).toBe(401);
    expect((await send(labelCreated, signature("not-the-secret"))).status).toBe(401);
    expect(h.updates).toHaveLength(0);
  });

  it("marks the order shipped with tracking and the label, and emails the customer", async () => {
    const res = await send(labelCreated);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ shipped: true });
    expect(h.tables.orders).toMatchObject({
      status: "shipped",
      tracking_number: "NV123",
      tracking_url: "https://track.test/ESSG1",
    });
    // The label lives with the shipment, off the customer-readable order.
    expect(h.tables.orders).not.toHaveProperty("label_url");
    expect(h.tables.order_shipments).toMatchObject({
      easyship_shipment_id: "ESSG1",
      label_url: "https://labels.test/ESSG1.pdf",
      courier_service_id: "cs_ninja",
    });
    expect(h.sendShippingEmail).toHaveBeenCalledTimes(1);
  });

  it("does not ship twice when Easyship repeats the label event", async () => {
    await send(labelCreated);
    await send(labelCreated);
    expect(h.sendShippingEmail).toHaveBeenCalledTimes(1);
    expect(h.timeline.filter((t) => t.event_type === "order_shipped")).toHaveLength(1);
  });

  it("records an in-transit status without changing the order's state", async () => {
    await send(labelCreated);
    await send(tracking("In Transit to Customer"));
    expect(h.tables.orders).toMatchObject({ status: "shipped", shipping_tracking_status: "In Transit to Customer" });
    expect(h.tables.orders!.delivered_at).toBeNull();
  });

  it("marks the order delivered once, and never moves delivered_at", async () => {
    await send(labelCreated);
    const first = await send(tracking("Delivered"));
    expect(await first.json()).toMatchObject({ delivered: true });
    const deliveredAt = h.tables.orders!.delivered_at;
    expect(h.tables.orders).toMatchObject({ status: "delivered" });
    expect(deliveredAt).toBeTruthy();

    const again = await send(tracking("Delivered"));
    expect(await again.json()).toMatchObject({ delivered: false });
    expect(h.tables.orders!.delivered_at).toBe(deliveredAt);
  });

  it("acknowledges events for shipments it does not know", async () => {
    const res = await send({ ...labelCreated, data: { ...labelCreated.data, easyship_shipment_id: "OTHER" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: "no order for this shipment" });
  });
});
