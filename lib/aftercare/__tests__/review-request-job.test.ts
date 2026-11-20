import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailTransport, OutgoingEmail } from "@/lib/email/types";
import { reviewFakeDb, type ReviewFakeDb } from "./review-request-fake-db";

const h = vi.hoisted(() => ({
  whatsapp: [] as Array<{ to: string; template: string; params: string[]; urlButtonParam?: string }>,
  whatsappFails: false,
}));

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/appointments/whatsapp", async (orig) => ({
  ...(await orig<typeof import("@/lib/appointments/whatsapp")>()),
  sendTemplateMessage: async (to: string, template: string, params: string[], opts?: { urlButtonParam?: string }) => {
    if (h.whatsappFails) throw new Error("Meta said no");
    h.whatsapp.push({ to, template, params, urlButtonParam: opts?.urlButtonParam });
    return `wamid.${h.whatsapp.length}`;
  },
}));

const { runReviewRequests } = await import("@/lib/aftercare/review-request-server");
const { hashReviewToken } = await import("@/lib/aftercare/review-link");
const { setEmailTransport } = await import("@/lib/email");
const realSources = await import("@/lib/crm/telegram-update-sources");

const NOW = new Date("2026-10-20T02:00:00.000Z");
const ORIGIN = "https://custom.mpillow.test";
const SUPPORT = "support@mpillow.test";

