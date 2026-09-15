import { describe, it, expect, vi } from "vitest";
import {
  decideCustomerLink,
  escapeLikePattern,
  associateGuestOrdersToCustomer,
} from "@/lib/auth/customer-identity";
import { supabaseAdmin } from "@/lib/supabase/server";

const AUTH_ID = "auth-user-1";

/**
 * Records the order→customer backfill query chain so we can assert exactly how
 * guest orders are matched without touching a real database.
 */
function fakeAdmin(matchedOrderIds: string[]) {
  const calls = {
    table: "",
    update: {} as Record<string, unknown>,
    isFilter: [] as [string, unknown][],
    ilikeFilter: [] as [string, string][],
  };
  const builder = {
    update(values: Record<string, unknown>) {
      calls.update = values;
      return builder;
    },
    is(column: string, value: unknown) {
      calls.isFilter.push([column, value]);
      return builder;
    },
    ilike(column: string, pattern: string) {
      calls.ilikeFilter.push([column, pattern]);
      return builder;
    },
    select() {
      return Promise.resolve({
        data: matchedOrderIds.map((id) => ({ id })),
        error: null,
      });
    },
  };
  const admin = {
    from(table: string) {
      calls.table = table;
      return builder;
    },
  } as unknown as ReturnType<typeof supabaseAdmin>;
  return { admin, calls };
}

describe("decideCustomerLink", () => {
  it("creates a fresh customer when no record matches by auth id or email", () => {
    expect(decideCustomerLink({ authUserId: AUTH_ID, byAuthId: null, byEmail: null })).toEqual({
      type: "create",
    });
  });

  it("links an existing guest customer matched by email", () => {
    expect(
      decideCustomerLink({
        authUserId: AUTH_ID,
        byAuthId: null,
        byEmail: { id: "cust-1", auth_user_id: null },
      }),
    ).toEqual({ type: "link_existing", customerId: "cust-1" });
  });

  it("is idempotent when the customer is already linked by auth id", () => {
    expect(
      decideCustomerLink({
        authUserId: AUTH_ID,
        byAuthId: { id: "cust-1", auth_user_id: AUTH_ID },
        byEmail: { id: "cust-1", auth_user_id: AUTH_ID },
      }),
    ).toEqual({ type: "already_linked" });
  });

  it("does not steal a customer already owned by a different auth user", () => {
    expect(
      decideCustomerLink({
        authUserId: AUTH_ID,
        byAuthId: null,
        byEmail: { id: "cust-1", auth_user_id: "someone-else" },
      }),
    ).toEqual({ type: "already_linked" });
  });
});

describe("escapeLikePattern", () => {
  it("escapes LIKE wildcards so emails match literally", () => {
    expect(escapeLikePattern("john_doe@x.com")).toBe("john\\_doe@x.com");
    expect(escapeLikePattern("a%b@x.com")).toBe("a\\%b@x.com");
    expect(escapeLikePattern("a\\b@x.com")).toBe("a\\\\b@x.com");
    expect(escapeLikePattern("a*b@x.com")).toBe("a\\*b@x.com");
  });

  it("leaves emails without wildcards untouched", () => {
    expect(escapeLikePattern("plain@example.com")).toBe("plain@example.com");
  });
});

describe("associateGuestOrdersToCustomer", () => {
  it("only touches unlinked orders matching the customer's email exactly", async () => {
    const { admin, calls } = fakeAdmin(["order-1", "order-2"]);

    const linked = await associateGuestOrdersToCustomer(
      { id: "cust-1", email: "John_Doe@X.com" },
      admin,
    );

    expect(linked).toBe(2);
    expect(calls.table).toBe("orders");
    expect(calls.update).toEqual({ customer_id: "cust-1" });
    // Idempotency: never re-link an order that already has a customer.
    expect(calls.isFilter).toEqual([["customer_id", null]]);
    // Email is normalized to lowercase and wildcard-escaped for an exact match.
    expect(calls.ilikeFilter).toEqual([["email", "john\\_doe@x.com"]]);
  });

  it("is a no-op for a customer without an email", async () => {
    const { admin, calls } = fakeAdmin([]);
    const fromSpy = vi.spyOn(admin, "from");

    const linked = await associateGuestOrdersToCustomer(
      { id: "cust-1", email: "" },
      admin,
    );

    expect(linked).toBe(0);
    expect(fromSpy).not.toHaveBeenCalled();
    expect(calls.table).toBe("");
  });
});
