import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The last signed-in visit (migration slice 12): `account_last_seen_at` is
 * written at most once an hour per Customer, by one conditional update, and a
 * failing write never breaks an account page.
 */

type Update = { values: Record<string, unknown>; filters: [string, string, unknown][] };

const h = vi.hoisted(() => ({
  customer: null as Record<string, unknown> | null,
  updates: [] as Update[],
  /** What a `customers` update answers: matched rows, an error, or a throw. */
  updateResult: "matched" as "matched" | "none" | "error" | "throw",
}));

/** A `customers` / `orders` stand-in that records every update and its filters. */
function fakeAdmin() {
  return {
    from(table: string) {
      const filters: [string, string, unknown][] = [];
      let values: Record<string, unknown> | null = null;
      const builder = {
        select() {
          return builder;
        },
        update(v: Record<string, unknown>) {
          values = v;
          return builder;
        },
        eq(c: string, v: unknown) {
          filters.push(["eq", c, v]);
          return builder;
        },
        is(c: string, v: unknown) {
          filters.push(["is", c, v]);
          return builder;
        },
        lt(c: string, v: unknown) {
          filters.push(["lt", c, v]);
          return builder;
        },
        ilike(c: string, v: unknown) {
          filters.push(["ilike", c, v]);
          return builder;
        },
        maybeSingle() {
          // Lookups: by auth id finds the linked Customer; by email too.
          return Promise.resolve({ data: h.customer, error: null });
        },
        then(resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) {
          if (table === "orders") return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          h.updates.push({ values: values ?? {}, filters });
          if (h.updateResult === "throw") return Promise.reject(new Error("network down")).then(resolve, reject);
          const result =
            h.updateResult === "error"
              ? { data: null, error: { message: "permission denied" } }
              : { data: h.updateResult === "matched" ? [{ id: "c1" }] : [], error: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => fakeAdmin() }));

const { LAST_SEEN_INTERVAL_MS, lastSeenIsStale, linkCustomerToAuthUser, touchCustomerLastSeen } = await import(
  "@/lib/auth/customer-identity"
);
const { supabaseAdmin } = await import("@/lib/supabase/server");

const NOW = new Date("2026-10-20T10:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

beforeEach(() => {
  h.customer = null;
  h.updates = [];
  h.updateResult = "matched";
});

describe("lastSeenIsStale", () => {
  it("is stale with no visit recorded", () => {
    expect(lastSeenIsStale(null, NOW)).toBe(true);
    expect(lastSeenIsStale(undefined, NOW)).toBe(true);
  });

  it("is fresh for under an hour, and stale from the hour on", () => {
    expect(lastSeenIsStale(minutesAgo(1), NOW)).toBe(false);
    expect(lastSeenIsStale(minutesAgo(59), NOW)).toBe(false);
    expect(lastSeenIsStale(minutesAgo(60), NOW)).toBe(true);
    expect(lastSeenIsStale(minutesAgo(60 * 24 * 30), NOW)).toBe(true);
  });

  it("treats an unreadable value as stale", () => {
    expect(lastSeenIsStale("not a date", NOW)).toBe(true);
  });

  it("uses a one-hour interval", () => {
    expect(LAST_SEEN_INTERVAL_MS).toBe(3_600_000);
  });
});

describe("touchCustomerLastSeen", () => {
  const admin = () => supabaseAdmin();

  it("writes nothing while the stored visit is under an hour old", async () => {
    expect(await touchCustomerLastSeen({ id: "c1", account_last_seen_at: minutesAgo(30) }, admin(), NOW)).toBe(false);
    expect(h.updates).toEqual([]);
  });

  it("writes the first visit only while none is stored", async () => {
    expect(await touchCustomerLastSeen({ id: "c1", account_last_seen_at: null }, admin(), NOW)).toBe(true);
    expect(h.updates).toEqual([
      {
        values: { account_last_seen_at: NOW.toISOString() },
        filters: [
          ["eq", "id", "c1"],
          ["is", "account_last_seen_at", null],
        ],
      },
    ]);
  });

  it("rewrites a stale visit only while the stored one is still over an hour old", async () => {
    // The update re-checks the value it read: of two concurrent page loads,
    // the second matches no row and writes nothing.
    expect(await touchCustomerLastSeen({ id: "c1", account_last_seen_at: minutesAgo(90) }, admin(), NOW)).toBe(true);
    expect(h.updates[0].filters).toEqual([
      ["eq", "id", "c1"],
      ["lt", "account_last_seen_at", minutesAgo(60)],
    ]);
  });

  it("reports no write when another load got there first", async () => {
    h.updateResult = "none";
    expect(await touchCustomerLastSeen({ id: "c1", account_last_seen_at: minutesAgo(90) }, admin(), NOW)).toBe(false);
  });

  it.each(["error", "throw"] as const)("swallows a failing write (%s)", async (mode) => {
    h.updateResult = mode;
    await expect(touchCustomerLastSeen({ id: "c1", account_last_seen_at: null }, admin(), NOW)).resolves.toBe(false);
  });
});

describe("linkCustomerToAuthUser records the visit", () => {
  const user = { id: "auth-1", email: "ana@x.test", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {} } as unknown as User;

  it("touches account_last_seen_at for an already-linked Customer", async () => {
    h.customer = { id: "c1", email: "ana@x.test", auth_user_id: "auth-1", account_last_seen_at: null };
    await expect(linkCustomerToAuthUser(user)).resolves.toMatchObject({ id: "c1" });
    expect(h.updates.map((u) => u.values)).toEqual([{ account_last_seen_at: expect.any(String) }]);
  });

  it("does not write while the last visit is fresh", async () => {
    h.customer = {
      id: "c1",
      email: "ana@x.test",
      auth_user_id: "auth-1",
      account_last_seen_at: new Date().toISOString(),
    };
    await linkCustomerToAuthUser(user);
    expect(h.updates).toEqual([]);
  });

  it.each(["error", "throw"] as const)("still returns the Customer when the write fails (%s)", async (mode) => {
    h.customer = { id: "c1", email: "ana@x.test", auth_user_id: "auth-1", account_last_seen_at: null };
    h.updateResult = mode;
    await expect(linkCustomerToAuthUser(user)).resolves.toMatchObject({ id: "c1" });
  });
});
