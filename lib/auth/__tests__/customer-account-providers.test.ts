import type { User, UserIdentity } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Update = { table: string; values: Record<string, unknown>; filters: [string, string, unknown][] };

const h = vi.hoisted(() => ({
  customer: null as Record<string, unknown> | null,
  updates: [] as Update[],
  updateResult: "matched" as "matched" | "none" | "error" | "throw",
}));

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
          return Promise.resolve({ data: h.customer, error: null });
        },
        then(resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) {
          if (table === "orders") return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          h.updates.push({ table, values: values ?? {}, filters });
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
vi.mock("@/lib/customer-migration/claim", () => ({ claimOnSignIn: async () => undefined }));

const { accountProvidersOf, linkCustomerToAuthUser, touchAccountProviders } = await import(
  "@/lib/auth/customer-identity"
);
const { supabaseAdmin } = await import("@/lib/supabase/server");

const identity = (provider: string) => ({ provider }) as UserIdentity;
const user = (providers: string[] | undefined): User =>
  ({
    id: "auth-1",
    email: "ana@x.test",
    email_confirmed_at: "2026-01-01T00:00:00Z",
    user_metadata: {},
    identities: providers?.map(identity),
  }) as unknown as User;

const providerWrites = () => h.updates.filter((u) => "account_providers" in u.values);

beforeEach(() => {
  h.customer = null;
  h.updates = [];
  h.updateResult = "matched";
});

describe("accountProvidersOf", () => {
  it("lists each identity's provider, sorted and once each", () => {
    expect(accountProvidersOf(user(["google", "email"]))).toEqual(["email", "google"]);
    expect(accountProvidersOf(user(["email", "email"]))).toEqual(["email"]);
    expect(accountProvidersOf(user([]))).toEqual([]);
  });

  it("says nothing for a user object that carries no identities", () => {
    expect(accountProvidersOf(user(undefined))).toBeNull();
  });
});

describe("touchAccountProviders", () => {
  const admin = () => supabaseAdmin();
  const row = (account_providers: string[]) => ({ id: "c1", auth_user_id: "auth-1", account_providers });

  it("writes the changed methods, re-checking the login and the value it read", async () => {
    expect(await touchAccountProviders(row(["google"]), user(["google", "email"]), admin())).toBe(true);
    expect(h.updates).toEqual([
      {
        table: "customers",
        values: { account_providers: ["email", "google"] },
        filters: [
          ["eq", "id", "c1"],
          ["eq", "auth_user_id", "auth-1"],
          ["eq", "account_providers", '{"google"}'],
        ],
      },
    ]);
  });

  it("re-checks an empty list as the empty array literal", async () => {
    await touchAccountProviders(row([]), user(["email"]), admin());
    expect(h.updates[0].filters.at(-1)).toEqual(["eq", "account_providers", "{}"]);
  });

  it("writes nothing when the methods are unchanged, in whatever order the identities come", async () => {
    expect(await touchAccountProviders(row(["email", "google"]), user(["google", "email"]), admin())).toBe(false);
    expect(h.updates).toEqual([]);
  });

  it("writes nothing for a row another login owns, or from a user with no identities", async () => {
    expect(await touchAccountProviders({ ...row([]), auth_user_id: "auth-2" }, user(["email"]), admin())).toBe(false);
    expect(await touchAccountProviders(row(["email"]), user(undefined), admin())).toBe(false);
    expect(h.updates).toEqual([]);
  });

  it("reports no write when another load got there first", async () => {
    h.updateResult = "none";
    expect(await touchAccountProviders(row([]), user(["email"]), admin())).toBe(false);
  });

  it.each(["error", "throw"] as const)("swallows a failing write (%s)", async (mode) => {
    h.updateResult = mode;
    await expect(touchAccountProviders(row([]), user(["email"]), admin())).resolves.toBe(false);
  });
});

describe("linkCustomerToAuthUser records how they sign in", () => {
  const linked = (account_providers: string[]) => ({
    id: "c1",
    email: "ana@x.test",
    auth_user_id: "auth-1",
    account_last_seen_at: new Date().toISOString(),
    account_providers,
  });

  it("signing in with Google, then by email code, gives {email,google}; a later load writes nothing", async () => {
    h.customer = linked([]);
    await linkCustomerToAuthUser(user(["google"]));
    expect(providerWrites().map((u) => u.values.account_providers)).toEqual([["google"]]);

    h.updates = [];
    h.customer = linked(["google"]);
    await linkCustomerToAuthUser(user(["google", "email"]));
    expect(providerWrites().map((u) => u.values.account_providers)).toEqual([["email", "google"]]);

    h.updates = [];
    h.customer = linked(["email", "google"]);
    await linkCustomerToAuthUser(user(["email", "google"]));
    expect(h.updates).toEqual([]);
  });

  it.each(["error", "throw"] as const)("still returns the Customer when the write fails (%s)", async (mode) => {
    h.customer = linked([]);
    h.updateResult = mode;
    await expect(linkCustomerToAuthUser(user(["email"]))).resolves.toMatchObject({ id: "c1" });
  });
});
