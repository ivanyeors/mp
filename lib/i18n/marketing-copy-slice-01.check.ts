import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { enUS } from "@/lib/i18n/messages/en-US";
import { zhCN } from "@/lib/i18n/messages/zh-CN";
import { assertMarketingCopySafe } from "@/lib/i18n/assert-marketing-copy-safe";

const ROOT = process.cwd();

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const heroSrc = read("components/sections/landing/hero-section.tsx");
assert.match(heroSrc, /c\.titlePrefix \?\? m\.home\.hero\.titlePrefix/);
assert.match(heroSrc, /c\.titleEmphasis \?\? m\.home\.hero\.titleEmphasis/);
assert.match(heroSrc, /c\.titleSuffix \?\? m\.home\.hero\.titleSuffix/);
assert.match(heroSrc, /c\.subtitle \?\? m\.home\.hero\.subtitle/);
assert.match(heroSrc, /m\.home\.hero\.seoAnswer/);
assert.match(heroSrc, /line-clamp-2/);
assert.match(heroSrc, /line-clamp-4/);
assert.match(heroSrc, /ctaCustomise/);
assert.match(heroSrc, /ctaBook/);
assert.match(read("components/sections/landing/text-image-section.tsx"), /m\.home\.sizeMatters\.title/);
assert.match(read("components/sections/landing/text-image-section.tsx"), /m\.home\.sizeMatters\.description/);
assert.match(
  read("components/sections/landing/pick-mpillow-section.tsx"),
  /m\.home\.pickYourMpillow\.products\.basic\.description/
);
assert.match(
  read("components/sections/landing/pick-mpillow-section.tsx"),
  /m\.home\.pickYourMpillow\.products\.premium\.description/
);

const hero = enUS.home.hero;
const h1 = [hero.titlePrefix, hero.titleEmphasis, hero.titleSuffix].filter(Boolean).join(" ");

assert.doesNotMatch(h1, /gift/i, "H1 must not lead with gift framing");
assert.match(h1, /sleep right/i);
assert.match(h1, /don.t sleep tight/i);

assert.doesNotMatch(hero.seoAnswer, /Science of Sleep/i);
assert.match(hero.seoAnswer, /Singapore/i);
assert.match(hero.seoAnswer, /cervical/i);
assert.match(hero.seoAnswer, /chronic neck stiffness/i);
assert.match(hero.seoAnswer, /Singapore store|in-store/i);
assert.match(hero.seoAnswer, /online/i, "overseas customers measure online");
assert.doesNotMatch(hero.seoAnswer, /\bfirst\b/i, "avoid unverifiable 'first' claim");

assertMarketingCopySafe(
  [{ label: "hero.seoAnswer", text: hero.seoAnswer, requireSingaporeOrCervical: true }],
  {
    heroH1: h1,
    heroSubtitle: hero.subtitle,
    heroSeoAnswer: hero.seoAnswer,
  }
);

assert.equal(hero.ctaCustomise, "Customise");
assert.equal(hero.ctaBookAppointment, "Book an appointment");

const size = enUS.home.sizeMatters;
const sizeBlob = `${size.title} ${size.description}`;
assert.match(sizeBlob, /shoulder length/i);
assert.match(sizeBlob, /height|loft/i);
assert.match(sizeBlob, /measure/i);
assert.match(size.title, /Singapore/i);

const basic = enUS.home.pickYourMpillow.products.basic.description;
const premium = enUS.home.pickYourMpillow.products.premium.description;
assert.match(basic, /occasional/i);
assert.match(basic, /cervical/i);
assert.match(premium, /chronic neck pain/i);
assert.match(premium, /consultative/i);
assert.match(premium, /cervical/i);
assert.match(premium, /FibreCool/i);

assert.match(zhCN.home.hero.titlePrefix, /送上好眠/);
assert.match(zhCN.home.hero.seoAnswer, /新加坡/);
assert.match(zhCN.home.pickYourMpillow.products.premium.description, /海外/);
assert.doesNotMatch(zhCN.home.hero.seoAnswer, /Science of Sleep/);

console.log("marketing-copy-slice-01.check.ts: ok");
console.log("H1:", h1, `(${h1.length} chars)`);
