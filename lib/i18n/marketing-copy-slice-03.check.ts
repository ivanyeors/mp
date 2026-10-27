/**
 * Slice 03 self-check — Mbolster Families weave (en-US).
 * Run: npx tsx lib/i18n/marketing-copy-slice-03.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { enUS } from "@/lib/i18n/messages/en-US";
import { zhCN } from "@/lib/i18n/messages/zh-CN";

const ROOT = process.cwd();
const FORBIDDEN_OFFER = /family\s*bundle|workshop|fitting[- ]fee/i;
const BANNED = /\b(prescribe|treat|cure|rehab)\b/i;

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function words(s: string) {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

const home = enUS.home.mbolster;
assert.match(home.description, /kids|children/i);
assert.match(home.description, /adult/i);
assert.match(home.description + " " + home.subtitle, /household/i);
assert.match(home.subtitle, /Mpillow/);
assert.doesNotMatch(home.description + home.subtitle, /Science of Sleep/i);
assert.doesNotMatch(home.description + home.subtitle, FORBIDDEN_OFFER);
assert.doesNotMatch(home.description + home.subtitle, BANNED);

const slide = enUS.slides.mbolster;
const about = slide.aboutParagraphs.join(" ");
assert.match(about, /household|children/i);
assert.match(about, /adult/i);
assert.doesNotMatch(about, FORBIDDEN_OFFER);

const discover = slide.discoverParagraphs.join(" ");
assert.doesNotMatch(discover, /Science of Sleep/i);
assert.match(discover, /Mpillow/i);
assert.match(discover, /household/i);
assert.doesNotMatch(discover, FORBIDDEN_OFFER);
assert.doesNotMatch(discover, BANNED);

// Keep existing size-guide kids line
assert.match(slide.sizeGuideDescription, /kids/i);
assert.match(slide.sizeGuideItems[0] ?? "", /children/i);

const pageSrc = read("app/[lang]/mbolster-config/page.tsx");
const ledeMatch = pageSrc.match(/"en-US":\s*\{[\s\S]*?lede:\s*"((?:\\.|[^"\\])*)"/);
assert.ok(ledeMatch, "en-US mbolster-config lede");
const lede = ledeMatch![1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
assert.match(lede, /side sleepers? in Singapore/i);
assert.match(lede, /short,\s*medium,\s*or long/i);
assert.match(lede, /kids|children/i);
assert.match(lede, /height/i);
assert.doesNotMatch(lede, FORBIDDEN_OFFER);
assert.doesNotMatch(lede, BANNED);
const w = words(lede);
assert.ok(w >= 50 && w <= 140, `mbolster-config lede words ${w}`);

// zh-CN home mbolster untouched
assert.match(zhCN.home.mbolster.description, /可定制/);
assert.doesNotMatch(zhCN.home.mbolster.subtitle, /Science of Sleep/);

console.log("marketing-copy-slice-03.check.ts: ok");
console.log("mbolster-config lede words:", w);
