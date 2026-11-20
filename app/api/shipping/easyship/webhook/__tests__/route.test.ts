import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown> | null>,
  updates: [] as Array<{ table: string; row: Record<string, unknown> }>,
  timeline: [] as Array<Record<string, unknown>>,
  sendShippingEmail: vi.fn(),
  sendTrackingEmail: vi.fn(),
}));

vi.mock("@/lib/email", () => ({ sendShippingEmail: h.sendShippingEmail, sendTrackingEmail: h.sendTrackingEmail }));
vi.mock("@/lib/supabase/server", () => ({
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

const { DEFAULT_SETTINGS } = await import("@/lib/easyship/schema");
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
  h.sendTrackingEmail.mockReset();
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

  it("stores the label and tracking, and leaves the order unshipped until the courier collects it", async () => {
    const res = await send(labelCreated);
    expect(res.status).toBe(200);
    expect(h.tables.orders).toMatchObject({
      status: "confirmed",
      shipped_at: null,
      tracking_number: "NV123",
      tracking_url: "https://track.test/ESSG1",
    });
    expect(h.tables.orders).not.toHaveProperty("label_url");
    expect(h.tables.order_shipments).toMatchObject({
      easyship_shipment_id: "ESSG1",
      label_url: "https://labels.test/ESSG1.pdf",
      courier_service_id: "cs_ninja",
    });
    expect(h.sendShippingEmail).not.toHaveBeenCalled();
  });

  it("ships the order and emails the customer at the courier's first scan, once for both events of that scan", async () => {
    await send(labelCreated);
    const first = await send(tracking("In Transit to Customer"));
    expect(await first.json()).toMatchObject({ shipped: true });
    await send({
      event_type: "shipment.tracking.checkpoints.created",
      resource_id: "ESSG1",
      data: { easyship_shipment_id: "ESSG1", status: "In Transit to Customer", checkpoints: [{ message: "Picked up" }] },
    });
    expect(h.tables.orders).toMatchObject({
      status: "shipped",
      tracking_number: "NV123",
      shipping_tracking_status: "In Transit to Customer",
    });
    expect(h.tables.orders!.shipped_at).toBeTruthy();
    expect(h.tables.orders!.delivered_at).toBeNull();
    expect(h.sendShippingEmail).toHaveBeenCalledTimes(1);
    expect(h.timeline.filter((t) => t.event_type === "order_shipped")).toHaveLength(1);
  });

  it("does not ship on a status from before pickup", async () => {
    await send(labelCreated);
    for (const status of ["Info Received", "Pending", "Exception"]) {
      const res = await send(tracking(status));
      expect(await res.json()).toMatchObject({ shipped: false });
    }
    expect(h.tables.orders).toMatchObject({ status: "confirmed", shipped_at: null });
    expect(h.sendShippingEmail).not.toHaveBeenCalled();
  });

  it("sends no separate in-transit email for the scan that shipped it", async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      tracking_email: { ...DEFAULT_SETTINGS.tracking_email, allowed_statuses: ["in_transit", "out_for_delivery"] },
    };
    h.tables.api_configs = { slug: "easyship", config: { settings } };
    await send(labelCreated);
    await send(tracking("In Transit to Customer"));
    expect(h.sendShippingEmail).toHaveBeenCalledTimes(1);
    expect(h.sendTrackingEmail).not.toHaveBeenCalled();
    await send(tracking("Out for Delivery"));
    expect(h.sendTrackingEmail.mock.calls.map((c) => c[1])).toEqual(["out_for_delivery"]);
  });

  it("ships, then delivers, a parcel whose first scan is its delivery", async () => {
    await send(labelCreated);
    const res = await send(tracking("Delivered"));
    expect(await res.json()).toMatchObject({ shipped: true, delivered: true });
    expect(h.tables.orders).toMatchObject({ status: "delivered" });
    expect(h.tables.orders!.shipped_at).toBeTruthy();
    expect(h.timeline.map((t) => t.event_type)).toEqual(["order_shipped", "order_delivered"]);
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

  it("emails a status update in our template only for the ticked statuses", async () => {
    const settings = { ...DEFAULT_SETTINGS, tracking_email: { ...DEFAULT_SETTINGS.tracking_email, allowed_statuses: ["out_for_delivery"] } };
    h.tables.api_configs = { slug: "easyship", config: { settings } };
    await send(labelCreated);
    await send(tracking("Out for Delivery"));
    expect(h.sendTrackingEmail).toHaveBeenCalledWith("order-1", "out_for_delivery", expect.objectContaining({ order_number: "MP-1" }), expect.anything(), null);
    await send(tracking("Delivered"));
    expect(h.sendTrackingEmail).toHaveBeenCalledTimes(1);
  });

  it("sends no status email to a cancelled order, nor a stale one after delivery", async () => {
    const settings = { ...DEFAULT_SETTINGS, tracking_email: { ...DEFAULT_SETTINGS.tracking_email, allowed_statuses: ["out_for_delivery", "delivered"] } };
    h.tables.api_configs = { slug: "easyship", config: { settings } };
    await send(labelCreated);
    await send(tracking("Delivered"));
    await send(tracking("Out for Delivery"));
    expect(h.sendTrackingEmail.mock.calls.map((c) => c[1])).toEqual(["delivered"]);
    h.tables.orders = { ...h.tables.orders!, status: "cancelled", delivered_at: null };
    await send(tracking("Out for Delivery"));
    expect(h.sendTrackingEmail).toHaveBeenCalledTimes(1);
  });

  it("sends a problem email from the checkpoint event, with its checkpoint, when that event is subscribed", async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      webhook: { ...DEFAULT_SETTINGS.webhook, enabled: true },
      tracking_email: { ...DEFAULT_SETTINGS.tracking_email, allowed_statuses: ["exception"] },
    };
    h.tables.api_configs = { slug: "easyship", config: { settings } };
    await send(labelCreated);
    await send(tracking("Exception"));
    expect(h.sendTrackingEmail).not.toHaveBeenCalled();
    await send({
      event_type: "shipment.tracking.checkpoints.created",
      resource_id: "ESSG1",
      data: { easyship_shipment_id: "ESSG1", status: "Exception", checkpoints: [{ message: "Held at customs", location: "SG" }] },
    });
    expect(h.sendTrackingEmail).toHaveBeenCalledWith("order-1", "exception", expect.anything(), expect.anything(), "Held at customs — SG");
  });

  it("acknowledges events for shipments it does not know", async () => {
    const res = await send({ ...labelCreated, data: { ...labelCreated.data, easyship_shipment_id: "OTHER" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: "no order for this shipment" });
  });
});
