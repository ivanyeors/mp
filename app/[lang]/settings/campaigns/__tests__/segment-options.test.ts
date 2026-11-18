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
      { id: "s1", name: "Premium, lapsed", customersHref: "/en-US/settings/customers?bought=premium&last_order=over%3A12" },
      { id: "s2", name: "Everyone", customersHref: "/en-US/settings/customers" },
    ]);
  });

  it("links nothing for a role without customers", () => {
    expect(segmentOptions(SEGMENTS, as("campaigns"), "en-US").map((o) => o.customersHref)).toEqual([null, null]);
  });

  // PRD-email-funnel review: a Segment's filters can name a Customer, and `campaigns` does not need `customers`.
  // A wanted Segment is matched on the server (`FoundSegments`); the options carry no filters, for any role.
  it.each([[["campaigns"]], [["campaigns", "customers"]]] as Permission[][][])("carries no Segment's filters beyond the Customers link (%j)", (keys) => {
    const segments = [{ id: "s3", name: "One VIP", params: { search: "tan@example.com", stage: "at-risk" } }];
    for (const o of segmentOptions(segments, as(...keys), "en-US")) {
      expect(Object.keys(o).sort()).toEqual(["customersHref", "id", "name"]);
      expect(JSON.stringify({ ...o, customersHref: null })).not.toMatch(/tan|at-risk|stage/);
    }
    expect(JSON.stringify(segmentOptions(segments, as("campaigns"), "en-US"))).not.toMatch(/tan@|tan%40|at-risk/);
  });
});
