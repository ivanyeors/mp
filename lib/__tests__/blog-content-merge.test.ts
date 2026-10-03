import { describe, expect, it } from "vitest";
import { isEditorialChange, preserveSeoAnswer } from "@/lib/blog-content-merge";

const loc = (o: Partial<{ title: string; body: string; description: string; seo_answer: string }> = {}) => ({
  title: "T",
  description: "D",
  body: "B",
  ...o,
});

describe("preserveSeoAnswer", () => {
  it("keeps the stored answer lede when the editor does not send one", () => {
    const out = preserveSeoAnswer({ "en-US": loc({ seo_answer: "Short answer." }) }, { "en-US": loc({ body: "New" }) });
    expect(out["en-US"]).toMatchObject({ body: "New", seo_answer: "Short answer." });
  });

  it("lets an explicit value, including an empty string, win", () => {
    const existing = { "en-US": loc({ seo_answer: "Old" }) };
    expect(preserveSeoAnswer(existing, { "en-US": loc({ seo_answer: "New" }) })["en-US"].seo_answer).toBe("New");
    expect(preserveSeoAnswer(existing, { "en-US": loc({ seo_answer: "" }) })["en-US"].seo_answer).toBe("");
  });

  it("handles new locales and missing rows", () => {
    expect(preserveSeoAnswer(null, { "zh-CN": loc() })["zh-CN"].seo_answer).toBeUndefined();
  });
});

describe("isEditorialChange", () => {
  it("is true for a text change and false for an identical save", () => {
    const existing = { "en-US": loc() };
    expect(isEditorialChange(existing, { "en-US": loc() })).toBe(false);
    expect(isEditorialChange(existing, { "en-US": loc({ body: "B2" }) })).toBe(true);
    expect(isEditorialChange(existing, { "zh-CN": loc() })).toBe(true);
  });
});
