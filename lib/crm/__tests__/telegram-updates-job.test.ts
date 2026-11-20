import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SignUpCounts } from "@/lib/crm/telegram-updates";
import { CRM_TELEGRAM_LAST_SENT_KEY, CRM_TELEGRAM_UPDATES_KEY, TELEGRAM_TEST_MARK } from "@/lib/crm/telegram-updates";

const h = vi.hoisted(() => ({
  reviewsToMatch: null as number | null,
  signUps: null as SignUpCounts | null,
}));

vi.mock("@/lib/crm/telegram-update-sources", async (orig) => ({
  ...(await orig<typeof import("@/lib/crm/telegram-update-sources")>()),
  countGoogleReviewsToMatch: async () => h.reviewsToMatch,
  countSignUps: async () => h.signUps,
}));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));

const { runCrmTelegramUpdates, sendTelegramUpdatesTest, claimTelegramPeriod } = await import(
  "@/lib/crm/telegram-updates-server"
);
const realSources = await vi.importActual<typeof import("@/lib/crm/telegram-update-sources")>(
  "@/lib/crm/telegram-update-sources",
);

type Row = Record<string, unknown>;
type Db = { tables: Record<string, Row[]>; failSettingsRead: boolean };

function fakeAdmin(db: Db): SupabaseClient {
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let op: "select" | "insert" | "update" = "select";
    let payload: Row = {};
    let head = false;
    const list = () => (db.tables[table] ??= []);
    const exec = async () => {
      await new Promise((r) => setTimeout(r, 0));
      if (table === "site_settings" && op === "select" && db.failSettingsRead) {
        return { data: null, error: { message: "connection reset", code: "08006" }, count: null };
      }
      if (op === "insert") {
        if (table === "site_settings" && list().some((r) => r.key === payload.key)) {
          return { data: null, error: { message: "duplicate key", code: "23505" }, count: null };
        }
        list().push({ ...payload });
        return { data: null, error: null, count: null };
      }
      const hit = list().filter((r) => filters.every((f) => f(r)));
      if (op === "update") for (const r of hit) Object.assign(r, payload);
      return { data: head ? null : hit.map((r) => ({ ...r })), error: null, count: hit.length };
    };
    const b = {
      select: (_cols?: string, opts?: { head?: boolean }) => ((head = Boolean(opts?.head)), b),
      insert: (p: Row) => ((op = "insert"), (payload = p), b),
      update: (p: Row) => ((op = "update"), (payload = p), b),
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
      gte: (c: string, v: string) => (filters.push((r) => r[c] != null && String(r[c]) >= v), b),
      lt: (c: string, v: string) => (filters.push((r) => r[c] != null && String(r[c]) < v), b),
      is: (c: string, v: null) => (filters.push((r) => (r[c] ?? null) === v), b),
      maybeSingle: async () => {
        const res = await exec();
        const rows = (res.data as Row[] | null) ?? [];
        return { data: rows[0] ?? null, error: res.error };
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => exec().then(resolve, reject),
    };
    return b;
  };
  return { from } as unknown as SupabaseClient;
}

const ORIGIN = "https://mpillow.test";
const MONDAY = new Date("2026-10-19T02:00:00Z");
const TUESDAY = new Date("2026-10-20T02:00:00Z");
const NEXT_MONDAY = new Date("2026-10-26T02:00:00Z");

const CUSTOMERS: Row[] = [
  { id: "c1", first_name: "Ana", last_name: "Tan", email: "ana.tan@x.test", phone: "+6591234567", created_at: "2026-10-13T03:00:00.000Z" },
  { id: "c2", first_name: "Wei Ling", last_name: "Lim", email: "weiling@x.test", phone: "+6598765432", created_at: "2026-10-18T15:59:00.000Z" },
  { id: "c3", first_name: "Raj", last_name: "Kumar", email: "raj@x.test", phone: "+6581112222", created_at: "2026-10-05T03:00:00.000Z" },
];
const PII = CUSTOMERS.flatMap((c) => [c.first_name, c.last_name, c.email, c.phone]) as string[];

const OVERVIEW: Row[] = [
  { id: "c1", from_shopify: true, account_linked_at: "2026-10-13T04:00:00.000Z" },
  { id: "c2", from_shopify: false, account_linked_at: "2026-10-18T15:59:30.000Z" },
  { id: "c3", from_shopify: false, account_linked_at: "2026-10-05T03:00:00.000Z" },
  { id: "c4", from_shopify: true, account_linked_at: null },
];

