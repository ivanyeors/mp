import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { parseCustomerFilters } from "@/lib/crm/customer-filters";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/customers/filters",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const { CustomerFiltersPageClient } = await import("../filters/filters-page-client");

const CAMPAIGN = "0b5c6c1e-2a7d-4c4e-9f3a-1d2e3f4a5b6c";

const pageFor = (url: string, count: { total: number; shipsToUnknown: number | null } | null = { total: 128, shipsToUnknown: null }) => {
  const { filters, ignored } = parseCustomerFilters(new URLSearchParams(url));
  return renderToString(
    <CustomerFiltersPageClient
      initialFilters={filters}
      ignoredFilters={ignored}
      campaigns={[{ id: CAMPAIGN, name: "November care tips" }]}
      initialCount={count}
    />,
  );
};

describe("the filters page", () => {
  it("lays out every group at once, each a section the index links to", () => {
    const html = pageFor("");
    expect(html).toContain(">Filters</h1>");
    for (const id of ["stage", "purchases", "reach", "account", "reviews"]) {
      expect(html).toContain(`id="filters-${id}"`);
      expect(html).toContain(`href="#filters-${id}"`);
    }
    for (const control of ["Re-adjusted", "Ships to", "Email consent", "Account", "Mobile", "Points", "Rating"]) {
      expect(html).toContain(`aria-label="${control}"`);
    }
  });

  it("says how many match, and shows them on the list with the same parameters", () => {
    const html = pageFor("stage=at-risk&ships_to=sg&emailed=over:30&sort=spend");
    expect(html).toContain("128 customers match");
    expect(html).toContain("Show 128 customers");
    expect(html).toContain('href="/en-US/settings/customers?stage=at-risk&amp;ships_to=sg&amp;emailed=over%3A30&amp;sort=spend"');
    expect(html).toContain("Ships to Singapore");
    expect(html).toContain("Not emailed in 30 days");
    expect(html).toContain("2 set");
    expect(html).toMatch(/aria-label="2 set"[^>]*>2</);
  });

  it("names the customers that ship to an unknown country, with Ships to Singapore", () => {
    const html = pageFor("ships_to=sg", { total: 40, shipsToUnknown: 12 });
    expect(html).toContain("40 customers match");
    expect(html).toContain("12 more match the other filters but ship to an unknown country");
  });

  it("counts again in the browser when the page could not, and still offers the list", () => {
    const html = pageFor("bought=premium", null);
    expect(html).toContain("Counting…");
    expect(html).toContain("Show customers");
    expect(html).toContain('href="/en-US/settings/customers?bought=premium"');
  });

  it("keeps a link's search, which is not one of its groups", () => {
    const html = pageFor("search=tan&rating=5");
    expect(html).toContain("Search: “tan”");
    expect(html).toContain('href="/en-US/settings/customers?search=tan&amp;rating=5"');
  });
});
