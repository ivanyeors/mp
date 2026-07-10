/**
 * Slice 02 self-check — Neck Pains + Cervical Tech Neck section.
 * Run: npx tsx lib/i18n/marketing-copy-slice-02.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { enUS } from "@/lib/i18n/messages/en-US";
import { zhCN } from "@/lib/i18n/messages/zh-CN";
import { cervicalNeckSupportSlideSections } from "@/lib/product-slide-sections/configs/cervical-neck-support";
import { resolveSlideContent } from "@/lib/product-slide-sections/resolve-slide-content";

const ROOT = process.cwd();
const BANNED = /\b(prescribe|treat|cure|rehab)\b/i;

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const neck = enUS.home.neckPains;
assert.match(neck.title, /sleep/i);
assert.match(neck.title, /desk/i);
assert.match(neck.description, /screen|tech-?neck|device/i);
assert.match(neck.description, /cervical/i);
assert.match(neck.description, /Premium Mpillow/i);
assert.doesNotMatch(neck.title + " " + neck.description, BANNED);

const cns = enUS.slides.cervicalNeckSupport;
assert.ok(cns.heroDescription.trim().length > 0, "heroDescription must be non-empty");
assert.match(cns.heroDescription, /cervical/i);
assert.match(cns.heroDescription, /screen|desk|device/i);
assert.match(cns.heroDescription, /Singapore/i);
assert.doesNotMatch(cns.heroDescription, BANNED);

assert.equal(cns.techNeckTitle, "Built for tech-neck days, recovered at night");
assert.ok(cns.techNeckParagraphs.length >= 1);
const techCopy = [cns.techNeckTitle, ...cns.techNeckParagraphs].join(" ");
assert.match(techCopy, /tech-?neck|desk|device|screen/i);
assert.match(techCopy, /overnight|night/i);
assert.doesNotMatch(techCopy, BANNED);

const types = cervicalNeckSupportSlideSections.map((s) =>
  "contentKey" in s ? `${s.type}:${s.contentKey}` : s.type
);
assert.deepEqual(types, [
  "media_intro:hero",
  "split_hero:techNeck",
  "split_hero:why",
  "full_bleed_media",
  "feature_card_grid:benefits",
  "text_callout_block:difference",
]);

const resolved = resolveSlideContent(cns, "split_hero", "techNeck");
assert.equal(resolved.title, cns.techNeckTitle);
assert.deepEqual(resolved.paragraphs, cns.techNeckParagraphs);

const hero = resolveSlideContent(cns, "media_intro", "hero");
assert.equal(hero.description, cns.heroDescription);

// Mobile Learn More path still present
const neckSrc = read("components/sections/landing/neck-pains-section.tsx");
assert.match(neckSrc, /md:hidden[\s\S]*feelCard/);
assert.match(neckSrc, /CervicalNeckSupportLearnMoreCta/);

// openCervicalNeckSupportSheet + Back footer unchanged
const sheetSrc = read("components/slide-in-pages/cervical-neck-support.tsx");
assert.match(sheetSrc, /export function openCervicalNeckSupportSheet/);
assert.match(sheetSrc, />\s*Back\s*</);

// zh-CN Neck Pains + existing heroDescription left untouched; new keys only for type parity
assert.equal(zhCN.home.neckPains.title, "颈椎不适？");
assert.equal(zhCN.slides.cervicalNeckSupport.heroDescription, "");
assert.ok(zhCN.slides.cervicalNeckSupport.techNeckTitle.trim());
assert.ok(zhCN.slides.cervicalNeckSupport.techNeckParagraphs.length >= 1);

console.log("marketing-copy-slice-02.check.ts: ok");
console.log("section order:", types.join(" → "));
