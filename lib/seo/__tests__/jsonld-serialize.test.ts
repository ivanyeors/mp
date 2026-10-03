import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "@/lib/seo/jsonld-serialize";

describe("serializeJsonLd", () => {
  it("cannot close the surrounding script element", () => {
    const out = serializeJsonLd({ headline: "</script><script>alert(1)</script>" });
    expect(out).not.toMatch(/<\/script/i);
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
  });

  it("escapes HTML comment openers and ampersands", () => {
    const out = serializeJsonLd({ name: "<!-- a & b -->" });
    expect(out).not.toContain("<!--");
    expect(out).not.toContain("&");
  });

  it("escapes JavaScript line terminators", () => {
    const out = serializeJsonLd({ text: "a\u2028b\u2029c" });
    expect(out).not.toMatch(/[\u2028\u2029]/);
  });

  it("parses back to the original data", () => {
    const data = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [{ name: "Size <M> & up?", text: "</script> a\u2028b", n: 3, ok: true }],
    };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });
});
