import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  CUSTOMER_FILTER_KEYS,
  CUSTOMER_FILTER_PARAMS,
  DEFAULT_CUSTOMER_FILTERS,
  applyCustomerFilters,
  clearCustomerFilter,
  clearCustomerFilters,
  customerFilterParams,
  customerFiltersSchema,
  describeCustomerFilters,
  monthsBefore,
  parseCustomerFilters,
  pgTextArray,
  searchParamsFromRecord,
  type CustomerFilters,
  type CustomerListQuery,
} from "@/lib/crm/customer-filters";

/**
 * The Customers list's one filter schema and its filter-to-query mapping
 * (migration slice 12, CRM slice 04), as pure functions over a recording query
 * stub: every call the list would make on `admin_customer_overview`, in order.
 */

type Call = [method: string, ...args: unknown[]];

/** Records every call. It has no `or`: the mapping has no way to send one (ADR 0028 (d)). */
function recorder() {
  const calls: Call[] = [];
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push([method, ...args]);
      return q;
    };
  const q = {
    ilike: record("ilike"),
    overlaps: record("overlaps"),
    contains: record("contains"),
    eq: record("eq"),
    neq: record("neq"),
    in: record("in"),
    is: record("is"),
    not: record("not"),
    gt: record("gt"),
    gte: record("gte"),
    lt: record("lt"),
    lte: record("lte"),
    order: record("order"),
  } as CustomerListQuery;
  return { q, calls };
}

const NOW = new Date("2026-10-21T04:00:00.000Z");

const query = (url: string) => {
  const { filters, ignored } = parseCustomerFilters(new URLSearchParams(url));
  const { q, calls } = recorder();
  applyCustomerFilters(q, filters, { now: NOW });
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

  it("reads search and tags", () => {
    const { filters } = parseCustomerFilters(new URLSearchParams("search=%20mei%20&tags=vip,%20wholesale,"));
    expect(filters.search).toBe("mei");
    expect(filters.tags).toEqual(["vip", "wholesale"]);
    expect(parseCustomerFilters(new URLSearchParams("search=%20%20")).filters.search).toBeNull();
  });

  describe("the CRM filters (slice 04)", () => {
    it("reads what they bought, once each, in a fixed order", () => {
      const { filters, ignored } = parseCustomerFilters(new URLSearchParams("bought=mbolster,premium,premium"));
      expect(filters.bought).toEqual(["premium", "mbolster"]);
      expect(ignored).toEqual([]);
    });

    it("reads the last order as within or over a number of months", () => {
      expect(parseCustomerFilters(new URLSearchParams("last_order=over:12")).filters.last_order).toEqual({
        when: "over",
        months: 12,
      });
      expect(parseCustomerFilters(new URLSearchParams("last_order=within%3A6")).filters.last_order).toEqual({
        when: "within",
        months: 6,
      });
    });

    it("reads re-adjusted ever or never, and a minimum spend", () => {
      const { filters } = parseCustomerFilters(new URLSearchParams("readjusted=never&min_spend=500.50"));
      expect(filters).toMatchObject({ readjusted: "never", min_spend: 500.5 });
    });

    it.each([
      ["bought=foo", "bought"],
      ["bought=premium,foo", "bought"],
      ["last_order=soon", "last_order"],
      ["last_order=within:0", "last_order"],
      ["last_order=over:121", "last_order"],
      ["last_order=over:-3", "last_order"],
      ["readjusted=sometimes", "readjusted"],
      ["min_spend=-5", "min_spend"],
      ["min_spend=1e3", "min_spend"],
      ["min_spend=0", "min_spend"],
      ["min_spend=abc", "min_spend"],
    ])("drops %s, and the query never sees it", (url, key) => {
      const { filters, ignored, calls } = query(url);
      expect(ignored).toEqual([key]);
      expect(filters).toEqual(DEFAULT_CUSTOMER_FILTERS);
      expect(calls).toEqual([newest]);
    });

    it("keeps the valid filters beside a dropped one: one filter ignored", () => {
      const { filters, ignored } = parseCustomerFilters(new URLSearchParams("bought=foo&readjusted=never"));
      expect(ignored).toEqual(["bought"]);
      expect(filters.readjusted).toBe("never");
      expect(filters.bought).toEqual([]);
    });

    it("treats an empty list as no filter, not as an ignored value", () => {
      const { filters, ignored } = parseCustomerFilters(new URLSearchParams("bought=&tags="));
      expect(ignored).toEqual([]);
      expect(filters).toMatchObject({ bought: [], tags: [] });
    });
  });
});

describe("customerFiltersSchema", () => {
  it("is the one schema: a stored set of parameters reads as the same link does", () => {
    // What a Segment (CRM slice 05) stores: the list's own parameters.
    const stored = Object.fromEntries(
      customerFilterParams({ bought: ["premium"], last_order: { when: "over", months: 12 }, readjusted: "never" }),
    );
    expect(stored).toEqual({ bought: "premium", last_order: "over:12", readjusted: "never" });
    const fromStore = customerFiltersSchema.parse(stored);
    const fromUrl = parseCustomerFilters(new URLSearchParams("bought=premium&last_order=over:12&readjusted=never"));
    expect({ ...DEFAULT_CUSTOMER_FILTERS, ...fromStore }).toEqual(fromUrl.filters);
  });

  it("refuses a value the list would drop", () => {
    expect(customerFiltersSchema.safeParse({ bought: "foo" }).success).toBe(false);
    expect(customerFiltersSchema.safeParse({ last_order: "over:0" }).success).toBe(false);
  });
});