const FOLLOW_UPS: Row[] = [
  { id: "f1", title: "Call Ana Tan about her second pillow", due_on: "2026-10-15", done_at: "2026-10-14T03:00:00.000Z" },
  { id: "f2", title: "Send Wei Ling Lim the fill sample", due_on: "2026-10-17", done_at: null },
  { id: "f3", title: "Raj Kumar: chase the return", due_on: "2026-10-10", done_at: "2026-10-19T01:00:00.000Z" },
  { id: "f4", title: "Ana Tan check-in", due_on: "2026-10-19", done_at: null },
  { id: "f5", title: "Old one", due_on: "2026-10-04", done_at: "2026-10-05T03:00:00.000Z" },
];

let db: Db;
let admin: SupabaseClient;
let sent: string[];
let sendStatus: "sent" | "failed";
const send = async (text: string) => {
  sent.push(text);
  return sendStatus;
};
const run = (now: Date) => runCrmTelegramUpdates(admin, { origin: ORIGIN, now, send });
const setSwitches = (value: unknown) => {
  db.tables.site_settings = db.tables.site_settings.filter((r) => r.key !== CRM_TELEGRAM_UPDATES_KEY);
  db.tables.site_settings.push({ key: CRM_TELEGRAM_UPDATES_KEY, value: JSON.stringify(value) });
};
const lastSent = () =>
  JSON.parse(String(db.tables.site_settings.find((r) => r.key === CRM_TELEGRAM_LAST_SENT_KEY)?.value ?? "{}"));

beforeEach(() => {
  db = {
    tables: {
      site_settings: [],
      customers: CUSTOMERS.map((c) => ({ ...c })),
      admin_customer_overview: OVERVIEW.map((c) => ({ ...c })),
      customer_followups: FOLLOW_UPS.map((f) => ({ ...f })),
    },
    failSettingsRead: false,
  };
  admin = fakeAdmin(db);
  sent = [];
  sendStatus = "sent";
  h.reviewsToMatch = null;
  h.signUps = null;
});

describe("Weekly summary", () => {
  it("posts on its day, counting the previous Monday to Sunday", async () => {
    const res = await run(MONDAY);
    expect(res).toMatchObject({ ok: true, weekly_summary: { status: "sent", period: "2026-W42" } });
    expect(sent).toEqual([
      "This week: 2 new customers, 2 sign-ups, 1 follow-up done, 2 overdue.\nOpen: https://mpillow.test/settings/customers",
    ]);
    expect(lastSent()).toEqual({ weekly_summary: "2026-W42" });
  });

  it("posts once per week, however often the cron is re-run", async () => {
    await run(MONDAY);
    const again = await run(MONDAY);
    const later = await run(new Date(MONDAY.getTime() + 6 * 60 * 60 * 1000));
    expect(again).toMatchObject({ weekly_summary: { status: "already_sent", period: "2026-W42" } });
    expect(later).toMatchObject({ weekly_summary: { status: "already_sent" } });
    expect(sent).toHaveLength(1);
    expect(await run(NEXT_MONDAY)).toMatchObject({ weekly_summary: { status: "sent", period: "2026-W43" } });
    expect(sent).toHaveLength(2);
  });

  it("posts once when two runs overlap", async () => {
    const results = await Promise.all([run(MONDAY), run(MONDAY), run(MONDAY)]);
    expect(sent).toHaveLength(1);
    const statuses = results.map((r) => ("weekly_summary" in r ? r.weekly_summary.status : r));
    expect(statuses.sort()).toEqual(["already_sent", "already_sent", "sent"]);
  });

  it("waits for its own day, and moves with weekly_day", async () => {
    expect(await run(TUESDAY)).toMatchObject({ weekly_summary: { status: "not_due" } });
    expect(sent).toEqual([]);
    expect(lastSent()).toEqual({});
    setSwitches({ weekly_summary: { enabled: true, day: "tue" } });
    expect(await run(TUESDAY)).toMatchObject({ weekly_summary: { status: "sent", period: "2026-W42" } });
    expect(await run(MONDAY)).toMatchObject({ weekly_summary: { status: "not_due" } });
  });

  it("is not retried in a period whose send failed: at most once", async () => {
    sendStatus = "failed";
    expect(await run(MONDAY)).toMatchObject({ weekly_summary: { status: "failed", period: "2026-W42" } });
    sendStatus = "sent";
    expect(await run(MONDAY)).toMatchObject({ weekly_summary: { status: "already_sent" } });
    expect(sent).toHaveLength(1);
  });

  it("gains each line its source contributes, through WEEKLY_SUMMARY_SOURCES", async () => {
    const counts = await realSources.loadWeeklySummaryCounts(admin, {
      from: "2026-10-11T16:00:00.000Z",
      to: "2026-10-18T16:00:00.000Z",
    });
    const followUps = { done: 1, overdue: 2 };
    expect(counts).toEqual({ newCustomers: 2, signUps: 2, followUps });
    db.tables.customer_google_reviews = [
      { google_review_id: "g1", customer_id: "c1", linked_at: "2026-10-14T03:00:00.000Z" },
      { google_review_id: "g2", customer_id: "c2", linked_at: "2026-10-18T16:00:00.000Z" },
    ];
    const withLinks = await realSources.loadWeeklySummaryCounts(admin, {
      from: "2026-10-11T16:00:00.000Z",
      to: "2026-10-18T16:00:00.000Z",
    });
    expect(withLinks).toEqual({ newCustomers: 2, signUps: 2, followUps, googleReviewsLinked: 1 });
    db.tables.customer_google_reviews = [];
    const withSlice07 = await realSources.loadWeeklySummaryCounts(
      admin,
      { from: "2026-10-11T16:00:00.000Z", to: "2026-10-18T16:00:00.000Z" },
      [...realSources.WEEKLY_SUMMARY_SOURCES, async () => ({ reviewRequests: { sent: 4, opened: 1 } })],
    );
    expect(withSlice07).toEqual({ newCustomers: 2, signUps: 2, followUps, reviewRequests: { sent: 4, opened: 1 } });
  });

  it("counts follow-ups done in the week, and overdue as it closed (CRM slice 06)", async () => {
    const week = { from: "2026-10-11T16:00:00.000Z", to: "2026-10-18T16:00:00.000Z" };
    expect(await realSources.countFollowUps(admin, week)).toEqual({ done: 1, overdue: 2 });
    expect(
      await realSources.countFollowUps(admin, { from: "2026-10-18T16:00:00.000Z", to: "2026-10-25T16:00:00.000Z" }),
    ).toEqual({ done: 1, overdue: 2 });
  });
});

