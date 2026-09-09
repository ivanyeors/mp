import { describe, expect, it } from "vitest";

import { validateHeroContent, validateSectionCopy } from "@/lib/page-builder/copy-fit";
import { HERO_H1_CHAR_MAX, HERO_H1_WORD_MAX } from "@/lib/i18n/copy-bands";
import { writeLocalisedField } from "@/lib/page-builder/locale";

/** Compose an en-US-only hero override. */
function heroEn(fields: Record<string, string>): Record<string, unknown> {
  let content: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    content = writeLocalisedField(content, key, "en-US", value);
  }
  return content;
}

describe("hero copy-fit gate", () => {
  it("passes an override inside the bands", () => {
    expect(validateHeroContent(heroEn({ titlePrefix: "Sleep right,", titleEmphasis: "sleep supported" }))).toEqual([]);
  });

  it("passes when nothing is overridden — the i18n default is gated separately", () => {
    expect(validateHeroContent({})).toEqual([]);
  });

  it("passes when an override is cleared back to the default", () => {
    const cleared = writeLocalisedField(heroEn({ titlePrefix: "Something" }), "titlePrefix", "en-US", "");
    expect(validateHeroContent(cleared)).toEqual([]);
  });

  it("rejects a headline over the character limit", () => {
    const long = "The most scientifically advanced cervical pillow ever engineered anywhere";
    const issues = validateHeroContent(heroEn({ titlePrefix: long, titleEmphasis: "", titleSuffix: "" }));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.message.includes(`limit is ${HERO_H1_CHAR_MAX}`))).toBe(true);
  });

  it("rejects a headline over the word limit", () => {
    const issues = validateHeroContent(
      heroEn({ titlePrefix: "one two three four five six seven eight nine ten", titleEmphasis: "", titleSuffix: "" }),
    );
    expect(issues.some((i) => i.message.includes(`limit is ${HERO_H1_WORD_MAX}`))).toBe(true);
  });

  it("names the measured value so the operator knows how much to cut", () => {
    const issues = validateHeroContent(
      heroEn({ titlePrefix: "one two three four five six seven eight nine ten", titleEmphasis: "", titleSuffix: "" }),
    );
    expect(issues[0].message).toMatch(/is \d+ (words|chars)/);
  });

  it("measures the composed headline, not each field alone", () => {
    // Two words each: fine together (4 words), and each part alone would be under the min.
    const issues = validateHeroContent(
      heroEn({ titlePrefix: "Sleep right,", titleEmphasis: "rest easy", titleSuffix: "" }),
    );
    expect(issues).toEqual([]);
  });

  it("rejects a subtitle over its word limit", () => {
    const issues = validateHeroContent(
      heroEn({
        titlePrefix: "Sleep right,",
        titleEmphasis: "sleep supported",
        subtitle: "one two three four five six seven eight nine ten eleven twelve thirteen",
      }),
    );
    expect(issues.some((i) => i.field === "subtitle")).toBe(true);
  });

  it("rejects banned clinical claims", () => {
    const issues = validateHeroContent(
      heroEn({ titlePrefix: "We treat", titleEmphasis: "neck pain" }),
    );
    expect(issues.some((i) => /cannot claim/.test(i.message))).toBe(true);
  });

  it("does not apply word bands to zh-CN, where whitespace counting is meaningless", () => {
    let content: Record<string, unknown> = {};
    content = writeLocalisedField(content, "titlePrefix", "zh-CN", "好好睡觉，睡得安稳，让颈椎每晚都得到真正的支撑与放松");
    expect(validateHeroContent(content)).toEqual([]);
  });

  it("attributes an issue to a field the operator actually edited", () => {
    const issues = validateHeroContent(
      heroEn({ titleEmphasis: "one two three four five six seven eight nine ten" }),
    );
    expect(issues[0].field).toBe("titleEmphasis");
    expect(issues[0].locale).toBe("en-US");
  });
});

describe("validateSectionCopy", () => {
  it("gates the hero", () => {
    const issues = validateSectionCopy(
      "hero",
      heroEn({ titlePrefix: "one two three four five six seven eight nine ten", titleEmphasis: "" }),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it("leaves other section types ungated", () => {
    expect(validateSectionCopy("text_image", { title: "anything at all, however long it happens to be" })).toEqual([]);
  });
});
