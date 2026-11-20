import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PageFaqSectionView } from "@/components/page-faq/page-faq-section";
import { PAGE_FAQ_DEFAULTS } from "@/lib/page-faq/defaults";
import { DEFAULT_WORK_WITH_US } from "@/lib/partners/types";

const BANNED = /\b(prescribe|treat|cure|rehab)\b/i;
const FORBIDDEN_OFFER = /voucher|family\s*bundle|workshop|fitting[- ]fee/i;

const home = PAGE_FAQ_DEFAULTS.find((d) => d.surfaceKey === "home");
assert.ok(home, "home Page FAQ defaults");

const bySlug = Object.fromEntries(home!.items.map((i) => [i.slug, i]));

const whatIs = bySlug["what-is-mpillow"]!.content["en-US"]!;
assert.match(whatIs.question, /What is Mpillow/i);
assert.doesNotMatch(whatIs.answer, /Storefront/i);
assert.match(whatIs.answer, /mp-config/);
assert.doesNotMatch(whatIs.answer, BANNED);

const cervical = bySlug["cervical-vs-ergonomic"]!.content["en-US"]!;
assert.match(cervical.question, /cervical and an ergonomic/i);
assert.match(cervical.answer, /neck curve|cervical/i);
assert.match(cervical.answer, /mp-config|customisation/i);
assert.doesNotMatch(cervical.answer, BANNED);

const techNeck = bySlug["tech-neck-at-night"]!.content["en-US"]!;
assert.match(techNeck.question, /tech neck/i);
assert.match(techNeck.answer, /screen|desk/i);
assert.match(techNeck.answer, /overnight alignment|cervical/i);
assert.match(techNeck.answer, /mp-config|customise/i);
assert.match(techNeck.answer, /not medical treatment|support and align/i);
assert.doesNotMatch(techNeck.answer, BANNED);
assert.doesNotMatch(techNeck.answer, FORBIDDEN_OFFER);

assert.ok(bySlug["cervical-vs-ergonomic"]!.content["zh-CN"]?.question);
assert.ok(bySlug["tech-neck-at-night"]!.content["zh-CN"]?.question);
assert.match(bySlug["what-is-mpillow"]!.content["zh-CN"]!.answer, /模块化/);

const partners = DEFAULT_WORK_WITH_US["en-US"];
assert.match(partners.title ?? "", /clinical sleep support/i);
assert.match(partners.title ?? "", /Singapore/i);
assert.match(partners.subtitle ?? "", /chiropractors/i);
assert.match(partners.subtitle ?? "", /physiotherapists/i);
assert.match(partners.subtitle ?? "", /wellness/i);
assert.match(partners.subtitle ?? "", /cervical/i);
assert.equal(partners.ctaButtonLabel, "Request a demo");
assert.equal(partners.ctaButtonUrl, "/partner/apply");
assert.doesNotMatch(
  `${partners.title} ${partners.subtitle} ${partners.ctaSubtitle}`,
  FORBIDDEN_OFFER
);
assert.doesNotMatch(`${partners.title} ${partners.subtitle}`, BANNED);

assert.equal(DEFAULT_WORK_WITH_US["zh-CN"].title, "与我们合作");

const sampleItems = home!.items.map((item, i) => ({
  id: `id-${i}`,
  slug: item.slug,
  question: item.content["en-US"]!.question,
  answer: item.content["en-US"]!.answer,
}));
assert.ok(sampleItems.length >= 6, "home FAQ grew with buyer prompts");

const html = renderToStaticMarkup(
  createElement(PageFaqSectionView, {
    title: home!.titles["en-US"]!,
    items: sampleItems,
    locale: "en-US",
  })
);
assert.match(html, /data-page-faq/);
assert.match(html, /"@type":"FAQPage"/);
assert.match(html, /"@type":"Question"/);
assert.match(html, /What is Mpillow\?/);
assert.match(html, /cervical and an ergonomic/);
assert.match(html, /tech neck strain/);
assert.doesNotMatch(html, /Storefront product/i);

console.log("marketing-copy-slice-06.check.ts: ok");
console.log("home FAQ items:", sampleItems.length);
