import { describe, expect, it } from "vitest";
import {
  CUSTOMER_FILTER_PARAMS,
  DEFAULT_CUSTOMER_FILTERS,
  applyCustomerFilters,
  customerFilterParams,
  parseCustomerFilters,
  searchParamsFromRecord,
  type CustomerFilters,
  type CustomerListQuery,
} from "@/lib/crm/customer-filters";

/**
 * The Customers list's filter-to-query mapping (migration slice 12), as a pure
 * function over a recording query stub: every call the list would make on
 * `admin_customer_overview`, in order.
 */

type Call = [method: string, ...args: unknown[]];

function recorder() {
  const calls: Call[] = [];
  const q: CustomerListQuery = {
    or(filters) {
      calls.push(["or", filters]);
      return this;
    },
    overlaps(column, value) {
      calls.push(["overlaps", column, value]);
      return this;
    },
    eq(column, value) {
      calls.push(["eq", column, value]);
      return this;
    },
    gt(column, value) {
      calls.push(["gt", column, value]);
      return this;
    },
    order(column, options) {
      calls.push(["order", column, options]);
      return this;
    },
  };
  return { q, calls };
}

const query = (url: string) => {
  const { filters, ignored } = parseCustomerFilters(new URLSearchParams(url));
  const { q, calls } = recorder();
  applyCustomerFilters(q, filters);
  return { filters, ignored, calls };
};

const newest = ["order", "created_at", { ascending: false }];

describe("parseCustomerFilters", () => {
  it("defaults to every Customer, newest first, page 1 of 20", () => {
    expect(parseCustomerFilters(new URLSearchParams())).toEqual({ filters: DEFAULT_CUSTOMER_FILTERS, ignored: [] });
  });

  it("reads the account and source filters", () => {
    const { filters, ignored } = parseCustomerFilters(new URLSearchParams("account=no-account&source=shopify"));
    expect(filters).toMatchObject({ account: "no-account", source: "shopify" });
    expect(ignored).toEqual([]);
  });

  it("drops an unknown value and names it, never passing it on", () => {
    const { filters, ignored } = parseCustomerFilters(
      new URLSearchParams("account=foo&source=shopify&sort=bogus&page=-2&limit=x"),
    );
    expect(filters).toMatchObject({ account: "all", source: "shopify", sort: "newest", page: 1, limit: 20 });
    expect(ignored.sort()).toEqual(["account", "limit", "page", "sort"]);
  });

  it("caps the page size at 100, as before", () => {
    expect(parseCustomerFilters(new URLSearchParams("limit=500")).filters.limit).toBe(100);
  });

  it("reads search and tags as the old route did", () => {
    const { filters } = parseCustomerFilters(new URLSearchParams("search=%20mei%20&tags=vip,%20wholesale,"));
    expect(filters.search).toBe("mei");
    expect(filters.tags).toEqual(["vip", "wholesale"]);
    expect(parseCustomerFilters(new URLSearchParams("search=%20%20")).filters.search).toBeNull();
  });
});

describe("applyCustomerFilters", () => {
  it("adds no filter for the plain list", () => {
    expect(query("").calls).toEqual([newest]);
  });

  it("maps From Shopify + No account to the two derived columns", () => {
    // The list that matters during the migration: migrated_customers join
    // customers where auth_user_id is null.
    expect(query("source=shopify&account=no-account").calls).toEqual([
      ["eq", "has_account", false],
      ["eq", "from_shopify", true],
      newest,
    ]);
  });

  it("maps Signed up and Platform", () => {
    expect(query("account=signed-up&source=platform").calls).toEqual([
      ["eq", "has_account", true],
      ["eq", "from_shopify", false],
      newest,
    ]);
  });

  it("treats `all` as no filter, not as an ignored value", () => {
    const { calls, ignored } = query("account=all&source=all");
    expect(calls).toEqual([newest]);
    expect(ignored).toEqual([]);
  });

  it("sorts recently signed up first, with no-account Customers last", () => {
    expect(query("sort=signed-up").calls).toEqual([
      ["order", "account_linked_at", { ascending: false, nullsFirst: false }],
      newest,
    ]);
  });

  it("keeps the other sorts", () => {
    expect(query("sort=oldest").calls).toEqual([["order", "created_at", { ascending: true }]]);
    expect(query("sort=name-asc").calls).toEqual([
      ["order", "first_name", { ascending: true }],
      ["order", "last_name", { ascending: true }],
    ]);
    expect(query("sort=name-desc").calls).toEqual([
      ["order", "first_name", { ascending: false }],
      ["order", "last_name", { ascending: false }],
    ]);
  });

  it("keeps the search and tag filters", () => {
    expect(query("search=mei&tags=vip").calls).toEqual([
      ["or", "email.ilike.%mei%,first_name.ilike.%mei%,last_name.ilike.%mei%"],
      ["overlaps", "tags", ["vip"]],
      newest,
    ]);
  });

  it("never applies a dropped value", () => {
    expect(query("account=foo&source=bar&sort=baz").calls).toEqual([newest]);
  });

  it("maps has an open follow-up (CRM slice 06) to open_followups above 0", () => {
    expect(query("followups=open").calls).toEqual([["gt", "open_followups", 0], newest]);
    expect(query("followups=all").calls).toEqual([newest]);
    const dropped = query("followups=overdue");
    expect(dropped.calls).toEqual([newest]);
    expect(dropped.ignored).toEqual(["followups"]);
  });
});

describe("customerFilterParams", () => {
  it("writes only what differs from the default, so the plain list has no query", () => {
    expect(customerFilterParams(DEFAULT_CUSTOMER_FILTERS).toString()).toBe("");
    expect(customerFilterParams({ account: "no-account", source: "shopify" }).toString()).toBe(
      "account=no-account&source=shopify",
    );
  });

  it("round-trips through the parser, so a shared link shows the same list", () => {
    const filters: CustomerFilters = {
      ...DEFAULT_CUSTOMER_FILTERS,
      search: "tan",
      tags: ["vip"],
      account: "signed-up",
      source: "platform",
      followups: "open",
      sort: "signed-up",
      page: 3,
      limit: 50,
    };
    const url = customerFilterParams(filters, { paging: true });
    expect(parseCustomerFilters(url)).toEqual({ filters, ignored: [] });
  });

  it("adds paging only when asked", () => {
    expect(customerFilterParams({ page: 2 }).has("page")).toBe(false);
    expect(customerFilterParams({ page: 2 }, { paging: true }).toString()).toBe("page=2&limit=20");
  });
});

describe("CUSTOMER_FILTER_PARAMS", () => {
  it("names every key the filters own, and not the page's tab (`view`, CRM slice 14)", () => {
    expect([...CUSTOMER_FILTER_PARAMS].sort()).toEqual(["account", "followups", "limit", "page", "search", "sort", "source", "tags"]);
    expect(CUSTOMER_FILTER_PARAMS).not.toContain("view");
  });
});

describe("searchParamsFromRecord", () => {
  it("takes a Next.js page's searchParams, first value of a repeated key", () => {
    expect(searchParamsFromRecord({ account: ["no-account", "signed-up"], source: "shopify", x: undefined }).toString()).toBe(
      "account=no-account&source=shopify",
    );
  });
});