describe("applyCustomerFilters", () => {
  it("adds no filter for the plain list", () => {
    expect(query("").calls).toEqual([newest]);
  });

  it("with order: false applies the same filters and leaves the order to the caller (a Segment's count and resolve)", () => {
    const url = "bought=premium&last_order=over:12&readjusted=never&sort=spend";
    const { filters } = parseCustomerFilters(new URLSearchParams(url));
    const { q, calls } = recorder();
    applyCustomerFilters(q, filters, { now: NOW, order: false });
    expect(calls).toEqual(query(url).calls.filter(([method]) => method !== "order"));
    expect(calls.length).toBe(3);
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

  it("sorts by last order, never-ordered last, and by spend", () => {
    expect(query("sort=last-order").calls).toEqual([
      ["order", "last_purchase_at", { ascending: false, nullsFirst: false }],
      newest,
    ]);
    expect(query("sort=spend").calls).toEqual([["order", "total_spent", { ascending: false }], newest]);
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

  describe("search (ADR 0028 (d))", () => {
    it("is one ilike on search_text", () => {
      expect(query("search=mei").calls).toEqual([["ilike", "search_text", "%mei%"], newest]);
    });

    it.each([
      ["Tan, Mei", "%Tan, Mei%"],
      ["(test)", "%(test)%"],
      ["a%b", "%a\\%b%"],
      ["a_b*", "%a\\_b\\*%"],
      ["back\\slash", "%back\\\\slash%"],
      ["x,first_name.eq.y", "%x,first\\_name.eq.y%"],
    ])("sends %j as text, its wildcards escaped", (search, pattern) => {
      const { calls } = query(new URLSearchParams({ search }).toString());
      expect(calls).toEqual([["ilike", "search_text", pattern], newest]);
      expect(calls.some(([m]) => m === "or")).toBe(false);
    });
  });

  it("matches any of the tags, each quoted in the array literal", () => {
    expect(query("search=mei&tags=vip").calls).toEqual([
      ["ilike", "search_text", "%mei%"],
      ["overlaps", "tags", '{"vip"}'],
      newest,
    ]);
    expect(query(new URLSearchParams({ tags: 'a"b,c\\d,{e}' }).toString()).calls[0]).toEqual([
      "overlaps",
      "tags",
      '{"a\\"b","c\\\\d","{e}"}',
    ]);
  });

  it("matches any of what they bought", () => {
    expect(query("bought=premium,accessory").calls).toEqual([
      ["overlaps", "bought", '{"premium","accessory"}'],
      newest,
    ]);
  });

  it("counts the last order back from now, in calendar months", () => {
    expect(query("last_order=within:6").calls).toEqual([["gte", "last_purchase_at", "2026-04-21T04:00:00.000Z"], newest]);
    expect(query("last_order=over:12").calls).toEqual([["lt", "last_purchase_at", "2025-10-21T04:00:00.000Z"], newest]);
  });

  it("maps re-adjusted ever and never to the attended booking's date", () => {
    expect(query("readjusted=ever").calls).toEqual([["not", "last_readjusted_at", "is", null], newest]);
    expect(query("readjusted=never").calls).toEqual([["is", "last_readjusted_at", null], newest]);
  });

  it("maps a minimum spend to total_spent", () => {
    expect(query("min_spend=500").calls).toEqual([["gte", "total_spent", 500], newest]);
  });

  it("maps the PRD's list: Premium buyers from over a year ago who never re-adjusted", () => {
    const { calls, ignored } = query("bought=premium&last_order=over:12&readjusted=never");
    expect(ignored).toEqual([]);
    expect(calls).toEqual([
      ["overlaps", "bought", '{"premium"}'],
      ["lt", "last_purchase_at", "2025-10-21T04:00:00.000Z"],
      ["is", "last_readjusted_at", null],
      newest,
    ]);
  });

  it("never applies a dropped value", () => {
    expect(query("account=foo&source=bar&sort=baz&bought=qux&points=lots").calls).toEqual([newest]);
  });

  it("maps the Points filter to the overview's available balance (PRD-loyalty-points slice 06)", () => {
    // Has points: a balance above 0. No points: the rest, since a balance is never below 0.
    expect(query("points=has").calls).toEqual([["gt", "points_available", 0], newest]);
    expect(query("points=none&source=shopify").calls).toEqual([
      ["eq", "from_shopify", true],
      ["lte", "points_available", 0],
      newest,
    ]);
    const { calls, ignored } = query("points=all");
    expect(calls).toEqual([newest]);
    expect(ignored).toEqual([]);
  });

  it("drops a points value the list does not offer, and names it", () => {
    expect(query("points=pending").ignored).toEqual(["points"]);
  });

  it("no longer reads the retired voucher filter (slice 06): a link that carries one lists as without it", () => {
    const { calls, ignored } = query("voucher=issued&source=shopify");
    expect(calls).toEqual([["eq", "from_shopify", true], newest]);
    expect(ignored).toEqual([]);
  });

  // Email consent (migration slice 07): the URL's words, the view's states.
  it.each([
    ["subscribed", "subscribed"],
    ["not-subscribed", "not_subscribed"],
    ["unsubscribed", "unsubscribed"],
  ])("maps consent=%s to marketing_email = %s", (param, state) => {
    expect(query(`consent=${param}`).calls).toEqual([["eq", "marketing_email", state], newest]);
  });

  it("drops an unknown consent, and never passes the database's own spelling through", () => {
    for (const bad of ["yes", "not_subscribed"]) {
      const { calls, ignored } = query(`consent=${bad}`);
      expect(calls).toEqual([newest]);
      expect(ignored).toEqual(["consent"]);
    }
    expect(query("consent=all").calls).toEqual([newest]);
  });

  it("combines consent with From Shopify", () => {
    expect(query("source=shopify&consent=subscribed").calls).toEqual([
      ["eq", "from_shopify", true],
      ["eq", "marketing_email", "subscribed"],
      newest,
    ]);
  });

  it("maps has an open follow-up (CRM slice 06) to open_followups above 0", () => {
    expect(query("followups=open").calls).toEqual([["gt", "open_followups", 0], newest]);
    expect(query("followups=all").calls).toEqual([newest]);
    const dropped = query("followups=overdue");
    expect(dropped.calls).toEqual([newest]);
    expect(dropped.ignored).toEqual(["followups"]);
  });
});

describe("Contact status filters (CRM slice 11)", () => {
  it("maps Google linked and not linked to the sign-in methods", () => {
    expect(query("google=linked").calls).toEqual([["contains", "account_providers", ["google"]], newest]);
    // Not linked includes every Customer with no account, whose list is empty.
    expect(query("google=not-linked").calls).toEqual([["not", "account_providers", "cs", "{google}"], newest]);
  });

  it("maps the three Mobile values to the two derived columns, so each Customer is in exactly one", () => {
    expect(query("mobile=on-file").calls).toEqual([["eq", "phone_valid", true], newest]);
    expect(query("mobile=missing").calls).toEqual([["eq", "has_phone", false], newest]);
    expect(query("mobile=invalid").calls).toEqual([
      ["eq", "has_phone", true],
      ["eq", "phone_valid", false],
      newest,
    ]);
  });

  it("reads them from the URL, drops an unknown value, and writes them back", () => {
    const { filters, ignored } = parseCustomerFilters(new URLSearchParams("google=linked&mobile=nope"));
    expect(filters).toMatchObject({ google: "linked", mobile: "all" });
    expect(ignored).toEqual(["mobile"]);
    expect(customerFilterParams({ google: "not-linked", mobile: "invalid" }).toString()).toBe(
      "google=not-linked&mobile=invalid",
    );
  });

  it("has no Email filter of its own: email verified is Signed up", () => {
    expect(CUSTOMER_FILTER_PARAMS).not.toContain("email");
    expect(query("account=signed-up").calls).toEqual([["eq", "has_account", true], newest]);
  });

  it("labels them, the Points filter and the Follow-ups filter in the active-filter summary", () => {
    const { filters } = parseCustomerFilters(
      new URLSearchParams("google=not-linked&mobile=invalid&points=has&followups=open"),
    );
    expect(describeCustomerFilters(filters)).toEqual([
      { key: "google", label: "Google not linked" },
      { key: "mobile", label: "Mobile invalid" },
      { key: "points", label: "Has points" },
      { key: "followups", label: "Has an open follow-up" },
    ]);
    expect(describeCustomerFilters(parseCustomerFilters(new URLSearchParams("points=none")).filters)).toEqual([
      { key: "points", label: "No points" },
    ]);
  });
});

describe("Review filters (CRM slice 12)", () => {
  it("maps the Google review to the two derived dates, so each Customer is in exactly one value", () => {
    expect(query("google_review=linked").calls).toEqual([["not", "google_reviewed_at", "is", null], newest]);
    expect(query("google_review=asked").calls).toEqual([
      ["not", "review_requested_at", "is", null],
      ["is", "google_reviewed_at", null],
      newest,
    ]);
    expect(query("google_review=not-asked").calls).toEqual([
      ["is", "review_requested_at", null],
      ["is", "google_reviewed_at", null],
      newest,
    ]);
  });

  it("maps Shop review yes and no to the count, and the three ratings to review_rating", () => {
    expect(query("shop_review=yes").calls).toEqual([["gt", "shop_reviews_count", 0], newest]);
    expect(query("shop_review=no").calls).toEqual([["eq", "shop_reviews_count", 0], newest]);
    expect(query("rating=5").calls).toEqual([["eq", "review_rating", 5], newest]);
    expect(query("rating=4-up").calls).toEqual([["gte", "review_rating", 4], newest]);
    expect(query("rating=3-down").calls).toEqual([["lte", "review_rating", 3], newest]);
  });

  it("makes *reviewed us 5★ on Google* one link that reads back the same, for a Segment", () => {
    const params = customerFilterParams({ google_review: "linked", rating: "5" });
    expect(params.toString()).toBe("google_review=linked&rating=5");
    const { filters, ignored } = parseCustomerFilters(params);
    expect(ignored).toEqual([]);
    expect(customerFiltersSchema.parse({ google_review: "linked", rating: "5" })).toEqual({
      google_review: "linked",
      rating: "5",
    });
    expect(describeCustomerFilters(filters)).toEqual([
      { key: "google_review", label: "Google review linked" },
      { key: "rating", label: "Rated 5★" },
    ]);
  });

  it("drops an unknown value and names it, and labels the rest", () => {
    const { filters, ignored } = parseCustomerFilters(
      new URLSearchParams("google_review=maybe&shop_review=no&rating=4-up"),
    );
    expect(ignored).toEqual(["google_review"]);
    expect(filters).toMatchObject({ google_review: "all", shop_review: "no", rating: "4-up" });
    expect(describeCustomerFilters(filters)).toEqual([
      { key: "shop_review", label: "No shop review" },
      { key: "rating", label: "Rated 4★ and up" },
    ]);
    expect(describeCustomerFilters(parseCustomerFilters(new URLSearchParams("google_review=asked&rating=3-down")).filters)).toEqual([
      { key: "google_review", label: "Asked, no Google review linked" },
      { key: "rating", label: "Rated 3★ and below" },
    ]);
  });

  it("clears each with Clear all", () => {
    const { filters } = parseCustomerFilters(new URLSearchParams("google_review=not-asked&shop_review=yes&rating=5"));
    expect(clearCustomerFilters(filters)).toMatchObject({ google_review: "all", shop_review: "all", rating: null });
  });
});

describe("on the real Supabase query builder", () => {
  // No request is sent: the builder's URL is what PostgREST would receive.
  const builder = () =>
    createClient("http://localhost:54321", "anon-key").from("admin_customer_overview").select("id", { count: "exact" });
  const urlOf = (search: string) => {
    const { filters } = parseCustomerFilters(new URLSearchParams(search));
    const q = applyCustomerFilters(builder() as unknown as CustomerListQuery, filters, { now: NOW });
    return (q as unknown as { url: URL }).url;
  };

  it.each(["Tan, Mei", "(test)", "a%b"])("sends %j as one search_text=ilike parameter, never or=", (search) => {
    const url = urlOf(new URLSearchParams({ search }).toString());
    expect(url.searchParams.has("or")).toBe(false);
    expect(url.searchParams.getAll("search_text")).toEqual([`ilike.%${search.replace("%", "\\%")}%`]);
  });

  it("sends the PRD's list as three plain filters", () => {
    const url = urlOf("bought=premium&last_order=over:12&readjusted=never");
    expect(url.searchParams.get("bought")).toBe('ov.{"premium"}');
    expect(url.searchParams.get("last_purchase_at")).toBe("lt.2025-10-21T04:00:00.000Z");
    expect(url.searchParams.get("last_readjusted_at")).toBe("is.null");
    expect(url.searchParams.has("or")).toBe(false);
  });

  it("sends re-adjusted ever as not.is.null", () => {
    expect(urlOf("readjusted=ever").searchParams.get("last_readjusted_at")).toBe("not.is.null");
  });

  it("sends *reviewed us 5★ on Google* as two plain filters (CRM slice 12)", () => {
    const url = urlOf("google_review=linked&rating=5");
    expect(url.searchParams.get("google_reviewed_at")).toBe("not.is.null");
    expect(url.searchParams.get("review_rating")).toBe("eq.5");
    expect(urlOf("rating=3-down").searchParams.get("review_rating")).toBe("lte.3");
    expect(url.searchParams.has("or")).toBe(false);
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
      search: "Tan, Mei",
      tags: ["vip", 'say "hi"'],
      account: "signed-up",
      source: "platform",
      google: "linked",
      mobile: "missing",
      points: "has",
      followups: "open",
      consent: "unsubscribed",
      stage: ["lead", "awaiting_delivery", "lapsed"],
      bought: ["premium", "mbolster"],
      not_bought: ["basic", "accessory"],
      size: ["S", "XL"],
      last_order: { when: "over", months: 18 },
      delivered: { when: "within", days: 14 },
      readjusted: "never",
      min_spend: 249.9,
      sort: "last-order",
      page: 3,
      limit: 50,
    };
    const url = customerFilterParams(filters, { paging: true });
    expect(parseCustomerFilters(new URLSearchParams(url.toString()))).toEqual({ filters, ignored: [] });
  });

  it("writes a minimum spend as a plain amount", () => {
    expect(customerFilterParams({ min_spend: 0.1 + 0.2 }).get("min_spend")).toBe("0.3");
  });

  it("adds paging only when asked", () => {
    expect(customerFilterParams({ page: 2 }).has("page")).toBe(false);
    expect(customerFilterParams({ page: 2 }, { paging: true }).toString()).toBe("page=2&limit=20");
  });
});

describe("CUSTOMER_FILTER_PARAMS", () => {
  it("names every key the filters own, and not the page's tab (`view`, CRM slice 14)", () => {
    expect([...CUSTOMER_FILTER_PARAMS].sort()).toEqual([
      "account",
      "bought",
      "campaign",
      "consent",
      "delivered",
      "emailed",
      "engagement",
      "followups",
      "google",
      "google_review",
      "language",
      "last_order",
      "limit",
      "min_spend",
      "mobile",
      "not_bought",
      "page",
      "points",
      "rating",
      "readjusted",
      "search",
      "ships_to",
      "shop_review",
      "size",
      "sort",
      "source",
      "stage",
      "tags",
    ]);
    expect(CUSTOMER_FILTER_PARAMS).not.toContain("view");
  });

  it("chooses Customers with every key but the sort and paging", () => {
    expect([...CUSTOMER_FILTER_KEYS].sort()).toEqual([
      "account",
      "bought",
      "campaign",
      "consent",
      "delivered",
      "emailed",
      "engagement",
      "followups",
      "google",
      "google_review",
      "language",
      "last_order",
      "min_spend",
      "mobile",
      "not_bought",
      "points",
      "rating",
      "readjusted",
      "search",
      "ships_to",
      "shop_review",
      "size",
      "source",
      "stage",
      "tags",
    ]);
  });
});

describe("the active-filter summary", () => {
  const filters = parseCustomerFilters(
    new URLSearchParams("search=tan&bought=premium,mbolster&last_order=over:12&readjusted=never&min_spend=500&account=no-account&sort=spend"),
  ).filters;

  it("labels each active filter, and not the sort", () => {
    expect(describeCustomerFilters(filters)).toEqual([
      { key: "search", label: "Search: “tan”" },
      { key: "account", label: "No account" },
      { key: "bought", label: "Bought Premium Mpillow or Mbolster" },
      { key: "last_order", label: "Last order over a year ago" },
      { key: "readjusted", label: "Never re-adjusted" },
      { key: "min_spend", label: "Spent at least $500.00" },
    ]);
    expect(describeCustomerFilters(DEFAULT_CUSTOMER_FILTERS)).toEqual([]);
  });

  it("says months, a year, or years", () => {
    const label = (search: string) => describeCustomerFilters(parseCustomerFilters(new URLSearchParams(search)).filters)[0].label;
    expect(label("last_order=within:1")).toBe("Last order within a month");
    expect(label("last_order=within:6")).toBe("Last order within 6 months");
    expect(label("last_order=over:24")).toBe("Last order over 2 years ago");
  });

  it("labels Email consent (migration slice 07), and clears it with its ×", () => {
    const label = (search: string) => describeCustomerFilters(parseCustomerFilters(new URLSearchParams(search)).filters)[0].label;
    expect(label("consent=subscribed")).toBe("Email subscribed");
    expect(label("consent=not-subscribed")).toBe("Email not subscribed");
    expect(label("consent=unsubscribed")).toBe("Email unsubscribed");
    const withConsent = parseCustomerFilters(new URLSearchParams("consent=unsubscribed&source=shopify")).filters;
    expect(describeCustomerFilters(withConsent).map((f) => f.key)).toEqual(["source", "consent"]);
    expect(clearCustomerFilter(withConsent, "consent")).toMatchObject({ consent: "all", source: "shopify" });
  });

  it("clears one filter with its ×, and every filter but the sort with Clear all", () => {
    expect(clearCustomerFilter(filters, "bought").bought).toEqual([]);
    expect(clearCustomerFilter(filters, "bought").readjusted).toBe("never");
    expect(clearCustomerFilters(filters)).toEqual({ ...DEFAULT_CUSTOMER_FILTERS, sort: "spend" });
  });
});

describe("monthsBefore", () => {
  it("counts calendar months, clamping to a shorter month's last day as Postgres does", () => {
    expect(monthsBefore(new Date("2026-10-21T04:00:00Z"), 12).toISOString()).toBe("2025-10-21T04:00:00.000Z");
    expect(monthsBefore(new Date("2026-03-31T10:00:00Z"), 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(monthsBefore(new Date("2028-03-31T10:00:00Z"), 1).toISOString()).toBe("2028-02-29T10:00:00.000Z");
    expect(monthsBefore(new Date("2026-01-15T00:00:00Z"), 3).toISOString()).toBe("2025-10-15T00:00:00.000Z");
  });
});

describe("pgTextArray", () => {
  it("quotes every element, escaping quotes and backslashes", () => {
    expect(pgTextArray(["vip"])).toBe('{"vip"}');
    expect(pgTextArray(['a"b', "c\\d", "e,f"])).toBe('{"a\\"b","c\\\\d","e,f"}');
  });
});

describe("searchParamsFromRecord", () => {
  it("takes a Next.js page's searchParams, first value of a repeated key", () => {
    expect(searchParamsFromRecord({ account: ["no-account", "signed-up"], source: "shopify", x: undefined }).toString()).toBe(
      "account=no-account&source=shopify",
    );
  });
});

// PRD-crm-retention-loop slice 03: *Stage*, the overview's lifecycle_stage.
describe("the Stage filter", () => {
  it("reads hyphenated stages into the overview's words, in stage order, once each", () => {
    expect(parseCustomerFilters(new URLSearchParams("stage=lost,at-risk,lost")).filters.stage).toEqual(["at_risk", "lost"]);
    expect(parseCustomerFilters(new URLSearchParams("stage=lead")).filters.stage).toEqual(["lead"]);
  });

  it("drops the whole parameter for an unknown stage, the underscore spelling included", () => {
    // `repeat` and `lapsed` were stages before the funnel (2026-10-28); Lapsed is now At risk's sub-status.
    for (const bad of ["stage=vip", "stage=at_risk", "stage=new,whale", "stage=repeat", "stage=lapsed", "stage="]) {
      const { filters, ignored } = parseCustomerFilters(new URLSearchParams(bad));
      expect(filters.stage, bad).toEqual([]);
      if (bad !== "stage=") expect(ignored, bad).toEqual(["stage"]);
    }
  });

  it("writes the same URL back, and nothing for no stage", () => {
    const { filters } = parseCustomerFilters(new URLSearchParams("stage=lost,at-risk"));
    expect(customerFilterParams(filters).toString()).toBe("stage=at-risk%2Clost");
    expect(customerFilterParams({ stage: [] }).toString()).toBe("");
  });

  it("is one `in` on lifecycle_stage", () => {
    expect(query("stage=at-risk,lost").calls).toEqual([
      ["in", "lifecycle_stage", ["at_risk", "lost"]],
      ["order", "created_at", { ascending: false }],
    ]);
  });

  it("labels and clears like every other filter", () => {
    const filters = parseCustomerFilters(new URLSearchParams("stage=at-risk,lost&bought=premium")).filters;
    expect(describeCustomerFilters(filters)[0]).toEqual({ key: "stage", label: "Stage: At risk or Lost" });
    expect(clearCustomerFilter(filters, "stage")).toMatchObject({ stage: [], bought: ["premium"] });
  });

  it("goes to PostgREST as in.(…)", () => {
    const { filters } = parseCustomerFilters(new URLSearchParams("stage=at-risk,lost"));
    const builder = createClient("http://localhost:54321", "anon-key").from("admin_customer_overview").select("id");
    const q = applyCustomerFilters(builder as unknown as CustomerListQuery, filters, { now: NOW });
    expect((q as unknown as { url: URL }).url.searchParams.get("lifecycle_stage")).toBe("in.(at_risk,lost)");
  });
});

// PRD-campaign-audiences slice 04: the Playbooks' audiences.
describe("Purchase filters (PRD-campaign-audiences slice 04)", () => {
  const label = (search: string) =>
    describeCustomerFilters(parseCustomerFilters(new URLSearchParams(search)).filters).map((f) => f.label);

  describe("Didn't buy", () => {
    it("reads the classes Bought reads, once each, in the same order", () => {
      expect(parseCustomerFilters(new URLSearchParams("not_bought=accessory,mbolster,accessory")).filters.not_bought).toEqual([
        "mbolster",
        "accessory",
      ]);
      expect(parseCustomerFilters(new URLSearchParams("not_bought=pillow"))).toMatchObject({
        filters: { not_bought: [] },
        ignored: ["not_bought"],
      });
    });

    it("is not.ov on the same `bought` column, so beside Bought it is one query", () => {
      expect(query("bought=premium&not_bought=mbolster").calls).toEqual([
        ["overlaps", "bought", '{"premium"}'],
        ["not", "bought", "ov", '{"mbolster"}'],
        newest,
      ]);
    });

    it("labels and writes back like Bought", () => {
      expect(label("bought=premium&not_bought=mbolster,accessory")).toEqual([
        "Bought Premium Mpillow",
        "Didn't buy Mbolster or Accessories",
      ]);
      expect(customerFilterParams({ not_bought: ["mbolster"] }).toString()).toBe("not_bought=mbolster");
    });
  });

  describe("Pillow size", () => {
    it("reads lower-case sizes into the overview's, smallest first, once each", () => {
      expect(parseCustomerFilters(new URLSearchParams("size=xl,m,m")).filters.size).toEqual(["M", "XL"]);
      for (const bad of ["size=M", "size=xxl", "size=m,big"]) {
        expect(parseCustomerFilters(new URLSearchParams(bad)), bad).toMatchObject({ filters: { size: [] }, ignored: ["size"] });
      }
    });

    it("is one overlap on pillow_sizes, and writes lower case back", () => {
      expect(query("size=m,l").calls).toEqual([["overlaps", "pillow_sizes", '{"M","L"}'], newest]);
      expect(customerFilterParams({ size: ["M", "L"] }).toString()).toBe("size=m%2Cl");
      expect(label("size=m,l")).toEqual(["Pillow size M or L"]);
    });
  });

  describe("Delivered", () => {
    it("reads within or over a number of days, 1 to 730", () => {
      expect(parseCustomerFilters(new URLSearchParams("delivered=over:30")).filters.delivered).toEqual({ when: "over", days: 30 });
      for (const bad of ["delivered=over:0", "delivered=within:731", "delivered=since:14", "delivered=over:1.5", "delivered=14"]) {
        expect(parseCustomerFilters(new URLSearchParams(bad)), bad).toMatchObject({ filters: { delivered: null }, ignored: ["delivered"] });
      }
    });

    it("counts whole days back from now on last_delivered_at", () => {
      expect(query("delivered=within:14").calls).toEqual([["gte", "last_delivered_at", "2026-10-07T04:00:00.000Z"], newest]);
      expect(query("delivered=over:30").calls).toEqual([["lt", "last_delivered_at", "2026-09-21T04:00:00.000Z"], newest]);
    });

    it("labels days", () => {
      expect(label("delivered=within:14")).toEqual(["Delivered within 14 days"]);
      expect(label("delivered=over:1")).toEqual(["Delivered over a day ago"]);
      expect(customerFilterParams({ delivered: { when: "over", days: 30 } }).toString()).toBe("delivered=over%3A30");
    });
  });

  describe("Stage sub-statuses", () => {
    it("reads each sub-status after its stage, in funnel order", () => {
      expect(
        parseCustomerFilters(new URLSearchParams("stage=at-risk:lapsed,new:awaiting-delivery,loyal:repeat-purchases,lead")).filters
          .stage,
      ).toEqual(["lead", "awaiting_delivery", "repeat_purchases", "lapsed"]);
      for (const sub of ["new:delivered", "new:settled", "loyal:bookings"]) {
        expect(parseCustomerFilters(new URLSearchParams(`stage=${sub}`)).ignored, sub).toEqual([]);
      }
    });

    it("refuses a sub-status under the wrong stage, or in the database's spelling", () => {
      for (const bad of ["stage=loyal:lapsed", "stage=at-risk:awaiting-delivery", "stage=new:awaiting_delivery", "stage=lost:lapsed"]) {
        expect(parseCustomerFilters(new URLSearchParams(bad)), bad).toMatchObject({ filters: { stage: [] }, ignored: ["stage"] });
      }
    });

    it("drops a sub-status beside its own stage: the stage holds it", () => {
      expect(parseCustomerFilters(new URLSearchParams("stage=new:delivered,new,at-risk:lapsed")).filters.stage).toEqual([
        "new",
        "lapsed",
      ]);
    });

    it("is one overlap on lifecycle_statuses with a sub-status, and `in` on the stage without", () => {
      expect(query("stage=new,at-risk:lapsed").calls).toEqual([
        ["overlaps", "lifecycle_statuses", '{"new","lapsed"}'],
        newest,
      ]);
      expect(query("stage=new,at-risk").calls).toEqual([["in", "lifecycle_stage", ["new", "at_risk"]], newest]);
    });

    it("labels a sub-status with its stage, and writes it back", () => {
      expect(label("stage=new,at-risk:lapsed")).toEqual(["Stage: New or At risk · Lapsed"]);
      const { filters } = parseCustomerFilters(new URLSearchParams("stage=at-risk:lapsed,new:awaiting-delivery"));
      expect(customerFilterParams(filters).get("stage")).toBe("new:awaiting-delivery,at-risk:lapsed");
    });
  });

  it("makes the PRD's demo one link: Bought Premium, Didn't buy Mbolster, Delivered over 30 days ago", () => {
    const search = "bought=premium&not_bought=mbolster&delivered=over:30";
    const { filters, ignored } = parseCustomerFilters(new URLSearchParams(search));
    expect(ignored).toEqual([]);
    expect(customerFilterParams(filters).toString()).toBe("bought=premium&not_bought=mbolster&delivered=over%3A30");
    expect(describeCustomerFilters(filters).map((f) => f.label)).toEqual([
      "Bought Premium Mpillow",
      "Didn't buy Mbolster",
      "Delivered over 30 days ago",
    ]);
    expect(clearCustomerFilters(filters)).toEqual(DEFAULT_CUSTOMER_FILTERS);
  });

  it("goes to PostgREST as plain filters, never or=", () => {
    const builder = createClient("http://localhost:54321", "anon-key").from("admin_customer_overview").select("id");
    const { filters } = parseCustomerFilters(
      new URLSearchParams("stage=new,at-risk:lapsed&bought=premium&not_bought=mbolster&size=m&delivered=over:30"),
    );
    const url = (applyCustomerFilters(builder as unknown as CustomerListQuery, filters, { now: NOW }) as unknown as { url: URL }).url;
    expect(url.searchParams.get("lifecycle_statuses")).toBe('ov.{"new","lapsed"}');
    expect(url.searchParams.getAll("bought")).toEqual(['ov.{"premium"}', 'not.ov.{"mbolster"}']);
    expect(url.searchParams.get("pillow_sizes")).toBe('ov.{"M"}');
    expect(url.searchParams.get("last_delivered_at")).toBe("lt.2026-09-21T04:00:00.000Z");
    expect(url.searchParams.has("or")).toBe(false);
  });
});

// PRD-campaign-audiences slice 05: where they are, what they read, what we last sent them.
describe("Reach filters (PRD-campaign-audiences slice 05)", () => {
  const CAMPAIGN = "0b5c6c1e-2a7d-4c4e-9f3a-1d2e3f4a5b6c";
  const names = new Map([[CAMPAIGN, "November care tips"]]);
  const label = (search: string) =>
    describeCustomerFilters(parseCustomerFilters(new URLSearchParams(search)).filters, { campaignNames: names }).map(
      (f) => f.label,
    );

  describe("Ships to", () => {
    it("reads Singapore, outside it, or unknown", () => {
      expect(parseCustomerFilters(new URLSearchParams("ships_to=not-sg")).filters.ships_to).toBe("not-sg");
      for (const bad of ["ships_to=SG", "ships_to=my", "ships_to=sg,unknown"]) {
        expect(parseCustomerFilters(new URLSearchParams(bad)), bad).toMatchObject({ filters: { ships_to: null }, ignored: ["ships_to"] });
      }
    });

    it("never takes an unknown country for Singapore, nor for outside it", () => {
      expect(query("ships_to=sg").calls).toEqual([["eq", "ship_country", "SG"], newest]);
      // `<>` never lists a null: Unknown stays out of *outside Singapore* too.
      expect(query("ships_to=not-sg").calls).toEqual([["neq", "ship_country", "SG"], newest]);
      expect(query("ships_to=unknown").calls).toEqual([["is", "ship_country", null], newest]);
    });

    it("labels each", () => {
      expect(label("ships_to=sg")).toEqual(["Ships to Singapore"]);
      expect(label("ships_to=not-sg")).toEqual(["Ships outside Singapore"]);
      expect(label("ships_to=unknown")).toEqual(["Ships to an unknown country"]);
    });
  });

  describe("Language", () => {
    it("reads English or Chinese as customers.locale holds them", () => {
      expect(query("language=zh-cn").calls).toEqual([["eq", "locale", "zh-CN"], newest]);
      expect(query("language=en").calls).toEqual([["eq", "locale", "en-US"], newest]);
      expect(parseCustomerFilters(new URLSearchParams("language=zh-CN"))).toMatchObject({ ignored: ["language"] });
      expect(label("language=zh-cn")).toEqual(["Reads Chinese"]);
    });
  });

  it("has no Points expire filter: points never expire (ADR 0030 decision 17)", () => {
    const { filters } = parseCustomerFilters(new URLSearchParams("points_expire=within:3"));
    expect(filters).toEqual(DEFAULT_CUSTOMER_FILTERS);
    expect(query("points_expire=within:3").calls).toEqual([newest]);
  });

  describe("Campaign", () => {
    it("reads a campaign id and what they did, the id written lower-case", () => {
      expect(parseCustomerFilters(new URLSearchParams(`campaign=${CAMPAIGN.toUpperCase()}:not-clicked`)).filters.campaign).toEqual({
        id: CAMPAIGN,
        state: "not-clicked",
      });
      for (const bad of [`campaign=${CAMPAIGN}`, `campaign=${CAMPAIGN}:opened`, "campaign=launch:sent", `campaign=${CAMPAIGN}:sent:x`]) {
        expect(parseCustomerFilters(new URLSearchParams(bad)), bad).toMatchObject({ filters: { campaign: null }, ignored: ["campaign"] });
      }
    });

    it("reads campaigns_sent and campaigns_clicked; didn't click is got it and never clicked", () => {
      const one = `{"${CAMPAIGN}"}`;
      expect(query(`campaign=${CAMPAIGN}:sent`).calls).toEqual([["contains", "campaigns_sent", [CAMPAIGN]], newest]);
      expect(query(`campaign=${CAMPAIGN}:not-sent`).calls).toEqual([["not", "campaigns_sent", "cs", one], newest]);
      expect(query(`campaign=${CAMPAIGN}:clicked`).calls).toEqual([["contains", "campaigns_clicked", [CAMPAIGN]], newest]);
      expect(query(`campaign=${CAMPAIGN}:not-clicked`).calls).toEqual([
        ["contains", "campaigns_sent", [CAMPAIGN]],
        ["not", "campaigns_clicked", "cs", one],
        newest,
      ]);
    });

    it("labels by the campaign's name, or *a campaign* when it is not known", () => {
      expect(label(`campaign=${CAMPAIGN}:sent`)).toEqual(["Got “November care tips”"]);
      expect(label(`campaign=${CAMPAIGN}:not-sent`)).toEqual(["Didn't get “November care tips”"]);
      expect(label(`campaign=${CAMPAIGN}:clicked`)).toEqual(["Clicked “November care tips”"]);
      expect(label(`campaign=${CAMPAIGN}:not-clicked`)).toEqual(["Got “November care tips”, didn't click"]);
      const { filters } = parseCustomerFilters(new URLSearchParams(`campaign=${CAMPAIGN}:sent`));
      expect(describeCustomerFilters(filters).map((f) => f.label)).toEqual(["Got a campaign"]);
      expect(customerFilterParams(filters).get("campaign")).toBe(`${CAMPAIGN}:sent`);
    });
  });

  describe("Last emailed", () => {
    it("reads within or over 1 to 730 days, or never", () => {
      expect(parseCustomerFilters(new URLSearchParams("emailed=never")).filters.emailed).toEqual({ when: "never" });
      expect(parseCustomerFilters(new URLSearchParams("emailed=over:30")).filters.emailed).toEqual({ when: "over", days: 30 });
      for (const bad of ["emailed=over:0", "emailed=within:731", "emailed=never:3", "emailed=since:14", "emailed=ever"]) {
        expect(parseCustomerFilters(new URLSearchParams(bad)), bad).toMatchObject({ filters: { emailed: null }, ignored: ["emailed"] });
      }
    });

    it("keeps the never-emailed in *not emailed in N days*, with one lt and no or", () => {
      expect(query("emailed=within:14").calls).toEqual([["gte", "last_campaign_sent_at", "2026-10-07T04:00:00.000Z"], newest]);
      expect(query("emailed=over:30").calls).toEqual([["lt", "last_emailed_at", "2026-09-21T04:00:00.000Z"], newest]);
      expect(query("emailed=never").calls).toEqual([["is", "last_campaign_sent_at", null], newest]);
    });

    it("labels each, and writes them back", () => {
      expect(label("emailed=within:14")).toEqual(["Emailed within 14 days"]);
      expect(label("emailed=over:30")).toEqual(["Not emailed in 30 days"]);
      expect(label("emailed=never")).toEqual(["Never emailed"]);
      expect(customerFilterParams({ emailed: { when: "never" } }).toString()).toBe("emailed=never");
    });
  });

  it("makes the PRD's demo one link: At risk, Ships to Singapore, Not emailed in 30 days", () => {
    const search = "stage=at-risk&ships_to=sg&emailed=over:30";
    const { filters, ignored } = parseCustomerFilters(new URLSearchParams(search));
    expect(ignored).toEqual([]);
    expect(customerFilterParams(filters).toString()).toBe("stage=at-risk&ships_to=sg&emailed=over%3A30");
    expect(label(search)).toEqual(["Stage: At risk", "Ships to Singapore", "Not emailed in 30 days"]);
    expect(clearCustomerFilters(filters)).toEqual(DEFAULT_CUSTOMER_FILTERS);
  });

  it("goes to PostgREST as plain filters, never or=", () => {
    const builder = createClient("http://localhost:54321", "anon-key").from("admin_customer_overview").select("id");
    const { filters } = parseCustomerFilters(
      new URLSearchParams(
        `ships_to=not-sg&language=zh-cn&campaign=${CAMPAIGN}:not-clicked&emailed=over:30`,
      ),
    );
    const url = (applyCustomerFilters(builder as unknown as CustomerListQuery, filters, { now: NOW }) as unknown as { url: URL }).url;
    expect(url.searchParams.get("ship_country")).toBe("neq.SG");
    expect(url.searchParams.get("locale")).toBe("eq.zh-CN");
    expect(url.searchParams.get("campaigns_sent")).toBe(`cs.{${CAMPAIGN}}`);
    expect(url.searchParams.get("campaigns_clicked")).toBe(`not.cs.{"${CAMPAIGN}"}`);
    expect(url.searchParams.get("last_emailed_at")).toBe("lt.2026-09-21T04:00:00.000Z");
    expect(url.searchParams.has("or")).toBe(false);
  });
});

describe("Engagement (PRD-campaign-audiences slice 12)", () => {
  const query = (search: string) => {
    const { q, calls } = recorder();
    applyCustomerFilters(q, parseCustomerFilters(new URLSearchParams(search)).filters, { now: NOW, order: false });
    return { calls };
  };

  it("reads engaged or unengaged, and nothing else", () => {
    expect(parseCustomerFilters(new URLSearchParams("engagement=unengaged")).filters.engagement).toBe("unengaged");
    expect(parseCustomerFilters(new URLSearchParams("engagement=engaged")).filters.engagement).toBe("engaged");
    for (const bad of ["engagement=lapsed", "engagement=", "engagement=Unengaged"]) {
      expect(parseCustomerFilters(new URLSearchParams(bad)), bad).toMatchObject({ filters: { engagement: null }, ignored: ["engagement"] });
    }
  });

  it("is one eq on the overview's unengaged, the column the campaign rule reads", () => {
    expect(query("engagement=unengaged").calls).toEqual([["eq", "unengaged", true]]);
    expect(query("engagement=engaged").calls).toEqual([["eq", "unengaged", false]]);
    expect(query("").calls).toEqual([]);
  });

  it("labels each, writes it back, and saves with a Segment like any filter", () => {
    const { filters } = parseCustomerFilters(new URLSearchParams("stage=at-risk:lapsed&engagement=unengaged"));
    expect(describeCustomerFilters(filters).map((f) => f.label)).toEqual(["Stage: At risk · Lapsed", "Unengaged"]);
    expect(customerFilterParams(filters).toString()).toBe("stage=at-risk%3Alapsed&engagement=unengaged");
    expect(clearCustomerFilter(filters, "engagement").engagement).toBeNull();
  });
});
