import { describe, expect, it } from "vitest";

import {
  isLocaleMap,
  readLocalisedField,
  resolveContentLocale,
  writeLocalisedField,
} from "@/lib/page-builder/locale";

describe("isLocaleMap", () => {
  it("recognises a map whose every key is a supported locale", () => {
    expect(isLocaleMap({ "en-US": "Hi", "zh-CN": "你好" })).toBe(true);
    expect(isLocaleMap({ "en-US": "Hi" })).toBe(true);
  });

  it("does not mistake nested content shapes for translations", () => {
    // A why-choose card, and the neck-pains "how it feels" pair.
    expect(isLocaleMap({ label: "a", title: "b" })).toBe(false);
    expect(isLocaleMap({ label: "a", description: "b" })).toBe(false);
    // A partial match must not count, or half the object would be dropped.
    expect(isLocaleMap({ "en-US": "Hi", description: "b" })).toBe(false);
    expect(isLocaleMap({})).toBe(false);
    expect(isLocaleMap("Hi")).toBe(false);
    expect(isLocaleMap(null)).toBe(false);
  });
});

describe("resolveContentLocale", () => {
  it("picks the copy for the active locale", () => {
    const content = { title: { "en-US": "Sleep right", "zh-CN": "好好睡" } };
    expect(resolveContentLocale(content, "en-US")).toEqual({ title: "Sleep right" });
    expect(resolveContentLocale(content, "zh-CN")).toEqual({ title: "好好睡" });
  });

  it("treats a legacy bare string as English only — the bug this closes", () => {
    const content = { title: "Sleep right" };
    expect(resolveContentLocale(content, "en-US")).toEqual({ title: "Sleep right" });
    // Key removed, so the component's `?? messages…` fallback fires.
    expect(resolveContentLocale(content, "zh-CN")).toEqual({});
  });

  it("removes a key rather than setting it undefined, so ?? fallbacks fire", () => {
    const resolved = resolveContentLocale({ title: { "en-US": "Only English" } }, "zh-CN");
    expect("title" in resolved).toBe(false);
  });

  it("passes non-copy fields through for every locale", () => {
    const content = {
      image: "https://cdn.example.com/a.webp",
      media_asset_id: "asset-1",
      videoId: "abc123",
      buttonUrl: "/shop",
      flip: true,
      limit: 6,
    };
    expect(resolveContentLocale(content, "zh-CN")).toEqual(content);
  });

  it("resolves inside card arrays", () => {
    const content = {
      cards: [
        { key: "fit", title: { "en-US": "Fit", "zh-CN": "贴合" } },
        { key: "care", title: { "en-US": "Care" } },
      ],
    };
    expect(resolveContentLocale(content, "zh-CN")).toEqual({
      cards: [{ key: "fit", title: "贴合" }],
    });
  });

  it("drops a card array that resolves to nothing, so the i18n default returns", () => {
    const content = { cards: [{ title: "English only" }, { title: "Also English" }] };
    expect(resolveContentLocale(content, "zh-CN")).toEqual({});
  });

  it("drops a paragraph list with no copy for this locale", () => {
    expect(resolveContentLocale({ paragraphs: ["one", "two"] }, "zh-CN")).toEqual({});
    expect(resolveContentLocale({ paragraphs: ["one", "two"] }, "en-US")).toEqual({
      paragraphs: ["one", "two"],
    });
  });

  it("ignores empty strings so a blank override does not beat the default", () => {
    expect(resolveContentLocale({ title: "   " }, "en-US")).toEqual({});
    expect(resolveContentLocale({ title: { "en-US": "" } }, "en-US")).toEqual({});
  });

  it("handles empty and missing content", () => {
    expect(resolveContentLocale({}, "en-US")).toEqual({});
    expect(resolveContentLocale(null, "zh-CN")).toEqual({});
    expect(resolveContentLocale(undefined, "en-US")).toEqual({});
  });
});

describe("editor field helpers", () => {
  it("shows a legacy string under English and nothing under Chinese", () => {
    const content = { title: "Sleep right" };
    expect(readLocalisedField(content, "title", "en-US")).toBe("Sleep right");
    expect(readLocalisedField(content, "title", "zh-CN")).toBe("");
  });

  it("keeps existing English when a Chinese translation is added", () => {
    const next = writeLocalisedField({ title: "Sleep right" }, "title", "zh-CN", "好好睡");
    expect(next.title).toEqual({ "en-US": "Sleep right", "zh-CN": "好好睡" });
  });

  it("edits one locale without touching the other", () => {
    const content = { title: { "en-US": "A", "zh-CN": "B" } };
    const next = writeLocalisedField(content, "title", "en-US", "A2");
    expect(next.title).toEqual({ "en-US": "A2", "zh-CN": "B" });
  });

  it("clearing one locale leaves the other intact", () => {
    const content = { title: { "en-US": "A", "zh-CN": "B" } };
    const next = writeLocalisedField(content, "title", "zh-CN", "");
    expect(next.title).toEqual({ "en-US": "A" });
  });

  it("clearing the last locale drops the key so the i18n default returns", () => {
    const next = writeLocalisedField({ title: { "en-US": "A" } }, "title", "en-US", "");
    expect("title" in next).toBe(false);
  });

  it("writes non-localised fields as plain values", () => {
    const next = writeLocalisedField({}, "image", "zh-CN", "/a.webp");
    expect(next.image).toBe("/a.webp");
    expect(readLocalisedField(next, "image", "en-US")).toBe("/a.webp");
  });

  it("round-trips through the resolver", () => {
    let content: Record<string, unknown> = {};
    content = writeLocalisedField(content, "title", "en-US", "Sleep right");
    content = writeLocalisedField(content, "title", "zh-CN", "好好睡");
    expect(resolveContentLocale(content, "en-US")).toEqual({ title: "Sleep right" });
    expect(resolveContentLocale(content, "zh-CN")).toEqual({ title: "好好睡" });
  });
});
