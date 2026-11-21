import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { enUS } from "@/lib/i18n/messages/en-US";
import { zhCN } from "@/lib/i18n/messages/zh-CN";

const ROOT = process.cwd();
const BANNED = /\b(prescribe|treat|cure|rehab)\b/i;

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function words(s: string) {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

const premium = enUS.slides.premiumMpillow;
const hero = `${premium.heroSubtitle} ${premium.heroParagraphs.join(" ")}`;
assert.doesNotMatch(hero, /Science of Sleep/i);
assert.match(hero, /Singapore/i, "in-store fitting is Singapore only");
assert.match(hero, /consultative/i);
assert.match(hero, /fitting|fit/i);
assert.doesNotMatch(hero, BANNED);

const fibreLine = premium.packageItems.find((item) => /FibreCool/i.test(item));
assert.ok(fibreLine, "FibreCool package line");
assert.match(fibreLine!, /warm|device|heat/i);
assert.doesNotMatch(fibreLine!, BANNED);
assert.doesNotMatch(
  read("lib/i18n/messages/en-US.ts"),
  /cervicalNeckSupport[\s\S]*FibreCool[\s\S]*warm after long device/i
);

assert.match(premium.whoItsForConclusion, /sleep comfort/i);
assert.match(premium.whoItsForConclusion, /overnight alignment/i);
assert.doesNotMatch(premium.whoItsForConclusion, BANNED);
assert.doesNotMatch(premium.whoItsForConclusion, /alleviate|treat|cure/i);

const basic = enUS.slides.basicMpillow;
assert.match(basic.description, /Singapore/i);
assert.match(basic.description, /custom[- ]?fit/i);
assert.match(basic.description, /cervical/i);
assert.doesNotMatch(basic.description, BANNED);

const mpSrc = read("app/[lang]/mp-config/page.tsx");
const h1Match = mpSrc.match(/"en-US":\s*\{[\s\S]*?h1:\s*"((?:\\.|[^"\\])*)"/);
assert.ok(h1Match, "en-US mp-config h1");
const h1 = h1Match![1].replace(/\\"/g, '"');
assert.equal(h1, "Customise your Mpillow cervical pillow");
assert.doesNotMatch(h1, /Mpillow Pillow/);

const ledeMatch = mpSrc.match(/"en-US":\s*\{[\s\S]*?lede:\s*"((?:\\.|[^"\\])*)"/);
assert.ok(ledeMatch, "en-US mp-config lede");
const lede = ledeMatch![1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
assert.doesNotMatch(lede, /Science of Sleep/i);
assert.match(lede, /in-store fitting/i);
assert.match(lede, /Singapore/i);
assert.match(lede, /modular/i);
assert.doesNotMatch(lede, BANNED);
const ledeWords = words(lede);
assert.ok(ledeWords >= 50 && ledeWords <= 140, `mp-config lede words ${ledeWords}`);

const introAt = mpSrc.indexOf("<ConfiguratorSeoIntro");
const faqAt = mpSrc.indexOf("<PageFaqSection");
const clientAt = mpSrc.indexOf("<MpConfigClient");
assert.ok(introAt >= 0 && faqAt > introAt && clientAt > faqAt, "wizard below SEO shell");

assert.equal(zhCN.slides.premiumMpillow.heroSubtitle, "Premium Mpillow 是一款可定制枕头");
assert.match(zhCN.slides.basicMpillow.description, /亲民价格/);
assert.match(mpSrc, /定制您的 Mpillow 枕头/);
assert.doesNotMatch(mpSrc, /"zh-CN":\s*\{[\s\S]*?Science of Sleep/);

console.log("marketing-copy-slice-04.check.ts: ok");
console.log("mp-config lede words:", ledeWords);
