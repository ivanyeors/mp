import assert from "node:assert/strict";
import { enUS } from "@/lib/i18n/messages/en-US";
import { zhCN } from "@/lib/i18n/messages/zh-CN";

const BANNED = /\b(prescribe|treat|cure|rehab)\b/i;
const LOCAL_AMB = /local\s+ambassadors?/i;

assert.doesNotMatch(enUS.slides.sizeMatters.title, /Science of Sleep/i);
assert.match(enUS.slides.sizeMatters.title, /why size matters/i);
assert.equal(
  enUS.slides.sizeMatters.description,
  "A pillow should fit you, not the other way around."
);
assert.doesNotMatch(enUS.slides.sizeMatters.title, BANNED);

const cred = enUS.home.credibility.cards.map((c) => c.description).join(" ");
assert.doesNotMatch(cred, /Science of Sleep/i);
assert.match(cred, /cervical fit/i);
assert.match(cred, /patented modular|modular design is patented/i);
assert.doesNotMatch(cred, BANNED);

assert.match(enUS.home.review.subtitle, /clinician review/i);
assert.match(enUS.home.review.subtitle, /customised cervical/i);
assert.match(enUS.home.review.subtitle, /neck pain/i);
assert.match(enUS.home.review.subtitle, /Singapore/i);
assert.doesNotMatch(enUS.home.review.subtitle, BANNED);

const founder = enUS.home.founder.paragraphs.join(" ");
assert.ok(enUS.home.founder.paragraphs.length >= 3, "founder gained measurement paragraph");
assert.match(founder, /measure/i);
assert.match(founder, /cervical/i);
assert.match(founder, /one-size|foam/i);
assert.doesNotMatch(founder, BANNED);

assert.match(enUS.home.ambassadors.title, /how you stand is how you sleep/i);
assert.match(enUS.home.ambassadors.description, /our ambassadors/i);
assert.match(enUS.home.ambassadors.description, /Skyjin/i);
assert.match(enUS.home.ambassadors.description, /Our Partners/i);
assert.doesNotMatch(enUS.home.ambassadors.title + enUS.home.ambassadors.description, LOCAL_AMB);
assert.match(enUS.slides.ambassadors.ambassadorsTitle, /our ambassadors/i);
assert.doesNotMatch(enUS.slides.ambassadors.ambassadorsTitle, LOCAL_AMB);
assert.doesNotMatch(enUS.home.ambassadors.description, BANNED);

const modular = enUS.home.whyChoose.cards.find((c) => c.key === "why-05");
assert.ok(modular);
assert.match(modular!.description, /replace layers/i);
for (const card of enUS.home.whyChoose.cards) {
  assert.doesNotMatch(card.description, BANNED);
  const w = card.description.trim().split(/\s+/).length;
  assert.ok(w <= 16, `${card.key} description too long (${w})`);
}

assert.equal(zhCN.slides.sizeMatters.title, "为什么选择 Mpillow");
assert.equal(zhCN.home.credibility.cards[0]?.description, "获奖品牌");
assert.equal(zhCN.home.review.subtitle, "精选推荐视频。");
assert.equal(zhCN.home.founder.paragraphs.length, 2);
assert.match(zhCN.home.ambassadors.description, /Skyjin/);
assert.doesNotMatch(zhCN.home.ambassadors.description, /Consumer ambassadors/);

console.log("marketing-copy-slice-05.check.ts: ok");
