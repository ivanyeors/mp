/**
 * Slice 07 self-check — Stories i18n + claims/SEO gate.
 * Run: npx tsx lib/i18n/marketing-copy-slice-07.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertMarketingCopySafe,
  BANNED_CLINICAL,
  wordCount,
} from "@/lib/i18n/assert-marketing-copy-safe";
import { enUS } from "@/lib/i18n/messages/en-US";
import { zhCN } from "@/lib/i18n/messages/zh-CN";
import { buildLlmsIndex } from "@/lib/seo/llms-index";

const ROOT = process.cwd();

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

// --- Stories from i18n (not hardcoded EN) ---
assert.match(enUS.home.stories.title, /Singapore customers/i);
assert.match(enUS.home.stories.subtitle, /custom-fit sleep|neck comfort/i);
assert.doesNotMatch(enUS.home.stories.title + enUS.home.stories.subtitle, BANNED_CLINICAL);

const storiesSrc = read("components/sections/stories-section.tsx");
assert.doesNotMatch(storiesSrc, /Hear from our customers/);
assert.doesNotMatch(storiesSrc, /Top reviews from Google/);
assert.match(storiesSrc, /title=\{title\}/);
assert.match(storiesSrc, /subtitle=\{subtitle\}/);

const wrapperSrc = read("components/sections/landing/stories-section-wrapper.tsx");
assert.match(wrapperSrc, /messages\.home\.stories\.title/);
assert.match(wrapperSrc, /messages\.home\.stories\.subtitle/);

const landingSrc = read("components/sections/landing/landing-section.tsx");
assert.match(landingSrc, /StoriesSectionWrapper messages=\{messages\}/);

assert.match(zhCN.home.stories.title, /新加坡/);

// --- Claims/SEO gate over SEO-flagged samples ---
const hero = enUS.home.hero;
const h1 = [hero.titlePrefix, hero.titleEmphasis, hero.titleSuffix].filter(Boolean).join(" ");
const gated = [
  { label: "hero.h1", text: h1 }, // tagline OK; SEM intents live in seoAnswer
  { label: "hero.seoAnswer", text: hero.seoAnswer, requireSingaporeOrCervical: true },
  { label: "home.neckPains", text: `${enUS.home.neckPains.title} ${enUS.home.neckPains.description}`, requireSingaporeOrCervical: true },
  { label: "home.mbolster", text: `${enUS.home.mbolster.description} ${enUS.home.mbolster.subtitle}` },
  { label: "home.stories", text: `${enUS.home.stories.title} ${enUS.home.stories.subtitle}`, requireSingaporeOrCervical: true },
  {
    label: "slides.cervical",
    text: `${enUS.slides.cervicalNeckSupport.heroTitle} ${enUS.slides.cervicalNeckSupport.heroDescription} ${enUS.slides.cervicalNeckSupport.techNeckTitle} ${enUS.slides.cervicalNeckSupport.techNeckParagraphs.join(" ")}`,
    requireSingaporeOrCervical: true,
  },
];

assertMarketingCopySafe(gated, {
  heroH1: h1,
  heroSubtitle: hero.subtitle,
  heroSeoAnswer: hero.seoAnswer,
});

// Helper must fail on banned verbs
let threw = false;
try {
  assertMarketingCopySafe([{ label: "bad", text: "We cure neck pain." }]);
} catch {
  threw = true;
}
assert.ok(threw, "assertMarketingCopySafe must fail on treat/cure/prescribe/rehab");

// Helper must fail outside hero word band
threw = false;
try {
  assertMarketingCopySafe([], { heroSeoAnswer: "Too short." });
} catch {
  threw = true;
}
assert.ok(threw, "assertMarketingCopySafe must fail short hero seoAnswer");

// --- llms.txt: Science of Sleep is retired ---
process.env.NEXT_PUBLIC_SITE_URL ??= "https://custom.mpillow.com";
const llms = buildLlmsIndex([{ slug: "cervical-support", title: "Cervical Support" }]);
assert.ok(!llms.includes("Science of Sleep"), "llms index must not mention Science of Sleep");

console.log("marketing-copy-slice-07.check.ts: ok");
console.log("hero seoAnswer words:", wordCount(hero.seoAnswer));
