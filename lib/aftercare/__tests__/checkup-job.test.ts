import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailTransport, OutgoingEmail } from "@/lib/email/types";
import { purchaseLine } from "@/lib/crm/purchase-lines";
import type { OrderLineRow } from "@/lib/readjustment/purchases";
import { reviewFakeDb, type ReviewFakeDb } from "./review-request-fake-db";

const h = vi.hoisted(() => ({
  whatsapp: [] as Array<{ to: string; template: string; params: string[]; urlButtonParam?: string }>,
}));

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/appointments/whatsapp", async (orig) => ({
  ...(await orig<typeof import("@/lib/appointments/whatsapp")>()),
  sendTemplateMessage: async (to: string, template: string, params: string[], opts?: { urlButtonParam?: string }) => {
    h.whatsapp.push({ to, template, params, urlButtonParam: opts?.urlButtonParam });
    return `wamid.${h.whatsapp.length}`;
  },
}));

const { runCheckups } = await import("@/lib/aftercare/checkup-server");
const { runAftercareMessages } = await import("@/lib/aftercare/job");
const { setEmailTransport } = await import("@/lib/email");

const NOW = new Date("2026-10-21T02:00:00.000Z");
const ORIGIN = "https://custom.mpillow.test";
const SUPPORT = "support@mpillow.test";

const ENV_KEYS = [
  "VERCEL_ENV",
  "AFTERCARE_EMAIL_ALLOWLIST",
  "WHATSAPP_ALLOWLIST",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_TOKEN",
  "WHATSAPP_TEMPLATE_AFTERCARE_CHECKUP",
  "SUPPORT_EMAIL",
] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  setEmailTransport(null);
});

let emails: OutgoingEmail[];
let emailFails: boolean;
const transport: EmailTransport = {
  name: "fake",
  async send(email) {
    if (emailFails) throw new Error("smtp down");
    emails.push(email);
    return { id: `m${emails.length}` };
  },
};

type Row = Record<string, unknown>;
let db: ReviewFakeDb;
let admin: ReturnType<typeof reviewFakeDb>;

const PILLOWS = new Map([
  [1, { size: "M", kind: "premium" }],
  [2, { size: "M", kind: "basic" }],
  [3, { size: "M", kind: "unknown" }],
]);
const shop = (id: string, pillowId: number): OrderLineRow => ({
  id,
  kind: "goods",
  quantity: 1,
  product_title: "Mpillow",
  variant_title: "Size M",
  image_url: null,
  product_variants: { option1: null, price_key: null, pillow_product_id: pillowId, products: { product_type: "pillow" } },
});
const bolster = (id: string): OrderLineRow => ({
  id,
  kind: "goods",
  quantity: 1,
  product_title: "Mbolster",
  variant_title: "Long",
  image_url: null,
  product_variants: { option1: "Long", price_key: "product:bolster:long", products: { product_type: "bolster" } },
});
const result = (id: string, productType: "pillow" | "bolster", tier: string | null): OrderLineRow => ({
  id,
  kind: "goods",
  quantity: 1,
  product_title: "Custom",
  variant_title: null,
  image_url: null,
  customization_snapshot: { result_id: `r-${id}`, product_type: productType, assigned_tier: tier },
});

const ORDERS: Array<{ id: string; customer: string; lines: OrderLineRow[]; over?: Row }> = [
  { id: "o-ann", customer: "ann", lines: [shop("ann-basic", 2), bolster("ann-bolster"), shop("ann-premium", 1)] },
  { id: "o-ben", customer: "ben", lines: [result("ben-premium", "pillow", "premium")] },
  { id: "o-cat", customer: "cat", lines: [shop("cat-basic", 2)] },
  { id: "o-dan", customer: "dan", lines: [bolster("dan-bolster")] },
  { id: "o-eve", customer: "eve", lines: [shop("eve-unknown", 3), result("eve-unknown-2", "pillow", null)] },
  { id: "o-fay", customer: "fay", lines: [shop("fay-premium", 1)] },
  { id: "o-gus", customer: "gus", lines: [shop("gus-premium", 1)], over: { delivered_at: null } },
  { id: "o-hal", customer: "hal", lines: [shop("hal-premium", 1)] },
  { id: "o-jo", customer: "jo", lines: [result("jo-bolster", "bolster", null), result("jo-pillow", "pillow", "premium")] },
  { id: "o-kim", customer: "kim", lines: [shop("kim-premium", 1)], over: { delivered_at: "2026-06-01T02:00:00.000Z" } },
  { id: "o-lee", customer: "lee", lines: [{ ...shop("lee-premium", 1), returned_quantity: 1 }] },
];

