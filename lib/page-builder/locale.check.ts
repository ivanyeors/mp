/**
 * Slice 03 self-check: landing overrides resolve per locale, in one place.
 * Run: npx tsx --env-file=.env.local lib/page-builder/locale.check.ts
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveContentLocale, writeLocalisedField } from "@/lib/page-builder/locale";
import { enUS } from "@/lib/i18n/messages/en-US";
import { zhCN } from "@/lib/i18n/messages/zh-CN";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// --- The bug this slice closes: an English override must not reach the zh-CN page ---
const legacy = { title: "Sleep right" };
assert.deepEqual(resolveContentLocale(legacy, "en-US"), { title: "Sleep right" });
assert.deepEqual(resolveContentLocale(legacy, "zh-CN"), {}, "English override does not leak to zh-CN");

const bilingual = writeLocalisedField(legacy, "title", "zh-CN", "好好睡");
assert.deepEqual(resolveContentLocale(bilingual, "en-US"), { title: "Sleep right" });
assert.deepEqual(resolveContentLocale(bilingual, "zh-CN"), { title: "好好睡" });

// Images must survive on both locales — they are not copy.
const withImage = { image: "/hero.webp", title: "English only" };
assert.equal(
  (resolveContentLocale(withImage, "zh-CN") as { image?: string }).image,
  "/hero.webp",
  "images are not dropped on zh-CN",
);

// --- Resolution happens once, before the dispatch ---
const dispatcher = read("components/sections/landing/landing-section.tsx");
assert.match(dispatcher, /resolveContentLocale\(stored\.content, locale\)/, "dispatcher resolves once");
const switchBody = dispatcher.slice(dispatcher.indexOf("switch (section.section_type)"));
assert.doesNotMatch(
  switchBody,
  /section\.content as/,
  "no branch reads raw content — that would sit outside the one place resolution happens",
);
assert.match(dispatcher, /CustomFullWidthImageSection/, "the inline case was extracted to a component");

// No section component resolves locale itself; they keep their `?? messages…` fallbacks.
const sectionFiles = readdirSync(join(ROOT, "components/sections/landing")).filter(
  // The dispatcher itself is the one place that resolves; everything else must not.
  (f) => f.endsWith(".tsx") && f !== "landing-section.tsx",
);
for (const file of sectionFiles) {
  const src = read(join("components/sections/landing", file));
  assert.doesNotMatch(
    src,
    /resolveContentLocale|readLocalisedValue|isLocaleMap/,
    `${file} does not resolve locale itself`,
  );
}

// --- Shop CTA is translatable and no longer a hardcoded English literal ---
const shopCta = read("components/sections/landing/shop-cta-section.tsx");
assert.doesNotMatch(shopCta, /"Shop Now"/, "the hardcoded English button label is gone");
assert.match(shopCta, /m\.common\.shopNow/, "the button label comes from i18n");
assert.ok(enUS.common.shopNow, "en-US has common.shopNow");
assert.ok(zhCN.common.shopNow, "zh-CN has common.shopNow");
assert.notEqual(enUS.common.shopNow, zhCN.common.shopNow, "the zh-CN label is actually translated");

// --- Sections offered in the Add dialog all have editor fields ---
const editor = read("components/settings/page-builder/section-editor.tsx");
for (const type of ["shop_cta", "featured_products"]) {
  assert.match(editor, new RegExp(`case "${type}":`), `${type} has an editor case`);
}
assert.match(editor, /Editing language/, "the inspector has a language switch");
assert.match(editor, /readLocalisedField/, "editor reads through the locale helpers");
assert.match(editor, /writeLocalisedField/, "editor writes through the locale helpers");
assert.match(editor, /aria-pressed/, "the language switch announces its state");

console.log("landing-locale self-check ok");
