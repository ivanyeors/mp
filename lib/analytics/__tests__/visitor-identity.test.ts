import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  linkPaidOrderToPerson,
  readVisitorCookie,
  stitchVisitor,
  visitorIdsForPerson,
} from "@/lib/analytics/journey/identity";

type Row = Record<string, unknown>;

/** The few PostgREST calls the identity writers make, over arrays. */
function fakeDb(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    const filters: ((r: Row) => boolean)[] = [];
    let patch: Row | null = null;
    let cap = Infinity;
    let sort: { column: string; ascending: boolean } | null = null;
    const run = () => {
      let hit = rows.filter((r) => filters.every((f) => f(r)));
      if (patch) for (const r of hit) Object.assign(r, patch);
      if (sort) {
        const { column, ascending } = sort;
        hit = [...hit].sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : 1) * (ascending ? 1 : -1));
      }
      return { data: hit.slice(0, cap), error: null };
    };
    const q = {
      select: () => q,
      update: (p: Row) => ((patch = p), q),
      upsert: (row: Row) => {
        if (!rows.some((r) => r.id === row.id)) rows.push({ email: null, customer_id: null, merged_at: null, ...row });
        return Promise.resolve({ error: null });
      },
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
      order: (column: string, o: { ascending: boolean }) => ((sort = { column, ascending: o.ascending }), q),
      limit: (n: number) => ((cap = n), q),
      maybeSingle: () => Promise.resolve({ data: run().data[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve(run()),
    };
    return q;
  };
  return { from } as unknown as SupabaseClient;
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [APP, SAFARI, STRANGER, CUSTOMER, ORDER, ORDER_2] = [1, 2, 3, 4, 5, 6].map(id);
const request = (cookie: string | null) => ({ headers: { get: (name: string) => (name === "cookie" ? cookie : null) } });

const seed = () => ({
  analytics_visitors: [
    { id: APP, email: "amy@example.com", customer_id: null, merged_at: "x" },
    { id: SAFARI, email: null, customer_id: CUSTOMER, merged_at: "x" },
    { id: STRANGER, email: null, customer_id: null, merged_at: null },
  ] as Row[],
  analytics_visits: [
    { id: "v-app", visitor_id: APP, started_at: "2026-11-01T10:00:00Z", ended_at: "2026-11-01T10:20:00Z", converted_order_id: null },
    { id: "v-safari", visitor_id: SAFARI, started_at: "2026-11-05T10:00:00Z", ended_at: null, converted_order_id: null },
    { id: "v-stranger", visitor_id: STRANGER, started_at: "2026-11-06T10:00:00Z", ended_at: null, converted_order_id: null },
  ] as Row[],
});

describe("readVisitorCookie", () => {
  it("reads the Visitor id among other cookies, and nothing that is not one", () => {
    expect(readVisitorCookie(request(`locale=en-US; mp_vid=${APP}; other=1`))).toBe(APP);
    expect(readVisitorCookie(request("mp_vid=not-a-uuid"))).toBeNull();
    expect(readVisitorCookie(request("xmp_vid=" + APP))).toBeNull();
    expect(readVisitorCookie(request(null))).toBeNull();
  });
});

describe("visitorIdsForPerson", () => {
  it("finds a person's Visitors by Customer and by email, and no one else's", async () => {
    const ids = await visitorIdsForPerson(fakeDb(seed()), { customerId: CUSTOMER, email: " Amy@Example.com " });
    expect(ids.sort()).toEqual([APP, SAFARI]);
    expect(await visitorIdsForPerson(fakeDb(seed()), { email: "nobody@example.com" })).toEqual([]);
  });
});

describe("linkPaidOrderToPerson", () => {
  it("marks the open Visit of the person who paid, across their browsers", async () => {
    const tables = seed();
    const res = await linkPaidOrderToPerson(fakeDb(tables), { orderId: ORDER, customerId: CUSTOMER, email: "amy@example.com" });
    expect(res).toEqual({ ok: true, linked: true, visitId: "v-safari" });
    expect(tables.analytics_visits.find((v) => v.id === "v-safari")!.converted_order_id).toBe(ORDER);
    expect(tables.analytics_visits.find((v) => v.id === "v-stranger")!.converted_order_id).toBeNull();
  });

  it("is a no-op on a second delivery, and gives a second Order another Visit", async () => {
    const tables = seed();
    const db = fakeDb(tables);
    await linkPaidOrderToPerson(db, { orderId: ORDER, customerId: CUSTOMER, email: "amy@example.com" });
    expect(await linkPaidOrderToPerson(db, { orderId: ORDER, customerId: CUSTOMER })).toMatchObject({ linked: true, visitId: "v-safari" });
    expect(await linkPaidOrderToPerson(db, { orderId: ORDER_2, email: "amy@example.com" })).toMatchObject({ linked: true, visitId: "v-app" });
    expect(tables.analytics_visits.filter((v) => v.converted_order_id === ORDER)).toHaveLength(1);
  });

  it("links nothing for an Order whose buyer no Visitor is tied to", async () => {
    const tables = seed();
    expect(await linkPaidOrderToPerson(fakeDb(tables), { orderId: ORDER, email: "walkin@example.com" })).toEqual({
      ok: true,
      linked: false,
      visitId: null,
    });
    expect(tables.analytics_visits.every((v) => v.converted_order_id === null)).toBe(true);
  });
});

describe("stitchVisitor", () => {
  it("ties the browser's Visitor to the email it just gave", async () => {
    const tables = seed();
    await stitchVisitor(fakeDb(tables), request(`mp_vid=${STRANGER}`), { email: "Ben@Example.com", customerId: CUSTOMER });
    expect(tables.analytics_visitors.find((v) => v.id === STRANGER)).toMatchObject({ email: "ben@example.com", customer_id: CUSTOMER });
  });

  it("leaves a Visitor already tied to someone else alone", async () => {
    const tables = seed();
    await stitchVisitor(fakeDb(tables), request(`mp_vid=${APP}`), { email: "ben@example.com", customerId: CUSTOMER });
    expect(tables.analytics_visitors.find((v) => v.id === APP)).toMatchObject({ email: "amy@example.com", customer_id: null });
  });

  it("does nothing without a Visitor cookie, and never throws", async () => {
    const tables = seed();
    await stitchVisitor(fakeDb(tables), request(null), { email: "ben@example.com" });
    await expect(stitchVisitor({} as SupabaseClient, request(`mp_vid=${APP}`), { email: "ben@example.com" })).resolves.toBeUndefined();
    expect(tables.analytics_visitors).toHaveLength(3);
  });
});
