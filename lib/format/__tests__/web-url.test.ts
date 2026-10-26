import { describe, expect, it } from "vitest";
import { toWebUrl } from "@/lib/format/web-url";

describe("toWebUrl", () => {
  it("keeps http(s) links and adds https to a bare domain", () => {
    expect(toWebUrl("https://mpillow.com/shop")).toBe("https://mpillow.com/shop");
    expect(toWebUrl("http://example.com")).toBe("http://example.com/");
    expect(toWebUrl(" instagram.com/mpillow ")).toBe("https://instagram.com/mpillow");
  });

  it("refuses script and data schemes, and things that are not links", () => {
    for (const value of ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,x", "mailto:a@b.co", "@mpillow", "", null]) {
      expect(toWebUrl(value)).toBeNull();
    }
  });
});
