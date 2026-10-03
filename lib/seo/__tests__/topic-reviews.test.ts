import { describe, expect, it } from "vitest";
import { selectTopicReviews, shortName, trimQuote, type RawReview } from "@/lib/seo/topic-reviews";

const r = (body: string, o: Partial<RawReview> = {}): RawReview => ({
  body,
  authorName: "Jun Tan",
  rating: 5,
  date: "2026-08-01",
  source: "store",
  ...o,
});

describe("selectTopicReviews", () => {
  it("picks on-topic reviews, most relevant first, and never pads with off-topic ones", () => {
    const out = selectTopicReviews(
      [
        r("Fast delivery and nice packaging, very happy overall."),
        r("My neck pain is gone after two weeks, shoulder feels less stiff too."),
        r("Helped my neck a lot, I sleep through the night now.", { date: "2026-09-01" }),
        r("Neck and shoulder ache went away but it took a while.", { rating: 3 }),
      ],
      "neck-pain",
    );
    expect(out.map((o) => o.quote)).toEqual([
      "My neck pain is gone after two weeks, shoulder feels less stiff too.",
      "Helped my neck a lot, I sleep through the night now.",
    ]);
  });

  it("returns nothing when no review matches the topic", () => {
    expect(selectTopicReviews([r("Lovely colours and the delivery was quick.")], "custom-pillow")).toEqual([]);
  });

  it("keeps google and store sources", () => {
    const out = selectTopicReviews([r("They measured me and customised the height perfectly.", { source: "google" })], "custom-pillow");
    expect(out[0]).toMatchObject({ source: "google", name: "Jun T." });
  });
});

describe("shortName / trimQuote", () => {
  it("never shows a full name", () => {
    expect(shortName("Tan Wei Ming")).toBe("Tan M.");
    expect(shortName("Priya")).toBe("Priya");
    expect(shortName("  ")).toBe("Verified customer");
  });

  it("trims long quotes at a word boundary", () => {
    const q = trimQuote(`${"word ".repeat(80)}end`);
    expect(q.length).toBeLessThanOrEqual(281);
    expect(q.endsWith("…")).toBe(true);
    expect(q).not.toMatch(/ …$/);
  });
});
