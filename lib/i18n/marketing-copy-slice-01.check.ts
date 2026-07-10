/**
 * Slice 01 self-check — Affluent Pain home stack (en-US).
 * Run: npx tsx lib/i18n/marketing-copy-slice-01.check.ts
 *
 * CMS note: prod `landing_sections.content` may still override hero title/subtitle
 * and Size Matters title/description until re-seeded; seoAnswer + pick blurbs
 * always come from i18n.
 */
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

// --- Wiring: empty CMS content falls back to i18n; CTAs + mobile clamp intact ---
const heroSrc = read("components/sections/landing/hero-section.tsx");
assert.match(heroSrc, /c\.titlePrefix \?\? m\.home\.hero\.titlePrefix/);
assert.match(heroSrc, /c\.titleEmphasis \?\? m\.home\.hero\.titleEmphasis/);
assert.match(heroSrc, /c\.titleSuffix \?\? m\.home\.hero\.titleSuffix/);
assert.match(heroSrc, /c\.subtitle \?\? m\.home\.hero\.subtitle/);
assert.match(heroSrc, /m\.home\.hero\.seoAnswer/);
assert.match(heroSrc, /line-clamp-3/);
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
const h1 = `${hero.titlePrefix} ${hero.titleEmphasis} ${hero.titleSuffix}`;

assert.doesNotMatch(h1, /gift/i, "H1 must not lead with gift framing");
assert.match(h1, /Science of Sleep/i);
assert.match(h1, /cervical/i);
assert.match(h1, /neck pain/i);
assert.match(h1, /Singapore/i);

assert.match(hero.seoAnswer, /^Mpillow is Singapore's Science of Sleep/i);
assert.match(hero.seoAnswer, /in-store/i);
assert.match(hero.seoAnswer, /chronic neck stiffness/i);
const ledeWords = words(hero.seoAnswer);
assert.ok(ledeWords >= 60 && ledeWords <= 120, `seoAnswer word count ${ledeWords} (need 60–120)`);
assert.doesNotMatch(hero.seoAnswer, BANNED);

assert.match(hero.subtitle, /modular cervical/i);
assert.match(hero.subtitle, /neck curve/i);
assert.match(hero.subtitle, /sleep position/i);
assert.match(hero.subtitle, /body build/i);
assert.doesNotMatch(hero.subtitle, BANNED);

assert.equal(hero.ctaCustomise, "Customise");
assert.equal(hero.ctaBookAppointment, "Book an appointment");

const size = enUS.home.sizeMatters;
assert.match(size.title, /shoulder length/i);
assert.match(size.title + " " + size.description, /height|loft/i);
assert.match(size.description, /measure/i);
assert.doesNotMatch(size.title + " " + size.description, BANNED);

const basic = enUS.home.pickYourMpillow.products.basic.description;
const premium = enUS.home.pickYourMpillow.products.premium.description;
assert.match(basic, /occasional/i);
assert.match(premium, /chronic neck pain/i);
assert.match(premium, /consultative/i);
assert.match(premium, /cervical/i);
assert.doesNotMatch(basic + " " + premium, BANNED);

// zh-CN untouched in this slice
assert.match(zhCN.home.hero.titlePrefix, /送上好眠/);
assert.equal(zhCN.home.pickYourMpillow.products.basic.description, "入门定制，轻松体验");

console.log("marketing-copy-slice-01.check.ts: ok");
