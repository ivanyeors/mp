import { describe, it, expect } from "vitest";
import { sanitizeSearchTerm } from "@/lib/supabase/like-pattern";

/**
 * Product search is interpolated into a PostgREST `.or()` filter string, which
 * is a query language, not a value. Before the fix, `?search=` was placed raw,
 * so a comma could add a new `column.op.value` condition — turning the search
 * into a blind boolean oracle over `cost_price` (never in the public select,
 * but still filterable). sanitizeSearchTerm must make that impossible while
 * leaving a normal substring search intact.
 */

const STRUCTURAL = [",", "(", ")", "%", "_", "*", "\\", '"'];

describe("sanitizeSearchTerm: neutralizes PostgREST/LIKE metacharacters", () => {
  const payloads = [
    "x,cost_price.gte.100",
    "x,cost_price.gte.100,slug.ilike.%",
    ")or(cost_price.gte.1",
    "%",
    "a%b_c*d",
    'x,title.ilike."%secret%"',
    "\\",
  ];

  it.each(payloads)("strips every structural character from %j", (raw) => {
    const term = sanitizeSearchTerm(raw);
    for (const ch of STRUCTURAL) {
      expect(term.includes(ch)).toBe(false);
    }
  });

  it("the built .or() string cannot grow a third, injected condition", () => {
    const term = sanitizeSearchTerm("x,cost_price.gte.100,slug.ilike.%");
    const orStr = `slug.ilike.%${term}%,content->>'en-US'->>'title'.ilike.%${term}%`;
    // The only top-level comma is the one between the two intended columns.
    expect(orStr.split(",")).toHaveLength(2);
  });

  it("an all-metacharacter term collapses to empty (filter is then dropped)", () => {
    expect(sanitizeSearchTerm("%,()*_\\\"")).toBe("");
  });
});

describe("sanitizeSearchTerm: keeps real searches usable", () => {
  it("passes ordinary words through unchanged", () => {
    expect(sanitizeSearchTerm("memory foam")).toBe("memory foam");
  });

  it("keeps hyphens, dots and apostrophes that appear in product names", () => {
    expect(sanitizeSearchTerm("O'Brien's 2.0 side-sleeper")).toBe("O'Brien's 2.0 side-sleeper");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeSearchTerm("  pillow  ")).toBe("pillow");
  });

  it("caps the length so the term stays bounded", () => {
    expect(sanitizeSearchTerm("a".repeat(500))).toHaveLength(100);
  });
});
