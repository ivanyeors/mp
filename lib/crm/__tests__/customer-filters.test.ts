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
      ["order", "last_paid_at", { ascending: false, nullsFirst: false }],
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
    expect(query("last_order=within:6").calls).toEqual([["gte", "last_paid_at", "2026-04-21T04:00:00.000Z"], newest]);
    expect(query("last_order=over:12").calls).toEqual([["lt", "last_paid_at", "2025-10-21T04:00:00.000Z"], newest]);
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
      ["lt", "last_paid_at", "2025-10-21T04:00:00.000Z"],
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
    expect(url.searchParams.get("last_paid_at")).toBe("lt.2025-10-21T04:00:00.000Z");
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
      bought: ["premium", "mbolster"],
      last_order: { when: "over", months: 18 },
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
      "consent",
      "followups",
      "google",
      "google_review",
      "last_order",
      "limit",
      "min_spend",
      "mobile",
      "page",
      "points",
      "rating",
      "readjusted",
      "search",
      "shop_review",
      "sort",
      "source",
      "tags",
    ]);
    expect(CUSTOMER_FILTER_PARAMS).not.toContain("view");
  });

  it("chooses Customers with every key but the sort and paging", () => {
    expect([...CUSTOMER_FILTER_KEYS].sort()).toEqual([
      "account",
      "bought",
      "consent",
      "followups",
      "google",
      "google_review",
      "last_order",
      "min_spend",
      "mobile",
      "points",
      "rating",
      "readjusted",
      "search",
      "shop_review",
      "source",
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