const ENV_KEYS = [
  "VERCEL_ENV",
  "AFTERCARE_EMAIL_ALLOWLIST",
  "WHATSAPP_ALLOWLIST",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_TOKEN",
  "WHATSAPP_TEMPLATE_AFTERCARE_REVIEW",
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

const premiumLine = (id: string) => ({
  id,
  kind: "goods",
  quantity: 1,
  product_title: "Mpillow",
  variant_title: "Size M",
  image_url: null,
  customization_snapshot: null,
  product_variants: { option1: null, price_key: null, pillow_product_id: 1, products: { product_type: "pillow" } },
});

const order = (id: string, customerId: string | null, o: Row = {}): Row => ({
  id,
  order_number: `MP-20261001-${id}`,
  customer_id: customerId,
  email: `${customerId}@order.test`,
  status: "delivered",
  paid_at: "2026-09-15T02:00:00.000Z",
  delivered_at: "2026-10-01T02:00:00.000Z",
  order_items: [premiumLine(`${id}-1`)],
  ...o,
});

const settings = (over: Record<string, string> = {}): Row[] =>
  Object.entries({
    review_requests_enabled: "true",
    review_request_days_after: "14",
    review_request_max_age_days: "60",
    google_review_url: "https://g.page/r/CfdGhvgB1hwUEBM/review",
    ...over,
  }).map(([key, value]) => ({ key, value }));

beforeEach(() => {
  process.env.VERCEL_ENV = "production";
  delete process.env.AFTERCARE_EMAIL_ALLOWLIST;
  delete process.env.WHATSAPP_ALLOWLIST;
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
  process.env.WHATSAPP_TOKEN = "token";
  process.env.WHATSAPP_TEMPLATE_AFTERCARE_REVIEW = "aftercare_review_request";
  process.env.SUPPORT_EMAIL = SUPPORT;
  emails = [];
  emailFails = false;
  h.whatsapp = [];
  h.whatsappFails = false;
  setEmailTransport(transport);

  db = {
    site_settings: settings(),
    pillow_products: [{ id: 1, size: "M", kind: "premium" }],
    customers: [
      { id: "ann", email: "ann@x.test", first_name: "Ann", phone: null, aftercare_email: true, aftercare_whatsapp: false },
      { id: "ben", email: "ben@x.test", first_name: "Ben", phone: "9123 4567", aftercare_email: false, aftercare_whatsapp: true },
      { id: "cat", email: "cat@x.test", first_name: "Cat", phone: null, aftercare_email: false, aftercare_whatsapp: false },
      { id: "dan", email: "dan@x.test", first_name: "Dan", phone: null, aftercare_email: true, aftercare_whatsapp: false },
      { id: "eve", email: "eve@x.test", first_name: "Eve", phone: null, aftercare_email: true, aftercare_whatsapp: false },
    ],
    orders: [
      order("0001", "ann", { delivered_at: "2026-09-20T02:00:00.000Z" }),
      order("0002", "ann", { delivered_at: "2026-10-01T02:00:00.000Z" }),
      order("0003", "ann", { delivered_at: "2026-10-15T02:00:00.000Z" }),
      order("0004", "ben", { delivered_at: "2026-10-05T02:00:00.000Z" }),
      order("0005", "cat"),
      order("0006", "dan", { refund_request_status: "requested", amount_refunded: 0 }),
      order("0007", "eve", { paid_at: "2026-09-25T02:00:00.000Z", delivered_at: null }),
      order("0008", null),
    ],
    customer_preference_events: [
      { customer_id: "ben", preference: "aftercare_whatsapp", to_value: true, created_at: "2026-09-01T00:00:00.000Z" },
    ],
    whatsapp_inbound: [],
    rma_requests: [{ id: "r1", customer_id: "dan", order_id: "0006", status: "requested" }],
    product_reviews: [{ id: "p1", customer_id: "dan", order_id: "0006", rating: 1, status: "approved" }],
    customer_notes: [{ id: "n1", customer_id: "dan", body: "Very unhappy with the fit" }],
  };
  admin = reviewFakeDb(db);
});

const run = (opts: { dryRun?: boolean; now?: Date } = {}) =>
  runReviewRequests(admin, { origin: ORIGIN, now: opts.now ?? NOW, dryRun: opts.dryRun });
const asked = () => (db.customer_review_requests ?? []).map((r) => r.customer_id).sort();
const emailTo = () => emails.map((e) => e.to).sort();
const tokenIn = (text: string) => decodeURIComponent(text.match(/\/r\/review\?t=([A-Za-z0-9_%-]+)/)![1]);

describe("who is asked, and how", () => {
  it("asks each due Customer once, on the channels they have", async () => {
    const report = await run();
    expect(asked()).toEqual(["ann", "ben", "dan"]);
    expect(emailTo()).toEqual(["ann@order.test", "dan@order.test"]);
    expect(h.whatsapp.map((m) => m.to)).toEqual(["+6591234567"]);
    expect(report).toMatchObject({
      enabled: true,
      blocked: null,
      candidates: 4,
      reachable: 3,
      asked: 3,
      sent: { email: 2, whatsapp: 1 },
      failed: { email: 0, whatsapp: 0 },
      skipped: { no_channel: 1, not_marked_delivered: 1, already_asked: 0 },
      emailSkipped: { opted_out: 2 },
      whatsappSkipped: { opted_out: 3 },
    });
    const ann = emails.find((e) => e.to === "ann@order.test")!;
    expect(ann.text).toContain("Your Premium Mpillow (order MP-20261001-0002) was delivered on 1 Oct 2026.");
    expect(db.customer_review_requests!.find((r) => r.customer_id === "ann")!.order_id).toBe("0002");
  });

  it("asks a Customer with an open return, a refund request, a bad review and a note, like anyone else", async () => {
    await run();
    expect(asked()).toContain("dan");
    expect(emailTo()).toContain("dan@order.test");
  });

  it("sends email off / WhatsApp on by WhatsApp only, and the reverse; with neither, skips and counts", async () => {
    await run();
    const sentEmail = (db.customer_emails ?? []).map((r) => r.customer_id).sort();
    const sentWa = (db.customer_whatsapp ?? []).map((r) => r.customer_id);
    expect(sentEmail).toEqual(["ann", "dan"]);
    expect(sentWa).toEqual(["ben"]);
    expect(asked()).not.toContain("cat");
    db.customers!.find((c) => c.id === "cat")!.aftercare_email = true;
    await run();
    expect(asked()).toContain("cat");
  });

  it("does not ask before day 14, nor after the maximum age", async () => {
    expect((await run({ dryRun: true, now: new Date("2026-09-30T02:00:00.000Z") })).candidates).toBe(0);
    expect((await run({ dryRun: true, now: new Date("2026-12-31T02:00:00.000Z") })).candidates).toBe(0);
  });
});

describe("at most once per Customer", () => {
  it("across concurrent runs, re-runs and new Orders, through the primary key and the ledgers", async () => {
    const reports = await Promise.all([run(), run(), run()]);
    expect(asked()).toEqual(["ann", "ben", "dan"]);
    expect(emailTo()).toEqual(["ann@order.test", "dan@order.test"]);
    expect(h.whatsapp).toHaveLength(1);
    expect(reports.reduce((n, r) => n + r.asked, 0)).toBe(3);
    expect(reports.reduce((n, r) => n + r.sent.email + r.sent.whatsapp, 0)).toBe(3);

    db.orders!.push(order("0009", "ann", { paid_at: "2026-10-20T02:00:00.000Z", delivered_at: "2026-10-21T02:00:00.000Z" }));
    const later = await run({ now: new Date("2026-11-05T02:00:00.000Z") });
    expect(later.asked).toBe(0);
    expect(emails).toHaveLength(2);
    expect(h.whatsapp).toHaveLength(1);
  });

  it("holds when the claim races: the run that loses it asks nobody", async () => {
    const racing = new Proxy(admin, {
      get(target, prop) {
        if (prop !== "from") return Reflect.get(target, prop);
        return (table: string) => {
          const q = target.from(table) as unknown as { upsert: (row: Row, o: unknown) => unknown };
          if (table !== "customer_review_requests") return q;
          const upsert = q.upsert;
          q.upsert = (row, o) => {
            const rows = (db.customer_review_requests ??= []);
            if (row.customer_id === "ann" && !rows.some((r) => r.customer_id === "ann")) {
              rows.push({ customer_id: "ann", order_id: "0002", token_hash: "other-run" });
            }
            return upsert(row, o);
          };
          return q;
        };
      },
    });
    const report = await runReviewRequests(racing, { origin: ORIGIN, now: NOW });
    expect(report.skipped.already_asked).toBe(1);
    expect(report.asked).toBe(2);
    expect(emailTo()).toEqual(["dan@order.test"]);
  });
});

describe("the link", () => {
  it("is one token for both channels, stored only as its hash; replies go to support", async () => {
    Object.assign(db.customers!.find((c) => c.id === "ann")!, { phone: "+65 9876 5432", aftercare_whatsapp: true });
    db.customer_preference_events!.push({
      customer_id: "ann",
      preference: "aftercare_whatsapp",
      to_value: true,
      created_at: "2026-09-01T00:00:00.000Z",
    });
    await run();
    const email = emails.find((e) => e.to === "ann@order.test")!;
    const token = tokenIn(email.text);
    expect(email.html).toContain(`${ORIGIN}/r/review?t=${token}`);
    expect(email.replyTo).toBe(SUPPORT);
    const wa = h.whatsapp.find((m) => m.to === "+6598765432")!;
    expect(wa.urlButtonParam).toBe(token);
    expect(wa.params).toEqual(["Ann", "#MP-20261001-0002", "Premium Mpillow", "1 Oct 2026", "+65 8780 5311"]);
    const row = db.customer_review_requests!.find((r) => r.customer_id === "ann")!;
    expect(row.token_hash).toBe(hashReviewToken(token));
    expect(JSON.stringify(db)).not.toContain(token);
  });
});

describe("switched off, or with no review link", () => {
  it.each([
    ["off", { review_requests_enabled: "false" }, "disabled"],
    ["no link", { google_review_url: "" }, "no_review_url"],
    ["an http link", { google_review_url: "http://g.page/r/x/review" }, "no_review_url"],
  ])("%s: reports the candidates and sends nothing", async (_label, over, blocked) => {
    db.site_settings = settings(over);
    const report = await run();
    expect(report).toMatchObject({
      blocked,
      candidates: 4,
      reachable: 3,
      asked: 0,
      sent: { email: 0, whatsapp: 0 },
      skipped: { no_channel: 1, not_marked_delivered: 1 },
    });
    expect(db.customer_review_requests ?? []).toEqual([]);
    expect(db.customer_emails ?? []).toEqual([]);
    expect(db.customer_whatsapp ?? []).toEqual([]);
    expect(emails).toEqual([]);
    expect(h.whatsapp).toEqual([]);
  });

  it("is off with no settings at all", async () => {
    db.site_settings = [];
    expect((await run()).blocked).toBe("disabled");
    expect(emails).toEqual([]);
  });
});

describe("failures", () => {
  it("retries a failed email on a later run, with a fresh link, and gives up after 3 attempts", async () => {
    emailFails = true;
    const first = await run();
    expect(first.failed.email).toBe(2);
    expect(asked()).toEqual(["ann", "ben", "dan"]);
    const annRow = () => db.customer_review_requests!.find((r) => r.customer_id === "ann")!;
    const firstHash = annRow().token_hash;

    emailFails = false;
    const second = await run();
    expect(second).toMatchObject({ asked: 0, retried: 2, sent: { email: 2 } });
    expect(emailTo()).toEqual(["ann@order.test", "dan@order.test"]);
    const token = tokenIn(emails.find((e) => e.to === "ann@order.test")!.text);
    expect(annRow().token_hash).toBe(hashReviewToken(token));
    expect(annRow().token_hash).not.toBe(firstHash);
    expect((await run()).retried).toBe(0);
    expect(emails).toHaveLength(2);
  });

  it("stops after the third attempt", async () => {
    emailFails = true;
    for (let i = 0; i < 4; i++) await run();
    const rows = (db.customer_emails ?? []).filter((r) => r.customer_id === "ann");
    expect(rows).toMatchObject([{ status: "failed", attempts: 3 }]);
    emailFails = false;
    await run();
    expect(emails).toEqual([]);
  });

  it("never retries a failed WhatsApp send: email carries the message", async () => {
    h.whatsappFails = true;
    const first = await run();
    expect(first.failed.whatsapp).toBe(1);
    expect(db.customer_whatsapp).toMatchObject([{ customer_id: "ben", status: "failed" }]);
    h.whatsappFails = false;
    await run();
    expect(h.whatsapp).toEqual([]);
  });
});

describe("outside production", () => {
  it("emails only the allowlist, and claims nobody it cannot reach", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.AFTERCARE_EMAIL_ALLOWLIST = "dan@order.test";
    const report = await run();
    expect(emailTo()).toEqual(["dan@order.test"]);
    expect(asked()).toEqual(["ben", "dan"]);
    expect(report.emailSkipped).toMatchObject({ not_allowed_outside_production: 1 });
  });

  it("skips WhatsApp until the template is approved, and email still goes", async () => {
    delete process.env.WHATSAPP_TEMPLATE_AFTERCARE_REVIEW;
    const report = await run();
    expect(h.whatsapp).toEqual([]);
    expect(emailTo()).toEqual(["ann@order.test", "dan@order.test"]);
    expect(report.whatsappSkipped).toMatchObject({ template_unconfigured: 4 });
    expect(asked()).toEqual(["ann", "dan"]);
  });
});

describe("the Weekly summary on Telegram", () => {
  it("counts the week's requests and how many were opened, and adds no line in a week with none", async () => {
    const week = { from: "2026-10-11T16:00:00.000Z", to: "2026-10-18T16:00:00.000Z" };
    db.customers = [];
    expect((await realSources.loadWeeklySummaryCounts(admin, week)).reviewRequests).toBeUndefined();
    db.customer_review_requests = [
      { customer_id: "a", token_hash: "1", created_at: "2026-10-12T02:00:00.000Z", first_clicked_at: "2026-10-12T05:00:00.000Z" },
      { customer_id: "b", token_hash: "2", created_at: "2026-10-14T02:00:00.000Z", first_clicked_at: null },
      { customer_id: "c", token_hash: "3", created_at: "2026-10-19T02:00:00.000Z", first_clicked_at: null },
    ];
    expect((await realSources.loadWeeklySummaryCounts(admin, week)).reviewRequests).toEqual({ sent: 2, opened: 1 });
  });
});
