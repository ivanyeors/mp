import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { FAQ_DEFAULTS } from "../defaults";
import { stripMarkdownForSchema } from "../index";

describe("faq seed + schema helpers", () => {
  it("default categories/items are complete, localized, and slug-unique", () => {
    const categoryCount = FAQ_DEFAULTS.length;
    assert.equal(categoryCount, 5, "expected 5 default FAQ categories");

    const itemCount = FAQ_DEFAULTS.reduce((n, c) => n + c.items.length, 0);
    assert.equal(itemCount, 32, "expected 32 default FAQ items");

    for (const cat of FAQ_DEFAULTS) {
      assert.ok(cat.labels["en-US"], `missing en-US label for ${cat.key}`);
      assert.ok(cat.labels["zh-CN"], `missing zh-CN label for ${cat.key}`);
      const slugs = new Set<string>();
      for (const item of cat.items) {
        assert.ok(item.content["en-US"]?.question, `missing en-US question: ${item.slug}`);
        assert.ok(item.content["zh-CN"]?.question, `missing zh-CN question: ${item.slug}`);
        assert.ok(!slugs.has(item.slug), `duplicate slug in ${cat.key}: ${item.slug}`);
        slugs.add(item.slug);
      }
    }
  });

  it("strips markdown for schema text", () => {
    assert.equal(
      stripMarkdownForSchema("See [our guide](/mp-care) for **details**."),
      "See our guide for details.",
    );
  });
});
