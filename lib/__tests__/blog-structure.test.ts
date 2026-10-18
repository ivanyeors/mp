import { describe, expect, it } from "vitest";
import { extractFaq, extractHeadings, headingId } from "@/lib/blog-structure";

const body = `Intro paragraph.

## What is a **bolster** for?

Text with a [link](/blog/x).

### Sub point

## How long does a pillow last?

More.

## Frequently asked questions

### Can I wash it?

Yes. Remove the cover and wash it at 30°C.

### Does it suit side sleepers?

- It does
- With the right height

## Next step

Book a fitting.`;

describe("blog structure", () => {
  it("turns headings into stable ids, in any script", () => {
    expect(headingId("What is a bolster for?")).toBe("what-is-a-bolster-for");
    expect(headingId("Café & Côté: 3 tips")).toBe("cafe-cote-3-tips");
    expect(headingId("常见问题")).toBe("常见问题");
  });

  it("lists the ## headings for the table of contents", () => {
    expect(extractHeadings(body).map((h) => h.text)).toEqual([
      "What is a bolster for?",
      "How long does a pillow last?",
      "Frequently asked questions",
      "Next step",
    ]);
  });

  it("reads the FAQ section's questions and answers, and stops at the next section", () => {
    expect(extractFaq(body)).toEqual([
      { question: "Can I wash it?", answer: "Yes. Remove the cover and wash it at 30°C." },
      { question: "Does it suit side sleepers?", answer: "It does With the right height" },
    ]);
    expect(extractFaq("## Something\n\n### Q?\n\nA.")).toEqual([]);
  });
});
