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
});