const customer = (id: string, over: Row = {}): Row => ({
  id,
  email: `${id}@x.test`,
  first_name: id.charAt(0).toUpperCase() + id.slice(1),
  phone: null,
  aftercare_email: true,
  aftercare_whatsapp: false,
  marketing_email: "subscribed",
  ...over,
});

const settings = (over: Record<string, string> = {}): Row[] =>
  Object.entries({ checkup_reminders_enabled: "true", checkup_months: "12", ...over }).map(([key, value]) => ({ key, value }));

const prices = (readjustment: number | null): Row[] => [
  { key: "measurement_premium", msrp: 40, cost_price: null, currency: "SGD" },
  { key: "measurement_basic", msrp: 20, cost_price: null, currency: "SGD" },
  ...(readjustment === null ? [] : [{ key: "readjustment", msrp: readjustment, cost_price: null, currency: "SGD" }]),
];

beforeEach(() => {
  process.env.VERCEL_ENV = "production";
  delete process.env.AFTERCARE_EMAIL_ALLOWLIST;
  delete process.env.WHATSAPP_ALLOWLIST;
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
  process.env.WHATSAPP_TOKEN = "token";
  process.env.WHATSAPP_TEMPLATE_AFTERCARE_CHECKUP = "aftercare_checkup";
  process.env.SUPPORT_EMAIL = SUPPORT;
  emails = [];
  emailFails = false;
  h.whatsapp = [];
  setEmailTransport(transport);

  db = {
    site_settings: settings(),
    service_prices: prices(30),
    customers: [
      customer("ann"),
      customer("ben", { marketing_email: "not_subscribed", phone: "9123 4567", aftercare_whatsapp: true }),
      customer("cat"),
      customer("dan"),
      customer("eve"),
      customer("fay"),
      customer("gus"),
      customer("hal", { marketing_email: "unsubscribed" }),
      customer("jo"),
      customer("kim"),
      customer("lee"),
    ],
    orders: ORDERS.map((o) => ({
      id: o.id,
      order_number: `MP-${o.id.slice(2).toUpperCase()}`,
      customer_id: o.customer,
      email: `${o.customer}@order.test`,
      status: "delivered",
      paid_at: "2025-09-20T02:00:00.000Z",
      delivered_at: "2025-10-10T02:00:00.000Z",
      ...o.over,
    })),
    customer_purchase_lines: ORDERS.flatMap((o) =>
      o.lines.map((l) => ({ customer_id: o.customer, order_id: o.id, order_item_id: l.id, ...purchaseLine(l, PILLOWS) })),
    ),
    order_items: ORDERS.flatMap((o) =>
      o.lines.map((l) => ({ id: l.id, order_id: o.id, quantity: l.quantity, returned_quantity: l.returned_quantity ?? 0 })),
    ),
    readjustment_bookings: [
      { customer_id: "fay", status: "attended", start_at: "2026-05-02T02:00:00.000Z", created_at: "2026-04-20T02:00:00.000Z" },
    ],
    customer_preference_events: [
      { customer_id: "ben", preference: "aftercare_whatsapp", to_value: true, created_at: "2026-09-01T00:00:00.000Z" },
    ],
    whatsapp_inbound: [],
  };
  admin = reviewFakeDb(db);
});

const run = (opts: { dryRun?: boolean; now?: Date } = {}) =>
  runCheckups(admin, { origin: ORIGIN, now: opts.now ?? NOW, dryRun: opts.dryRun });
const emailTo = () => emails.map((e) => e.to).sort();
const waTo = () => h.whatsapp.map((m) => m.to).sort();
const ledgerKeys = (table: "customer_emails" | "customer_whatsapp") =>
  (db[table] ?? []).map((r) => `${r.customer_id}|${r.template}|${r.entity_id}|${r.status}`).sort();

