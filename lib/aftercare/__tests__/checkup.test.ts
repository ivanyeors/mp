import { describe, expect, it } from "vitest";
import {
  addMonths,
  checkupBlock,
  checkupTemplate,
  checkupTiming,
  coveredLineByOrder,
  decideCheckupEmail,
  deliveredBefore,
  formatCheckupFee,
  isCheckupCovered,
  milestoneOfTemplate,
  parseCheckupSettings,
  planCheckupChannels,
  selectCheckupCandidates,
  type CheckupBookingRow,
  type CheckupLedgerRow,
  type CheckupOrderRow,
} from "@/lib/aftercare/checkup";
import { purchaseLine } from "@/lib/crm/purchase-lines";
import type { OrderLineRow } from "@/lib/readjustment/purchases";
import { decideAftercareWhatsApp } from "@/lib/whatsapp/aftercare-notify";

const NOW = new Date("2026-10-21T02:00:00.000Z");

describe("settings and the ledger key", () => {
  it("is off and yearly by default, and ignores a malformed period", () => {
    expect(parseCheckupSettings({})).toEqual({ enabled: false, months: 12 });
    expect(parseCheckupSettings({ checkup_reminders_enabled: "true", checkup_months: "6" })).toEqual({ enabled: true, months: 6 });
    for (const bad of ["0", "37", "1.5", "x", ""]) {
      expect(parseCheckupSettings({ checkup_months: bad }).months, bad).toBe(12);
    }
  });

  it("keys each milestone in months, once per Order", () => {
    expect(checkupTemplate(12)).toBe("aftercare.checkup_12m");
    expect(checkupTemplate(24)).toBe("aftercare.checkup_24m");
    expect(milestoneOfTemplate("aftercare.checkup_24m")).toBe(24);
    expect(milestoneOfTemplate("aftercare.review_request")).toBeNull();
  });
});

describe("the fee", () => {
  it("is stated as Costings gives it", () => {
    expect(formatCheckupFee({ msrp: 30, currency: "SGD" })).toBe("S$30");
    expect(formatCheckupFee({ msrp: 32.5, currency: "SGD" })).toBe("S$32.50");
    expect(formatCheckupFee({ msrp: 45, currency: "MYR" })).toBe("MYR 45");
  });

  it("is none to state when it is $0 or missing, and then nothing is sent", () => {
    expect(formatCheckupFee({ msrp: 0, currency: "SGD" })).toBeNull();
    expect(formatCheckupFee({ msrp: Number.NaN, currency: "SGD" })).toBeNull();
    expect(formatCheckupFee(null)).toBeNull();
    expect(checkupBlock({ enabled: true, months: 12 }, null)).toBe("no_fee");
    expect(checkupBlock({ enabled: false, months: 12 }, "S$30")).toBe("disabled");
    expect(checkupBlock({ enabled: true, months: 12 }, "S$30")).toBeNull();
  });
});

describe("checkupTiming", () => {
  const timing = (deliveredAt: string | null, now = NOW, months = 12) => checkupTiming({ deliveredAt, now, months });

  it("is due on the first run on or after delivery + 12 months", () => {
    expect(timing("2025-10-21T03:00:00.000Z")).toEqual({
      due: true,
      deliveredOn: "2025-10-21",
      milestoneMonths: 12,
      milestoneOn: "2026-10-21",
    });
    expect(timing("2025-10-15T03:00:00.000Z")).toMatchObject({ due: true, milestoneMonths: 12, milestoneOn: "2026-10-15" });
  });

  it("is too early the day before", () => {
    expect(timing("2025-10-22T03:00:00.000Z")).toEqual({ due: false, reason: "too_early" });
    expect(timing("2026-06-01T03:00:00.000Z")).toEqual({ due: false, reason: "too_early" });
  });

  it("counts Singapore days: delivered at 00:30 SGT on 22 Oct is not due on 21 Oct", () => {
    expect(timing("2025-10-21T16:30:00.000Z")).toEqual({ due: false, reason: "too_early" });
    expect(timing("2025-10-21T15:59:00.000Z")).toMatchObject({ due: true, deliveredOn: "2025-10-21" });
  });

  it("is not due when the Order was never marked delivered", () => {
    expect(timing(null)).toEqual({ due: false, reason: "not_delivered" });
    expect(timing("not a date")).toEqual({ due: false, reason: "not_delivered" });
  });

  it("comes again each year, and only the latest milestone is due", () => {
    expect(timing("2024-10-01T03:00:00.000Z")).toMatchObject({ due: true, milestoneMonths: 24, milestoneOn: "2026-10-01" });
    expect(timing("2024-11-30T03:00:00.000Z")).toMatchObject({ due: true, milestoneMonths: 12 });
    expect(timing("2025-10-01T03:00:00.000Z", NOW, 6)).toMatchObject({ due: true, milestoneMonths: 12 });
  });

  it("clamps a month end: delivered 31 Jan is due on 28 Feb a year and a month later", () => {
    expect(addMonths("2025-01-31", 1)).toBe("2025-02-28");
    expect(addMonths("2024-02-29", 12)).toBe("2025-02-28");
    const feb28 = new Date("2026-02-28T02:00:00.000Z");
    expect(timing("2025-01-31T03:00:00.000Z", feb28, 13)).toMatchObject({ due: true, milestoneOn: "2026-02-28" });
    expect(Date.parse("2025-01-31T03:00:00.000Z")).toBeLessThan(Date.parse(deliveredBefore({ now: feb28, months: 13 })));
  });
});

