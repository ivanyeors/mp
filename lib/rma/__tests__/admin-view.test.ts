import { describe, it, expect } from "vitest";
import { parseStatusFilter, humanizeToken, RMA_STATUSES } from "@/lib/rma/admin-view";

describe("parseStatusFilter", () => {
  it("accepts every known status", () => {
    for (const s of RMA_STATUSES) expect(parseStatusFilter(s)).toBe(s);
  });

  it("returns null for absent, empty, or garbage values", () => {
    expect(parseStatusFilter(undefined)).toBeNull();
    expect(parseStatusFilter(null)).toBeNull();
    expect(parseStatusFilter("")).toBeNull();
    expect(parseStatusFilter("all")).toBeNull();
    expect(parseStatusFilter("DROP TABLE")).toBeNull();
  });
});

describe("humanizeToken", () => {
  it("title-cases snake_case tokens", () => {
    expect(humanizeToken("instructions_sent")).toBe("Instructions sent");
    expect(humanizeToken("requested")).toBe("Requested");
    expect(humanizeToken("customer")).toBe("Customer");
  });
});
