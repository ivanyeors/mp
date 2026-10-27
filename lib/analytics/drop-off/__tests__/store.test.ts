import { describe, expect, it } from "vitest";
import { fakeSupabaseAdmin, type FakeDb } from "@/lib/supabase/__tests__/fake-admin";
import {
  readDropOffSummary,
  recordDropOffReason,
  summariseDropOffs,
  weekStartOf,
  type DropOffInsert,
  type DropOffRow,
} from "@/lib/analytics/drop-off/store";

/** PRD-crm-retention-loop slice 10: answers are recorded once, and summed for *Why people leave*. */

const NOW = new Date("2026-10-27T12:00:00Z"); // a Tuesday
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const ROW: DropOffInsert = {
  step: "configurator",
  reason: "price",
  other_text: null,
  path: "/mp-config",
  visit_id: "7a000000-0000-4000-8000-000000000001",
  visitor_id: null,
  result_id: null,
};

describe("recordDropOffReason", () => {
  it("inserts the answer", async () => {
    const db: FakeDb = {};
    expect(await recordDropOffReason(fakeSupabaseAdmin(db) as never, ROW)).toBe("recorded");
    expect(db.drop_off_reasons).toHaveLength(1);
  });

  it("treats a second answer for the same Visit and step as already recorded", async () => {
    const admin = { from: () => ({ insert: async () => ({ error: { code: "23505", message: "duplicate key value" } }) }) };
    expect(await recordDropOffReason(admin as never, ROW)).toBe("duplicate");
  });

  it("throws on any other failure", async () => {
    const admin = { from: () => ({ insert: async () => ({ error: { code: "42P01", message: "relation does not exist" } }) }) };
    await expect(recordDropOffReason(admin as never, ROW)).rejects.toThrow("relation does not exist");
  });
});

describe("weekStartOf", () => {
  it("is the Monday of the week in Singapore, not in UTC", () => {
    expect(weekStartOf(Date.parse("2026-10-27T12:00:00Z"))).toBe("2026-10-26");
    // Monday 00:00 in Singapore is Sunday 16:00 UTC.
    expect(weekStartOf(Date.parse("2026-10-25T16:00:00Z"))).toBe("2026-10-26");
    expect(weekStartOf(Date.parse("2026-10-25T15:59:59Z"))).toBe("2026-10-19");
    // A Monday-morning answer in Singapore is still Sunday in UTC.
    expect(weekStartOf(Date.parse("2026-10-25T23:59:59Z"))).toBe("2026-10-26");
  });
});

describe("summariseDropOffs", () => {
  const rows: DropOffRow[] = [
    { step: "configurator", reason: "size_or_feel", other_text: null, created_at: daysAgo(1) },
    { step: "configurator", reason: "size_or_feel", other_text: null, created_at: daysAgo(2) },
    { step: "checkout", reason: "size_or_feel", other_text: null, created_at: daysAgo(9) },
    { step: "checkout", reason: "delivery", other_text: null, created_at: daysAgo(3) },
    { step: "quote_decline", reason: "other", other_text: "bought elsewhere", created_at: daysAgo(4) },
    { step: "configurator", reason: "not_working", other_text: "button froze", created_at: daysAgo(0.5) },
    { step: "configurator", reason: "price", other_text: null, created_at: daysAgo(40) },
  ];

  it("counts the window by reason, most answered first, with each step's share", () => {
    const s = summariseDropOffs(rows, { days: 30, now: NOW });
    expect(s.total).toBe(6);
    expect(s.byReason[0]).toEqual({
      reason: "size_or_feel",
      count: 3,
      byStep: { configurator: 2, checkout: 1, quote_decline: 0 },
    });
    expect(s.byReason.map((r) => r.reason)).not.toContain("price");
    expect(s.byStep).toEqual({ configurator: 3, checkout: 2, quote_decline: 1 });
  });

  it("lists every week in the window, oldest first, and the typed answers newest first", () => {
    const s = summariseDropOffs(rows, { days: 30, now: NOW });
    expect(s.weeks.at(-1)).toEqual({ weekStart: "2026-10-26", count: 2, partial: true });
    expect(s.weeks.reduce((a, w) => a + w.count, 0)).toBe(6);
    expect(s.weeks.map((w) => w.weekStart)).toEqual([...s.weeks.map((w) => w.weekStart)].sort());
    expect(s.latestText.map((t) => t.text)).toEqual(["button froze", "bought elsewhere"]);
  });

  it("marks the window's first week and the running week as part weeks, and only those", () => {
    const s = summariseDropOffs(rows, { days: 30, now: NOW });
    expect(s.weeks[0]!.partial).toBe(true);
    expect(s.weeks.at(-1)!.partial).toBe(true);
    expect(s.weeks.slice(1, -1).every((w) => !w.partial)).toBe(true);
  });

  it("is empty, not missing, with nothing to count", () => {
    const s = summariseDropOffs([], { days: 30, now: NOW });
    expect(s.total).toBe(0);
    expect(s.byReason).toEqual([]);
    expect(s.weeks.length).toBeGreaterThanOrEqual(4);
  });
});

describe("readDropOffSummary", () => {
  const many = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `r${String(i).padStart(5, "0")}`,
      step: "configurator",
      reason: "price",
      other_text: null,
      created_at: new Date(NOW.getTime() - (i + 1) * 60_000).toISOString(),
    }));

  // Supabase answers at most 1,000 rows and drops the rest without an error.
  it("pages past a thousand answers", async () => {
    const db: FakeDb = { drop_off_reasons: many(2_500) };
    const s = await readDropOffSummary(fakeSupabaseAdmin(db) as never, { days: 30, now: NOW });
    expect(s.total).toBe(2_500);
    expect(s.capped).toBeUndefined();
  });

  it("counts the newest answers past its cap, and says so", async () => {
    const db: FakeDb = { drop_off_reasons: many(2_500) };
    const s = await readDropOffSummary(fakeSupabaseAdmin(db) as never, { days: 30, now: NOW, cap: 2_000 });
    expect(s.total).toBe(2_000);
    expect(s.capped).toBe(2_000);
  });

  it("reads the window's rows and summarises them", async () => {
    const db: FakeDb = { drop_off_reasons: rows() };
    const s = await readDropOffSummary(fakeSupabaseAdmin(db) as never, { days: 30, now: NOW });
    expect(s.total).toBe(1);
    function rows() {
      return [
        { step: "checkout", reason: "price", other_text: null, created_at: daysAgo(5) },
        { step: "checkout", reason: "price", other_text: null, created_at: daysAgo(45) },
      ];
    }
  });
});