describe("the daily types", () => {
  it("post when there are any, once a day", async () => {
    h.reviewsToMatch = 3;
    h.signUps = { total: 5, migrated: 3 };
    const first = await run(TUESDAY);
    expect(first).toMatchObject({
      google_reviews_to_match: { status: "sent", period: "2026-10-20" },
      new_sign_ups: { status: "sent", period: "2026-10-20" },
    });
    expect(sent).toEqual([
      "3 Google reviews are waiting to be matched to customers.\nOpen: https://mpillow.test/settings/customers?view=reviews",
      "5 customers signed up yesterday, 3 of them from Shopify.\nOpen: https://mpillow.test/settings/customers",
    ]);
    expect(await run(TUESDAY)).toMatchObject({
      google_reviews_to_match: { status: "already_sent" },
      new_sign_ups: { status: "already_sent" },
    });
    expect(sent).toHaveLength(2);
  });

  it("stay quiet on a zero day, and claim nothing", async () => {
    h.reviewsToMatch = 0;
    h.signUps = { total: 0, migrated: 0 };
    expect(await run(TUESDAY)).toMatchObject({
      google_reviews_to_match: { status: "none" },
      new_sign_ups: { status: "none" },
    });
    expect(sent).toEqual([]);
    expect(lastSent()).toEqual({});
    h.reviewsToMatch = 2;
    expect(await run(TUESDAY)).toMatchObject({ google_reviews_to_match: { status: "sent" } });
  });

  it("count sign-ups on account_linked_at, and how many came from Shopify (migration slice 12)", async () => {
    const week = { from: "2026-10-11T16:00:00.000Z", to: "2026-10-18T16:00:00.000Z" };
    expect(await realSources.countSignUps(admin, week)).toEqual({ total: 2, migrated: 1 });
    const day = { from: "2026-10-17T16:00:00.000Z", to: "2026-10-18T16:00:00.000Z" };
    expect(await realSources.countSignUps(admin, day)).toEqual({ total: 1, migrated: 0 });
    expect(await realSources.countSignUps(admin, { from: "2000-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" })).toEqual({
      total: 3,
      migrated: 1,
    });
  });

  it("post nothing while a source is not built (a seam returns null)", async () => {
    expect(await run(TUESDAY)).toMatchObject({
      google_reviews_to_match: { status: "not_built" },
      new_sign_ups: { status: "not_built" },
    });
    expect(sent).toEqual([]);
  });
});