describe("who gets a check-up, and how", () => {
  it("sends each due Premium Mpillow owner one, on the channels they agreed to", async () => {
    const report = await run();
    expect(emailTo()).toEqual(["ann@order.test", "jo@order.test"]);
    expect(waTo()).toEqual(["+6591234567"]);
    expect(report).toMatchObject({
      enabled: true,
      blocked: null,
      fee: "S$30",
      candidates: 4,
      reachable: 3,
      sent: { email: 2, whatsapp: 1 },
      failed: { email: 0, whatsapp: 0 },
      skipped: { readjusted_recently: 1, reminded_recently: 0, no_channel: 1, not_marked_delivered: 1 },
      emailSkipped: { no_marketing_consent: 2 },
      whatsappSkipped: { opted_out: 3 },
    });
    expect(ledgerKeys("customer_emails")).toEqual([
      "ann|aftercare.checkup_12m|o-ann|sent",
      "jo|aftercare.checkup_12m|o-jo|sent",
    ]);
    expect(ledgerKeys("customer_whatsapp")).toEqual(["ben|aftercare.checkup_12m|o-ben|sent"]);
  });

  it("gives a Basic Mpillow, an Mbolster, a pillow of unknown tier and a returned one nothing; a Premium Mpillow bought alongside them gets one", async () => {
    await run();
    const reached = new Set([...(db.customer_emails ?? []), ...(db.customer_whatsapp ?? [])].map((r) => r.customer_id));
    for (const id of ["cat", "dan", "eve", "lee", "kim"]) expect(reached.has(id), id).toBe(false);
    const ann = emails.find((e) => e.to === "ann@order.test")!;
    expect(ann.text).toContain(`${ORIGIN}/en-US/appointments?type=readjustment&item=ann-premium`);
    expect(ann.text).not.toMatch(/Basic Mpillow|Mbolster/);
    expect(emails.filter((e) => e.to === "jo@order.test")).toHaveLength(1);
    expect(emails.find((e) => e.to === "jo@order.test")!.text).toContain("item=jo-pillow");
  });

  it("skips a Customer who re-adjusted within the period, and one never marked delivered, and counts them", async () => {
    const report = await run();
    expect(emailTo()).not.toContain("fay@order.test");
    expect(emailTo()).not.toContain("gus@order.test");
    expect(report.skipped).toMatchObject({ readjusted_recently: 1, not_marked_delivered: 1 });
  });
});

describe("Marketing consent: the email needs it, WhatsApp does not", () => {
  it("emails nobody whose Marketing consent is not subscribed; Ben, who opted in to WhatsApp, still gets that", async () => {
    await run();
    expect(emailTo()).not.toContain("ben@order.test");
    expect(emailTo()).not.toContain("hal@order.test");
    expect(h.whatsapp.map((m) => m.to)).toEqual(["+6591234567"]);
    expect(ledgerKeys("customer_emails").some((k) => k.startsWith("ben|") || k.startsWith("hal|"))).toBe(false);
  });

  it("emails a Customer who is subscribed, beside their WhatsApp", async () => {
    db.customers!.find((c) => c.id === "ben")!.marketing_email = "subscribed";
    await run();
    expect(emailTo()).toContain("ben@order.test");
    expect(waTo()).toEqual(["+6591234567"]);
  });

  it("honours each channel's own switch, whatever the consent", async () => {
    Object.assign(db.customers!.find((c) => c.id === "ann")!, { aftercare_email: false });
    Object.assign(db.customers!.find((c) => c.id === "ben")!, { aftercare_whatsapp: false });
    const report = await run();
    expect(emailTo()).toEqual(["jo@order.test"]);
    expect(h.whatsapp).toEqual([]);
    expect(report.emailSkipped).toMatchObject({ opted_out: 1 });
  });
});

