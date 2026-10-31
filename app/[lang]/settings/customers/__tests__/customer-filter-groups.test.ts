import { describe, expect, it, vi } from "vitest";
import { CUSTOMER_FILTER_KEYS, DEFAULT_CUSTOMER_FILTERS, parseCustomerFilters } from "@/lib/crm/customer-filters";

/**
 * The mega filter's groups: every filter the list reads has one place in it,
 * so a new filter cannot be added to the schema and left out of the panel.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/customers",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const { CUSTOMER_FILTER_GROUPS, MEGA_FILTER_KEYS, firstActiveGroup, groupFilterCount, showCustomersLabel } = await import(
  "../customer-filters-panel"
);

const filtersFor = (url: string) => ({ ...DEFAULT_CUSTOMER_FILTERS, ...parseCustomerFilters(new URLSearchParams(url)).filters });

describe("the mega filter's groups", () => {
  it("hold every filter key but the search box, each in exactly one group", () => {
    expect([...MEGA_FILTER_KEYS].sort()).toEqual(CUSTOMER_FILTER_KEYS.filter((k) => k !== "search").sort());
    expect(new Set(MEGA_FILTER_KEYS).size).toBe(MEGA_FILTER_KEYS.length);
  });

  it("are Stage, Purchases, Reach, Account and Reviews, in that order", () => {
    expect(CUSTOMER_FILTER_GROUPS.map((g) => g.label)).toEqual(["Stage", "Purchases", "Reach", "Account", "Reviews"]);
  });

  it("count what is set in each, for the rail's badges", () => {
    const filters = filtersFor("stage=at-risk&ships_to=sg&emailed=over:30&consent=subscribed&mobile=missing");
    const counts = Object.fromEntries(CUSTOMER_FILTER_GROUPS.map((g) => [g.id, groupFilterCount(filters, g)]));
    expect(counts).toEqual({ stage: 1, purchases: 0, reach: 3, account: 1, reviews: 0 });
  });

  it("open on the first group with a filter set, else Stage", () => {
    expect(firstActiveGroup(filtersFor(""))).toBe("stage");
    expect(firstActiveGroup(filtersFor("rating=5"))).toBe("reviews");
    expect(firstActiveGroup(filtersFor("rating=5&bought=premium"))).toBe("purchases");
    // The search box is not the mega filter's.
    expect(firstActiveGroup(filtersFor("search=tan"))).toBe("stage");
  });

  it("say how many customers the footer's button shows", () => {
    expect(showCustomersLabel(0)).toBe("Show 0 customers");
    expect(showCustomersLabel(1)).toBe("Show 1 customer");
    expect(showCustomersLabel(2161)).toBe("Show 2,161 customers");
  });
});
