import { describe, expect, it } from "vitest";
import { clampAtWord, markdownToPlainText, MAX_META_DESCRIPTION_CHARS, resolveMetaDescription } from "@/lib/seo/meta-description";

describe("meta description", () => {
  it("keeps a hand-written description exactly as written, even when long", () => {
    const long = "x ".repeat(120).trim();
    expect(resolveMetaDescription({ description: "  Written copy.  ", body: "Body" })).toBe("Written copy.");
    expect(resolveMetaDescription({ description: long })).toBe(long);
  });

  it("falls back to the answer lede, then the body, as plain text within the limit", () => {
    expect(resolveMetaDescription({ description: "", seo_answer: "A **direct** answer.", body: "Body" })).toBe("A direct answer.");
    const body = "## Why it matters\n\nA [bolster](/en-US/shop/mbolster) keeps your *hips* level.\n\n![hero](x.jpg)\n\n- Supports the knee\n- Stops rolling";
    expect(resolveMetaDescription({ description: "", body })).toBe("A bolster keeps your hips level. Supports the knee Stops rolling");
  });

  it("clamps a derived description at a word boundary", () => {
    const body = "Side sleepers need a pillow tall enough to fill the gap between ear and shoulder. ".repeat(4);
    const out = resolveMetaDescription({ body });
    expect(out.length).toBeLessThanOrEqual(MAX_META_DESCRIPTION_CHARS);
    expect(out.endsWith("…")).toBe(true);
    expect(body.startsWith(out.slice(0, -1))).toBe(true);
  });

  it("skips headings that the import flattened into bare lines", () => {
    expect(resolveMetaDescription({ body: "Introduction\n\nWalk into almost any bedroom in Singapore." })).toBe(
      "Walk into almost any bedroom in Singapore.",
    );
    expect(resolveMetaDescription({ body: "Short line" })).toBe("Short line");
  });

  it("returns empty when there is nothing to use", () => {
    expect(resolveMetaDescription({})).toBe("");
  });

  it("strips tags and decodes common entities", () => {
    expect(markdownToPlainText("<p>Neck &amp; shoulder</p>")).toBe("Neck & shoulder");
    expect(clampAtWord("short", 155)).toBe("short");
  });
});
