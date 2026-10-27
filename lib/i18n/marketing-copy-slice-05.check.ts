/**
 * Slice 05 self-check — Proof surfaces (en-US).
 * Run: npx tsx lib/i18n/marketing-copy-slice-05.check.ts
 *
 * CMS note: prod `landing_sections.content` may still override home ambassadors /
 * credibility / review / founder / why-choose cards until re-seeded; Size Matters
 * slide title always comes from i18n `slides.sizeMatters`.
 */
import assert from "node:assert/strict";
import { enUS } from "@/lib/i18n/messages/en-US";
import { zhCN } from "@/lib/i18n/messages/zh-CN";

const BANNED = /\b(prescribe|treat|cure|rehab)\b/i;
const LOCAL_AMB = /local\s+ambassadors?/i;

// --- Size Matters slide title ---
assert.doesNotMatch(enUS.slides.sizeMatters.title, /Science of Sleep/i);
assert.match(enUS.slides.sizeMatters.title, /why size matters/i);
assert.equal(
  enUS.slides.sizeMatters.description,
  "A pillow should fit you, not the other way around."
);
assert.doesNotMatch(enUS.slides.sizeMatters.title, BANNED);

// --- Credibility tiles ---
const cred = enUS.home.credibility.cards.map((c) => c.description).join(" ");
assert.doesNotMatch(cred, /Science of Sleep/i);
assert.match(cred, /cervical fit/i);
assert.match(cred, /patented modular|modular design is patented/i);
assert.doesNotMatch(cred, BANNED);

// --- Review subtitle ---
assert.match(enUS.home.review.subtitle, /clinician review/i);
assert.match(enUS.home.review.subtitle, /customised cervical/i);
assert.match(enUS.home.review.subtitle, /neck pain/i);
assert.match(enUS.home.review.subtitle, /Singapore/i);
assert.doesNotMatch(enUS.home.review.subtitle, BANNED);

// --- Founder: measurement-led cervical fit paragraph ---
const founder = enUS.home.founder.paragraphs.join(" ");
assert.ok(enUS.home.founder.paragraphs.length >= 3, "founder gained measurement paragraph");
assert.match(founder, /measure/i);
assert.match(founder, /cervical/i);
assert.match(founder, /one-size|foam/i);
assert.doesNotMatch(founder, BANNED);

// --- Ambassadors: Consumer framing, never Local Ambassadors ---
assert.match(enUS.home.ambassadors.title, /how you stand is how you sleep/i);
assert.match(enUS.home.ambassadors.description, /our ambassadors/i);
assert.match(enUS.home.ambassadors.description, /Skyjin/i);
assert.match(enUS.home.ambassadors.description, /Our Partners/i);
assert.doesNotMatch(enUS.home.ambassadors.title + enUS.home.ambassadors.description, LOCAL_AMB);
assert.match(enUS.slides.ambassadors.ambassadorsTitle, /our ambassadors/i);
assert.doesNotMatch(enUS.slides.ambassadors.ambassadorsTitle, LOCAL_AMB);
assert.doesNotMatch(enUS.home.ambassadors.description, BANNED);

// --- Why choose: tightened one-liners (no new title key — UI has cards only) ---
const modular = enUS.home.whyChoose.cards.find((c) => c.key === "why-05");
assert.ok(modular);
assert.match(modular!.description, /replace layers/i);
for (const card of enUS.home.whyChoose.cards) {
  assert.doesNotMatch(card.description, BANNED);
  const w = card.description.trim().split(/\s+/).length;
  assert.ok(w <= 16, `${card.key} description too long (${w})`);
}

// --- zh-CN untouched ---
assert.equal(zhCN.slides.sizeMatters.title, "为什么选择 Mpillow");
assert.equal(zhCN.home.credibility.cards[0]?.description, "获奖品牌");
assert.equal(zhCN.home.review.subtitle, "精选推荐视频。");
assert.equal(zhCN.home.founder.paragraphs.length, 2);
assert.match(zhCN.home.ambassadors.description, /Skyjin/);
assert.doesNotMatch(zhCN.home.ambassadors.description, /Consumer ambassadors/);

console.log("marketing-copy-slice-05.check.ts: ok");
