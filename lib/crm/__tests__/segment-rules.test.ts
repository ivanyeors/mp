import { describe, expect, it } from "vitest";
import {
  DEFAULT_CUSTOMER_FILTERS,
  customerFilterParams,
  parseCustomerFilters,
} from "@/lib/crm/customer-filters";
import {
  SEGMENT_FILTERS_VERSION,
  SegmentNameSchema,
  chosenSegmentFilters,
  formatSegmentCount,
  parseSegmentFilters,
  readSegmentFilters,
  sameSegmentFilters,
  segmentKey,
  segmentParams,
} from "@/lib/crm/segment-rules";

/**
 * CRM 05: a Segment's filters are the Customers list's own URL parameters,
 * checked by the list's one schema on the way in and on the way out. A filter
 * the schema no longer recognises marks the Segment *Needs review*, and is
 * named; it is never silently dropped.
 */

/** What the list's URL `url` would save as a Segment. */
const fromUrl = (url: string) => Object.fromEntries(customerFilterParams(parseCustomerFilters(new URLSearchParams(url)).filters));

describe("segmentParams", () => {
  it("keeps only what chooses Customers: never the sort or the page", () => {
    expect(
      segmentParams({ ...DEFAULT_CUSTOMER_FILTERS, bought: ["premium"], sort: "spend", page: 3, limit: 50 }),
    ).toEqual({ bought: "premium" });
  });

  it("writes the same parameters as the list's URL, in the list's order", () => {
    const url = "readjusted=never&last_order=over:12&bought=premium&sort=name-asc";
    const expected = fromUrl(url);
    expect(expected.sort).toBe("name-asc");
    delete expected.sort;
    const params = segmentParams(parseCustomerFilters(new URLSearchParams(url)).filters);
    expect(params).toEqual(expected);
    expect(Object.keys(params)).toEqual(["bought", "last_order", "readjusted"]);
  });

  it("is empty for the plain list", () => {
    expect(segmentParams(DEFAULT_CUSTOMER_FILTERS)).toEqual({});
  });
});

describe("parseSegmentFilters (saving)", () => {
  it("accepts the list's parameters and stores them normalised", () => {
    expect(parseSegmentFilters({ bought: "mbolster,premium,premium", tags: " vip , wholesale," })).toEqual({
      ok: true,
      params: { tags: "vip,wholesale", bought: "premium,mbolster" },
    });
  });

  it("saves exactly what the URL holds, so the two read alike", () => {
    const url = "bought=premium&last_order=over:12&readjusted=never&search=Tan%2C%20Mei&google=linked&consent=subscribed";
    const saved = parseSegmentFilters(fromUrl(url));
    expect(saved).toEqual({ ok: true, params: fromUrl(url) });
  });

  it.each([
    [{ bought: "foo" }, ["bought=foo"]],
    [{ bought: "premium,platinum" }, ["bought=premium,platinum"]],
    [{ last_order: "over:0" }, ["last_order=over:0"]],
    [{ min_spend: "1e3" }, ["min_spend=1e3"]],
    [{ region: "east", bought: "premium" }, ["region=east"]],
    [{ sort: "spend", bought: "premium" }, ["sort=spend"]],
    [{ page: "2", bought: "premium" }, ["page=2"]],
    [{ bought: ["premium"] }, ['bought=["premium"]']],
  ])("refuses %j, naming %j: anything the list would drop", (raw, refused) => {
    const result = parseSegmentFilters(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refused).toEqual(refused);
      expect(result.error).toContain(refused[0]);
    }
  });

  it("refuses a set that chooses every Customer", () => {
    expect(parseSegmentFilters({})).toMatchObject({ ok: false, refused: [] });
    expect(parseSegmentFilters({ account: "all", source: "all" })).toMatchObject({ ok: false, refused: [] });
    expect(parseSegmentFilters(null)).toMatchObject({ ok: false });
    expect(parseSegmentFilters(["bought"])).toMatchObject({ ok: false });
  });
});