const PILLOWS = new Map([
  [1, { size: "M", kind: "premium" }],
  [2, { size: "M", kind: "basic" }],
  [3, { size: "M", kind: "mystery" }],
]);

const shopPillow = (id: string, pillowId: number): OrderLineRow => ({
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
const resultLine = (id: string, productType: "pillow" | "bolster", tier: string | null): OrderLineRow => ({
  id,
  kind: "goods",
  quantity: 1,
  product_title: "Custom",
  variant_title: null,
  image_url: null,
  customization_snapshot: { result_id: `r-${id}`, product_type: productType, assigned_tier: tier },
});

const viewRow = (orderId: string, line: OrderLineRow, units = 1) => {
  const row = purchaseLine(line, PILLOWS)!;
  return { order_id: orderId, order_item_id: line.id, product_type: row.product_type, tier: row.tier, units };
};

describe("coverage: Premium Mpillow only", () => {
  it("covers a Premium Mpillow, and not a Basic Mpillow, an Mbolster, an accessory or a pillow of unknown tier", () => {
    const accessory: OrderLineRow = { ...shopPillow("acc", 1), product_variants: { products: { product_type: "accessory" } } };
    expect(isCheckupCovered(viewRow("o", shopPillow("p", 1)))).toBe(true);
    expect(isCheckupCovered(viewRow("o", resultLine("r", "pillow", "premium")))).toBe(true);
    expect(isCheckupCovered(viewRow("o", shopPillow("b", 2)))).toBe(false);
    expect(isCheckupCovered(viewRow("o", resultLine("rb", "pillow", "basic")))).toBe(false);
    expect(isCheckupCovered(viewRow("o", bolster("mb")))).toBe(false);
    expect(isCheckupCovered(viewRow("o", resultLine("rmb", "bolster", null)))).toBe(false);
    expect(isCheckupCovered(viewRow("o", shopPillow("u", 3)))).toBe(false);
    expect(isCheckupCovered(viewRow("o", shopPillow("u2", 99)))).toBe(false);
    expect(isCheckupCovered(viewRow("o", resultLine("ru", "pillow", null)))).toBe(false);
    expect(isCheckupCovered(viewRow("o", accessory))).toBe(false);
  });

  it("does not cover a Premium Mpillow that was returned", () => {
    expect(isCheckupCovered(viewRow("o", shopPillow("p", 1), 0))).toBe(false);
  });

  it("gives an Order with a Premium Mpillow and other lines one check-up, for the Premium line — a Paired build too", () => {
    const covered = coveredLineByOrder([
      viewRow("basic-only", shopPillow("b1", 2)),
      viewRow("bolster-only", bolster("mb1")),
      viewRow("unknown-only", shopPillow("u1", 3)),
      viewRow("mixed", shopPillow("m-basic", 2)),
      viewRow("mixed", bolster("m-bolster")),
      viewRow("mixed", shopPillow("m-premium", 1)),
      viewRow("paired", resultLine("pair-bolster", "bolster", null)),
      viewRow("paired", resultLine("pair-pillow", "pillow", "premium")),
    ]);
    expect([...covered.entries()]).toEqual([
      ["mixed", "m-premium"],
      ["paired", "pair-pillow"],
    ]);
  });
});

const order = (id: string, customerId: string, over: Partial<CheckupOrderRow> = {}): CheckupOrderRow => ({
  id,
  order_number: `MP-${id}`,
  customer_id: customerId,
  email: `${customerId}@order.test`,
  status: "delivered",
  paid_at: "2025-10-01T02:00:00.000Z",
  delivered_at: "2025-10-10T02:00:00.000Z",
  ...over,
});
const ledgerRow = (over: Partial<CheckupLedgerRow> & Pick<CheckupLedgerRow, "customer_id" | "entity_id">): CheckupLedgerRow => ({
  channel: "email",
  template: "aftercare.checkup_12m",
  status: "sent",
  attempts: 1,
  sent_at: "2026-10-12T02:00:00.000Z",
  created_at: "2026-10-12T02:00:00.000Z",
  ...over,
});

const select = (input: {
  orders: CheckupOrderRow[];
  ledger?: CheckupLedgerRow[];
  bookings?: CheckupBookingRow[];
  covered?: Map<string, string>;
}) =>
  selectCheckupCandidates({
    orders: input.orders,
    covered: input.covered ?? new Map(input.orders.map((o) => [o.id, `${o.id}-premium`])),
    ledger: input.ledger ?? [],
    bookings: input.bookings ?? [],
    now: NOW,
    months: 12,
    maxEmailAttempts: 3,
  });

describe("selectCheckupCandidates", () => {
  it("is due on time, for the covered line, and not for an Order never delivered or not yet a year old", () => {
    const out = select({
      orders: [
        order("on-time", "ann"),
        order("never-delivered", "ben", { delivered_at: null }),
        order("too-early", "cat", { delivered_at: "2026-01-10T02:00:00.000Z" }),
      ],
    });
    expect(out.due.map((c) => [c.order.id, c.orderItemId, c.template])).toEqual([
      ["on-time", "on-time-premium", "aftercare.checkup_12m"],
    ]);
    expect(out.skipped).toEqual({ readjusted_recently: 0, reminded_recently: 0 });
  });

  it("covers nothing that is not a Premium Mpillow, and no Order whose money went back", () => {
    const out = select({
      orders: [order("basic", "ann"), order("refunded", "ben", { status: "refunded" }), order("unpaid", "cat", { paid_at: null })],
      covered: new Map([
        ["refunded", "x"],
        ["unpaid", "y"],
      ]),
    });
    expect(out.due).toEqual([]);
  });

  it("skips a Customer who booked or attended a re-adjustment within the previous 12 months", () => {
    const orders = [order("o1", "ann"), order("o2", "ben"), order("o3", "cat"), order("o4", "dan"), order("o5", "eve")];
    const out = select({
      orders,
      bookings: [
        { customer_id: "ann", status: "attended", start_at: "2026-03-01T02:00:00.000Z" },
        { customer_id: "ben", status: "booked", start_at: "2026-11-02T02:00:00.000Z" },
        { customer_id: "cat", status: "attended", start_at: "2025-10-20T02:00:00.000Z" },
        { customer_id: "dan", status: "cancelled", start_at: "2026-09-01T02:00:00.000Z" },
        { customer_id: "eve", status: "no_show", start_at: "2026-09-01T02:00:00.000Z" },
      ],
    });
    expect(out.due.map((c) => c.customerId)).toEqual(["cat", "dan", "eve"]);
    expect(out.skipped.readjusted_recently).toBe(2);
  });

  it("goes once per milestone per Order: a milestone either ledger holds is done", () => {
    const out = select({
      orders: [order("o1", "ann"), order("o2", "ben"), order("o3", "cat")],
      ledger: [
        ledgerRow({ customer_id: "ann", entity_id: "o1" }),
        ledgerRow({ customer_id: "ben", entity_id: "o2", channel: "whatsapp", status: "failed", sent_at: null }),
        ledgerRow({ customer_id: "cat", entity_id: "o3", template: "aftercare.checkup_6m", sent_at: "2025-04-10T02:00:00.000Z" }),
      ],
    });
    expect(out.due.map((c) => c.order.id)).toEqual(["o3"]);
    expect(out.retries).toEqual([]);
  });

  it("retries a failed email while it has attempts left, and never a third failure", () => {
    const out = select({
      orders: [order("o1", "ann"), order("o2", "ben"), order("o3", "cat")],
      ledger: [
        ledgerRow({ customer_id: "ann", entity_id: "o1", status: "failed", attempts: 2, sent_at: null }),
        ledgerRow({ customer_id: "ben", entity_id: "o2", status: "failed", attempts: 3, sent_at: null }),
        ledgerRow({ customer_id: "cat", entity_id: "o3", status: "failed", attempts: 1, sent_at: null }),
      ],
      bookings: [{ customer_id: "cat", status: "booked", start_at: "2026-10-25T02:00:00.000Z" }],
    });
    expect(out.retries.map((c) => c.order.id)).toEqual(["o1"]);
    expect(out.due).toEqual([]);
  });

  it("reminds a Customer at most once a period, whatever they own: the most overdue Order goes", () => {
    const out = select({
      orders: [
        order("newer", "ann", { delivered_at: "2025-10-15T02:00:00.000Z" }),
        order("older", "ann", { delivered_at: "2025-10-05T02:00:00.000Z" }),
        order("b1", "ben"),
      ],
      ledger: [
        ledgerRow({ customer_id: "ben", entity_id: "b0", sent_at: "2026-06-01T02:00:00.000Z", created_at: "2026-06-01T02:00:00.000Z" }),
      ],
    });
    expect(out.due.map((c) => c.order.id)).toEqual(["older"]);
    expect(out.skipped.reminded_recently).toBe(2);
  });

  it("never holds an Order back for its own last milestone, sent a year ago to the day", () => {
    const out = select({
      orders: [order("o1", "ann", { delivered_at: "2024-10-21T02:00:00.000Z" })],
      ledger: [
        ledgerRow({ customer_id: "ann", entity_id: "o1", sent_at: "2025-10-21T02:00:00.000Z", created_at: "2025-10-21T02:00:00.000Z" }),
      ],
    });
    expect(out.due.map((c) => c.template)).toEqual(["aftercare.checkup_24m"]);
    expect(out.skipped.reminded_recently).toBe(0);
  });

  it("does not count a reminder that reached nobody, or one before the period", () => {
    const out = select({
      orders: [order("a1", "ann"), order("b1", "ben")],
      ledger: [
        ledgerRow({ customer_id: "ann", entity_id: "a0", channel: "whatsapp", status: "failed", sent_at: null }),
        ledgerRow({ customer_id: "ben", entity_id: "b0", sent_at: "2025-09-01T02:00:00.000Z" }),
      ],
    });
    expect(out.due.map((c) => c.order.id)).toEqual(["a1", "b1"]);
  });
});

describe("the channels", () => {
  const allowAll = () => true;
  const email = (optedIn: boolean | null, marketingEmail: string | null, to: string | null = "ann@x.test") =>
    decideCheckupEmail({ optedIn, marketingEmail, email: to, allowed: allowAll });
  const whatsapp = (optedIn: boolean) =>
    decideAftercareWhatsApp({
      templateName: "aftercare_checkup",
      optedIn,
      stopRequested: false,
      phone: "9123 4567",
      nonProdAllowed: allowAll,
    });

  it("emails only with Marketing consent, and still WhatsApps a Customer who opted in", () => {
    expect(email(true, "not_subscribed")).toEqual({ send: false, skip: "no_marketing_consent" });
    expect(email(true, "unsubscribed")).toEqual({ send: false, skip: "no_marketing_consent" });
    expect(email(true, "subscribed")).toEqual({ send: true, to: "ann@x.test" });
    const plan = planCheckupChannels(email(true, "not_subscribed"), whatsapp(true));
    expect(plan).toMatchObject({ email: { send: false }, whatsapp: { send: true }, any: true });
  });

  it("honours each channel's own switch", () => {
    expect(email(false, "subscribed")).toEqual({ send: false, skip: "opted_out" });
    expect(email(null, "subscribed")).toEqual({ send: true, to: "ann@x.test" });
    expect(whatsapp(false)).toEqual({ send: false, skip: "opted_out" });
    expect(planCheckupChannels(email(false, "subscribed"), whatsapp(true))).toMatchObject({ email: { send: false }, whatsapp: { send: true } });
    expect(planCheckupChannels(email(true, "subscribed"), whatsapp(false))).toMatchObject({ email: { send: true }, whatsapp: { send: false } });
    expect(planCheckupChannels(email(false, "subscribed"), whatsapp(false)).any).toBe(false);
  });

  it("keeps the Aftercare email rules: an address, and the allowlist outside production", () => {
    expect(email(true, "subscribed", null)).toEqual({ send: false, skip: "no_email" });
    expect(decideCheckupEmail({ optedIn: true, marketingEmail: "subscribed", email: "ann@x.test", allowed: () => false })).toEqual({
      send: false,
      skip: "not_allowed_outside_production",
    });
  });
});