describe("at most once per milestone per Order, per channel", () => {
  it("across concurrent runs and re-runs, through the two ledgers", async () => {
    const reports = await Promise.all([run(), run(), run()]);
    expect(emailTo()).toEqual(["ann@order.test", "jo@order.test"]);
    expect(h.whatsapp).toHaveLength(1);
    expect(reports.reduce((n, r) => n + r.sent.email + r.sent.whatsapp, 0)).toBe(3);
    expect(ledgerKeys("customer_emails")).toHaveLength(2);
    expect(ledgerKeys("customer_whatsapp")).toHaveLength(1);

    const tomorrow = await run({ now: new Date("2026-10-22T02:00:00.000Z") });
    expect(tomorrow.candidates).toBe(1);
    expect(emails).toHaveLength(2);
    expect(h.whatsapp).toHaveLength(1);
  });

  it("comes again at the next milestone, a year later to the day, under its own key", async () => {
    await run();
    const nextYear = new Date("2027-10-21T02:00:00.000Z");
    await run({ now: nextYear });
    expect(ledgerKeys("customer_emails")).toEqual([
      "ann|aftercare.checkup_12m|o-ann|sent",
      "ann|aftercare.checkup_24m|o-ann|sent",
      "fay|aftercare.checkup_24m|o-fay|sent",
      "jo|aftercare.checkup_12m|o-jo|sent",
      "jo|aftercare.checkup_24m|o-jo|sent",
      "kim|aftercare.checkup_12m|o-kim|sent",
    ]);
    expect(ledgerKeys("customer_whatsapp")).toEqual([
      "ben|aftercare.checkup_12m|o-ben|sent",
      "ben|aftercare.checkup_24m|o-ben|sent",
    ]);
  });

  it("retries a failed email on a later run, up to 3 attempts, and never re-sends WhatsApp", async () => {
    emailFails = true;
    const first = await run();
    expect(first.failed.email).toBe(2);
    emailFails = false;
    const second = await run({ now: new Date("2026-10-22T02:00:00.000Z") });
    expect(second).toMatchObject({ retried: 2, sent: { email: 2, whatsapp: 0 } });
    expect(emailTo()).toEqual(["ann@order.test", "jo@order.test"]);
    expect(h.whatsapp).toHaveLength(1);
    expect((await run({ now: new Date("2026-10-23T02:00:00.000Z") })).retried).toBe(0);

    emailFails = true;
    db.customer_emails = [];
    for (let i = 0; i < 4; i++) await run({ now: new Date(`2026-10-2${4 + i}T02:00:00.000Z`) });
    expect((db.customer_emails ?? []).map((r) => r.attempts)).toEqual([3, 3]);
  });
});

describe("the fee, from Costings at send time", () => {
  it("is stated in the email and the WhatsApp parameters", async () => {
    await run();
    const ann = emails.find((e) => e.to === "ann@order.test")!;
    expect(ann.text).toContain("A re-adjustment is a paid visit: S$30, paid when you book.");
    expect(ann.replyTo).toBe(SUPPORT);
    expect(h.whatsapp[0]).toEqual({
      to: "+6591234567",
      template: "aftercare_checkup",
      params: ["Ben", "Premium Mpillow", "#MP-BEN", "S$30", "+65 8780 5311"],
      urlButtonParam: "ben-premium",
    });
  });

  it("changing the price in Costings changes the next message", async () => {
    db.service_prices = prices(35);
    await run();
    expect(emails.find((e) => e.to === "ann@order.test")!.text).toContain("paid visit: S$35,");
    expect(h.whatsapp[0].params[3]).toBe("S$35");
  });

  it.each([
    ["a failed price read", () => (db.service_prices = prices(null))],
    ["a fee of $0", () => (db.service_prices = prices(0))],
  ])("%s sends nothing that day", async (_label, setUp) => {
    setUp();
    const report = await run();
    expect(report).toMatchObject({ blocked: "no_fee", fee: null, candidates: 4, sent: { email: 0, whatsapp: 0 } });
    expect(report.feeError).toBeTruthy();
    expect(emails).toEqual([]);
    expect(h.whatsapp).toEqual([]);
    expect(db.customer_emails ?? []).toEqual([]);
    expect(db.customer_whatsapp ?? []).toEqual([]);
  });
});

describe("switched off", () => {
  it("reports the candidates and sends nothing, and is off with no settings at all", async () => {
    db.site_settings = settings({ checkup_reminders_enabled: "false" });
    const report = await run();
    expect(report).toMatchObject({ blocked: "disabled", candidates: 4, reachable: 3, sent: { email: 0, whatsapp: 0 } });
    expect(emails).toEqual([]);
    expect(h.whatsapp).toEqual([]);
    db.site_settings = [];
    expect((await run()).blocked).toBe("disabled");
  });

  it("outside production, emails only the allowlist", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.AFTERCARE_EMAIL_ALLOWLIST = "jo@order.test";
    process.env.WHATSAPP_ALLOWLIST = "+6588887777";
    const report = await run();
    expect(emailTo()).toEqual(["jo@order.test"]);
    expect(h.whatsapp).toEqual([]);
    expect(report.emailSkipped).toEqual({ not_allowed_outside_production: 3 });
  });
});

describe("the daily chain", () => {
  it("runs the check-up beside the review request, each reporting on its own", async () => {
    const out = await runAftercareMessages(admin, { origin: ORIGIN, now: NOW });
    expect(out.checkups).toMatchObject({ sent: { email: 2, whatsapp: 1 } });
    expect(out.reviewRequests).toMatchObject({ blocked: "disabled" });
  });
});