describe("readSegmentFilters (loading)", () => {
  it("reads a saved Segment back as the same link reads", () => {
    const url = "bought=premium&last_order=over:12&readjusted=never";
    const read = readSegmentFilters(fromUrl(url), SEGMENT_FILTERS_VERSION);
    expect(read).toMatchObject({ ignored: [], needsReview: false, params: fromUrl(url) });
    expect(read.filters).toEqual(parseCustomerFilters(new URLSearchParams(url)).filters);
  });

  it("names a filter the schema no longer recognises, and needs review", () => {
    // Saved before a key was renamed, or by a newer schema.
    const read = readSegmentFilters({ bought: "premium", region: "east" }, SEGMENT_FILTERS_VERSION);
    expect(read.needsReview).toBe(true);
    expect(read.ignored).toEqual(["region=east"]);
    // What is still recognised is kept, for the list to show while it is reviewed.
    expect(read.params).toEqual({ bought: "premium" });
  });

  it("names a value the schema no longer accepts", () => {
    const read = readSegmentFilters({ bought: "premium,pillowcase", readjusted: "never" }, SEGMENT_FILTERS_VERSION);
    expect(read).toMatchObject({ needsReview: true, ignored: ["bought=premium,pillowcase"], params: { readjusted: "never" } });
  });

  it("trusts no key of another filters_version until it is upgraded", () => {
    const read = readSegmentFilters({ bought: "premium" }, SEGMENT_FILTERS_VERSION + 1);
    expect(read).toMatchObject({ needsReview: true, ignored: ["bought=premium"], params: {} });
    expect(readSegmentFilters({}, 99).ignored).toEqual(["filters_version=99"]);
  });

  it("needs review when the stored filters are not an object", () => {
    expect(readSegmentFilters(["bought"], SEGMENT_FILTERS_VERSION)).toMatchObject({ needsReview: true, ignored: ["filters"] });
    expect(readSegmentFilters(null, SEGMENT_FILTERS_VERSION)).toMatchObject({ needsReview: true });
    expect(readSegmentFilters(null, 1)).toMatchObject({ needsReview: true });
  });
});

/**
 * PRD-loyalty-points slice 06 retired the Welcome-back voucher and its filter
 * (`voucher`), so Segments are saved at filters_version 2. One saved at 1 is
 * upgraded each time it is read: the voucher filter is dropped, and the rest
 * of the Segment stands.
 */
describe("a Segment saved at filters_version 1", () => {
  it("is saved at 2 now", () => {
    expect(SEGMENT_FILTERS_VERSION).toBe(2);
  });

  it("still loads, its filters read as they were saved", () => {
    const url = "bought=premium&last_order=over:12&readjusted=never";
    const read = readSegmentFilters(fromUrl(url), 1);
    expect(read).toMatchObject({ ignored: [], needsReview: false, params: fromUrl(url) });
    expect(read.filters).toEqual(parseCustomerFilters(new URLSearchParams(url)).filters);
  });

  it.each(["issued", "used"])("loses only the voucher filter (voucher=%s), and chooses what the rest chooses", (voucher) => {
    const read = readSegmentFilters({ source: "shopify", voucher, bought: "premium" }, 1);
    expect(read).toMatchObject({ ignored: [], needsReview: false, params: { source: "shopify", bought: "premium" } });
    expect(read.filters).toEqual(parseCustomerFilters(new URLSearchParams("source=shopify&bought=premium")).filters);
  });

  it("needs review when the voucher was its only filter, rather than choosing every Customer", () => {
    expect(readSegmentFilters({ voucher: "issued" }, 1)).toMatchObject({
      needsReview: true,
      ignored: ["voucher=issued"],
      params: {},
    });
  });

  it("keeps naming anything else it does not recognise", () => {
    expect(readSegmentFilters({ voucher: "used", bought: "premium", region: "east" }, 1)).toMatchObject({
      needsReview: true,
      ignored: ["region=east"],
      params: { bought: "premium" },
    });
  });

  it("is the only upgrade: at version 2 the voucher is a filter the list does not know", () => {
    expect(readSegmentFilters({ voucher: "issued", bought: "premium" }, 2)).toMatchObject({
      needsReview: true,
      ignored: ["voucher=issued"],
    });
    expect(parseSegmentFilters({ voucher: "issued" })).toMatchObject({ ok: false, refused: ["voucher=issued"] });
    expect(readSegmentFilters({ bought: "premium" }, 0)).toMatchObject({ needsReview: true, ignored: ["bought=premium"] });
    expect(readSegmentFilters({ bought: "premium" }, 1.5)).toMatchObject({ needsReview: true });
  });

  it("saves its Points filter like any other", () => {
    expect(parseSegmentFilters({ points: "has" })).toEqual({ ok: true, params: { points: "has" } });
    expect(readSegmentFilters({ points: "none" }, SEGMENT_FILTERS_VERSION)).toMatchObject({ needsReview: false, params: { points: "none" } });
  });
});

