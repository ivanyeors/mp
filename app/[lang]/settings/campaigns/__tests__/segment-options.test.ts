import { describe, expect, it } from "vitest";
import type { Permission } from "@/lib/auth/permissions";
import { segmentOptions } from "../segment-options";

/** PRD-crm-retention-loop slice 02: a campaign's Segment links to its Customers list, for `customers` only. */

const SEGMENTS = [
  { id: "s1", name: "Premium, lapsed", params: { bought: "premium", last_order: "over:12" } },
  { id: "s2", name: "Everyone", params: {} },
];
const as = (...keys: Permission[]) => ({ permissions: new Set<Permission>(keys) });

describe("segmentOptions", () => {
  it("links each Segment to the Customers list with its filters", () => {
    expect(segmentOptions(SEGMENTS, as("campaigns", "customers"), "en-US")).toEqual([
      { id: "s1", name: "Premium, lapsed", customersHref: "/en-US/settings/customers?bought=premium&last_order=over%3A12", filtersKey: "bought=premium&last_order=over%3A12" },
      { id: "s2", name: "Everyone", customersHref: "/en-US/settings/customers", filtersKey: "" },
    ]);
  });

  it("links nothing for a role without customers", () => {
    expect(segmentOptions(SEGMENTS, as("campaigns"), "en-US").map((o) => o.customersHref)).toEqual([null, null]);
  });

  // PRD-email-funnel slice 04: a Playbook finds its Segment by these; one that needs review is never found.
  it("gives each Segment its filters key, none for a Segment that needs review", () => {
    const keys = segmentOptions([{ ...SEGMENTS[0], needsReview: true }, { id: "s3", name: "At risk", params: { last_order: "within:24", stage: "at-risk" } }], as("campaigns"), "en-US");
    expect(keys.map((o) => o.filtersKey)).toEqual([null, "stage=at-risk&last_order=within%3A24"]);
  });
});
