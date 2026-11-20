import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { CustomerOverviewRow } from "@/lib/crm/customer-overview";
import { parseCustomerFilters } from "@/lib/crm/customer-filters";
import type { CustomerSegment, SegmentParams } from "@/lib/crm/segment-rules";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/customers",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const { CustomersClient } = await import("../customers-client");
const { SegmentsRow } = await import("../segments-row");

const seg = (over: Partial<CustomerSegment>): CustomerSegment => ({
  id: "s1",
  name: "Premium, lapsed",
  params: { bought: "premium", last_order: "over:12" },
  ignored: [],
  needsReview: false,
  count: 1204,
  createdBy: null,
  createdAt: "2026-10-20T00:00:00Z",
  updatedAt: "2026-10-20T00:00:00Z",
  ...over,
});

const SEGMENTS = [
  seg({}),
  seg({ id: "s2", name: "Old region", params: { bought: "basic" }, ignored: ["region=east"], needsReview: true, count: null }),
];

const row = { id: "c1", email: "ana@x.test", first_name: "Ana", last_name: "Tan", tags: [], total_orders: 1, total_spent: 0, created_at: "2025-01-01T00:00:00Z", has_account: false, from_shopify: false, account_providers: [], open_followups: 0 } as unknown as CustomerOverviewRow;

const listFor = (
  url: string,
  { canEdit = true, canEmail = false, segments = SEGMENTS }: { canEdit?: boolean; canEmail?: boolean; segments?: CustomerSegment[] } = {},
) => {
  const { filters } = parseCustomerFilters(new URLSearchParams(url));
  return renderToString(
    <CustomersClient
      initialData={{ customers: { ok: true, rows: [row], total: 1, page: 1, limit: 20 } }}
      initialFilters={filters}
      initialSegments={segments}
      canEdit={canEdit}
      canEmail={canEmail}
    />,
  );
};

const rowFor = (params: SegmentParams, activeId: string | null, canEdit = true) =>
  renderToString(
    <SegmentsRow
      initialSegments={SEGMENTS}
      canEdit={canEdit}
      params={params}
      activeId={activeId}
      listPath="/en-US/settings/customers"
      onChoose={() => {}}
      onSelect={() => {}}
    />,
  );

describe("the Segments row", () => {
  it("shows each live Segment with its count, and its own link", () => {
    const html = listFor("");
    expect(html).toContain('aria-label="Segments"');
    expect(html).toContain("Premium, lapsed");
    expect(html).toContain("1,204");
    expect(html).toContain('href="/en-US/settings/customers?bought=premium&amp;last_order=over%3A12"');
  });

  it("shows Needs review instead of a count, naming what was ignored", () => {
    const html = listFor("");
    expect(html).toContain("Needs review");
    expect(html).toContain('title="Needs review: region=east"');
  });

  it("offers Save as Segment with a filter active, and nothing to change without one", () => {
    expect(listFor("readjusted=never")).toContain("Save as Segment");
    expect(listFor("")).not.toContain("Save as Segment");
  });

  it("opens a Segment's link with it chosen, and offers no update while nothing changed", () => {
    const html = listFor("bought=premium&last_order=over:12");
    expect(html).toContain('aria-current="true"');
    expect(html).not.toContain("Save as Segment");
    expect(html).not.toContain("Update Premium, lapsed");
  });

  it("offers Update {name} and Save as new once the chosen Segment's filters change", () => {
    const html = rowFor({ bought: "premium", last_order: "over:12", readjusted: "never" }, "s1");
    expect(html).toContain("Update Premium, lapsed");
    expect(html).toContain("Save as new");
    expect(html).not.toContain("Save as Segment");
  });

  it("says why a chosen Segment needs review, and offers to update it as shown", () => {
    const html = rowFor({ bought: "basic" }, "s2");
    expect(html).toContain("needs review");
    expect(html).toContain("region=east");
    expect(html).toContain("counts no Customers");
    expect(html).toContain("Update Old region");
  });

  it("gives a view-only role the chips and counts, and nothing to change", () => {
    const html = listFor("readjusted=never", { canEdit: false });
    expect(html).toContain("1,204");
    expect(html).not.toContain("Save as Segment");
    expect(html).not.toContain("More for Premium, lapsed");
    expect(rowFor({ bought: "premium", readjusted: "never" }, "s1", false)).not.toContain("Update ");
  });

  it("gives an editor each chip's menu", () => {
    expect(listFor("")).toContain('aria-label="More for Premium, lapsed"');
  });

  it("gives a role with campaigns and no customers-edit a menu on live Segments only (PRD-crm-retention-loop 02)", () => {
    const html = listFor("", { canEdit: false, canEmail: true });
    expect(html).toContain('aria-label="More for Premium, lapsed"');
    expect(html).not.toContain('aria-label="More for Old region"');
    expect(html).not.toContain("Save as Segment");
  });

  it("offers Email this Segment as a button while the list shows a Segment as saved (PRD-campaign-audiences decision 5)", () => {
    const html = listFor("bought=premium&last_order=over:12", { canEmail: true });
    expect(html).toMatch(/<a[^>]*href="\/en-US\/settings\/campaigns\/new\?segment=s1"[^>]*>[\s\S]*?Email this Segment<\/a>/);
  });

  it("offers no Email this Segment button once the filters change, without campaigns, or for a Segment that needs review", () => {
    expect(rowFor({ bought: "premium", readjusted: "never" }, "s1")).not.toContain("Email this Segment");
    expect(listFor("bought=premium&last_order=over:12", { canEmail: false })).not.toContain("Email this Segment");
    const review = renderToString(
      <SegmentsRow
        initialSegments={SEGMENTS}
        canEdit
        newCampaignPath="/en-US/settings/campaigns/new"
        params={{ bought: "basic" }}
        activeId="s2"
        listPath="/en-US/settings/customers"
        onChoose={() => {}}
        onSelect={() => {}}
      />,
    );
    expect(review).not.toContain("Email this Segment");
  });

  it("renders nothing with no Segments and no filter", () => {
    expect(listFor("", { segments: [] })).not.toContain('aria-label="Segments"');
  });
});