describe("choosing a Segment", () => {
  it("puts exactly its filters on the list, every other filter at its default", () => {
    expect(chosenSegmentFilters({ bought: "premium", readjusted: "never" })).toEqual({
      search: null,
      tags: [],
      account: "all",
      source: "all",
      google: "all",
      mobile: "all",
      points: "all",
      consent: "all",
      followups: "all",
      stage: [],
      bought: ["premium"],
      last_order: null,
      readjusted: "never",
      min_spend: null,
      // CRM slice 12's review filters.
      google_review: "all",
      shop_review: "all",
      rating: null,
    });
  });

  it("compares filters by what they choose, not by key order", () => {
    expect(sameSegmentFilters({ readjusted: "never", bought: "premium" }, { bought: "premium", readjusted: "never" })).toBe(true);
    expect(sameSegmentFilters({ bought: "premium" }, { bought: "premium", readjusted: "never" })).toBe(false);
    expect(segmentKey({ readjusted: "never", bought: "premium" })).toBe("bought=premium&readjusted=never");
  });
});

describe("names and counts", () => {
  it("trims a name and keeps it between 1 and 80 characters", () => {
    expect(SegmentNameSchema.parse("  Premium, lapsed  ")).toBe("Premium, lapsed");
    expect(SegmentNameSchema.safeParse("   ").success).toBe(false);
    expect(SegmentNameSchema.safeParse("x".repeat(81)).success).toBe(false);
    expect(SegmentNameSchema.safeParse("x".repeat(80)).success).toBe(true);
  });

  it("shows a count, or a dash when there is none", () => {
    expect(formatSegmentCount(1204)).toBe("1,204");
    expect(formatSegmentCount(0)).toBe("0");
    expect(formatSegmentCount(null)).toBe("—");
  });
});

// PRD-crm-retention-loop slice 03: *Stage: At risk* saved as a Segment is a campaign Audience.
describe("a Segment by Lifecycle stage", () => {
  it("saves and reads back like any other filter, at the same version", () => {
    expect(SEGMENT_FILTERS_VERSION).toBe(2);
    expect(parseSegmentFilters({ stage: "lost,at-risk" })).toEqual({ ok: true, params: { stage: "at-risk,lost" } });
    const read = readSegmentFilters({ stage: "at-risk", bought: "premium" }, SEGMENT_FILTERS_VERSION);
    expect(read).toMatchObject({ needsReview: false, ignored: [], params: { stage: "at-risk", bought: "premium" } });
    expect(read.filters.stage).toEqual(["at_risk"]);
  });

  it("refuses a stage the list does not know", () => {
    expect(parseSegmentFilters({ stage: "whale" })).toMatchObject({ ok: false, refused: ["stage=whale"] });
  });

  it("reads a Segment saved before stages existed unchanged", () => {
    const read = readSegmentFilters({ bought: "premium", last_order: "over:12" }, SEGMENT_FILTERS_VERSION);
    expect(read).toMatchObject({ needsReview: false, ignored: [], params: { bought: "premium", last_order: "over:12" } });
    expect(read.filters.stage).toEqual([]);
  });
});