describe("switches", () => {
  it("a type that is off posts nothing", async () => {
    h.reviewsToMatch = 3;
    h.signUps = { total: 5, migrated: 3 };
    setSwitches({
      google_reviews_to_match: { enabled: false },
      new_sign_ups: { enabled: false },
      weekly_summary: { enabled: false, day: "mon" },
    });
    expect(await run(MONDAY)).toEqual({
      ok: true,
      google_reviews_to_match: { status: "off" },
      new_sign_ups: { status: "off" },
      weekly_summary: { status: "off" },
    });
    expect(sent).toEqual([]);
  });

  it("sends nothing when the switches cannot be read", async () => {
    h.reviewsToMatch = 3;
    db.failSettingsRead = true;
    expect(await run(MONDAY)).toEqual({ ok: false, error: "settings unreadable: connection reset" });
    expect(sent).toEqual([]);
  });

  it("claims nothing without a bot token", async () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    try {
      expect(await runCrmTelegramUpdates(admin, { origin: ORIGIN, now: MONDAY })).toEqual({
        ok: true,
        skipped: "no bot token",
      });
      expect(lastSent()).toEqual({});
    } finally {
      if (token !== undefined) process.env.TELEGRAM_BOT_TOKEN = token;
    }
  });

  it("claims one type without disturbing another's period", async () => {
    expect(await claimTelegramPeriod(admin, "new_sign_ups", "2026-10-20")).toBe(true);
    expect(await claimTelegramPeriod(admin, "weekly_summary", "2026-W42")).toBe(true);
    expect(await claimTelegramPeriod(admin, "new_sign_ups", "2026-10-20")).toBe(false);
    expect(lastSent()).toEqual({ new_sign_ups: "2026-10-20", weekly_summary: "2026-W42" });
  });
});

describe("no customer data reaches the Staff group", () => {
  it("scans every scheduled message for the fixture customers", async () => {
    h.reviewsToMatch = 2;
    h.signUps = { total: 3, migrated: 1 };
    await run(MONDAY);
    expect(sent).toHaveLength(3);
    for (const text of sent) {
      for (const fact of PII) expect(text, fact).not.toContain(fact);
      expect(text).not.toMatch(/@/);
      for (const f of FOLLOW_UPS) expect(text).not.toContain(String(f.title));
    }
  });
});

describe("Send test", () => {
  it("posts only the enabled types, each marked TEST, with no real customer data", async () => {
    const result = await sendTelegramUpdatesTest(
      {
        online_result_held: { enabled: true },
        google_reviews_to_match: { enabled: false },
        new_sign_ups: { enabled: true },
        weekly_summary: { enabled: false, day: "mon" },
      },
      { origin: ORIGIN, send },
    );
    expect(result).toEqual({ ok: true, sent: ["online_result_held", "new_sign_ups"], failed: [] });
    expect(sent).toHaveLength(2);
    for (const text of sent) {
      expect(text.split("\n")[0]).toBe(TELEGRAM_TEST_MARK);
      for (const fact of PII) expect(text, fact).not.toContain(fact);
    }
    expect(sent[0]).toContain("Email: test@example.com");
    expect(sent[1]).toContain("5 customers signed up yesterday, 3 of them from Shopify.");
    expect(lastSent()).toEqual({});
  });

  it("reports the types that did not post", async () => {
    sendStatus = "failed";
    const all = { enabled: true };
    const result = await sendTelegramUpdatesTest(
      { online_result_held: all, google_reviews_to_match: all, new_sign_ups: all, weekly_summary: { enabled: true, day: "mon" } },
      { origin: ORIGIN, send },
    );
    expect(result.ok).toBe(false);
    expect(result.failed).toEqual(["online_result_held", "google_reviews_to_match", "new_sign_ups", "weekly_summary"]);
  });
});

describe("no third cron", () => {
  it("chains onto results-sla, and vercel.json keeps two crons", () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as { crons: unknown[] };
    expect(vercel.crons).toHaveLength(2);
    const sla = readFileSync(join(process.cwd(), "app/api/cron/results-sla/route.ts"), "utf8");
    expect(sla).toMatch(/await runCrmTelegramUpdates\(admin, \{ origin, now \}\)/);
  });
});
