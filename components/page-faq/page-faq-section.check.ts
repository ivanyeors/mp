import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PageFaqSectionView } from "@/components/page-faq/page-faq-section";
import { getPageFaq } from "@/lib/page-faq";
import { PAGE_FAQ_DEFAULTS } from "@/lib/page-faq/defaults";

const homeEn = PAGE_FAQ_DEFAULTS.find((d) => d.surfaceKey === "home");
assert.ok(homeEn, "home defaults");

const sampleItems = homeEn.items.map((item, i) => ({
  id: `id-${i}`,
  slug: item.slug,
  question: item.content["en-US"]!.question,
  answer: item.content["en-US"]!.answer,
}));

assert.equal(
  PageFaqSectionView({ title: "FAQs", items: [], locale: "en-US" }),
  null
);

const html = renderToStaticMarkup(
  createElement(PageFaqSectionView, {
    title: "Frequently asked questions",
    items: sampleItems,
    locale: "en-US",
  })
);

assert.match(html, /max-w-6xl/);
assert.match(html, /Frequently asked questions/);
assert.match(html, /data-page-faq/);
assert.match(html, /text-muted-foreground/);

assert.match(html, /"@type":"FAQPage"/);
assert.match(html, /"@type":"Question"/);
assert.match(html, /"@type":"Answer"/);
assert.match(html, /What is Mpillow\?/);
assert.match(html, /modular custom pillow system/);
assert.doesNotMatch(html, /Storefront product/i);
assert.doesNotMatch(html, /application\/ld\+json[^>]*>[\s\S]*\*\*Storefront/);

assert.match(html, /Start online via/);
assert.match(html, /mp-config/);
assert.match(html, /cervical and an ergonomic/);
assert.match(html, /tech neck strain/);

assert.match(html, /href="\/en-US\/faq"/);
assert.match(html, /View all FAQs/);

const zhItems = homeEn.items.map((item, i) => ({
  id: `id-${i}`,
  slug: item.slug,
  question: item.content["zh-CN"]!.question,
  answer: item.content["zh-CN"]!.answer,
}));
const zhHtml = renderToStaticMarkup(
  createElement(PageFaqSectionView, {
    title: "常见问题",
    items: zhItems,
    locale: "zh-CN",
  })
);
assert.match(zhHtml, /什么是 Mpillow？/);
assert.match(zhHtml, /查看全部常见问题/);
assert.match(zhHtml, /href="\/zh-CN\/faq"/);
assert.doesNotMatch(zhHtml, /What is Mpillow\?/);

async function main() {
  const live = await getPageFaq("home", "en-US");
  assert.ok(live && live.items.length >= 3, "seeded home Page FAQ");
  const liveHtml = renderToStaticMarkup(
    createElement(PageFaqSectionView, {
      title: live!.title,
      items: live!.items,
      locale: "en-US",
    })
  );
  assert.match(liveHtml, /"@type":"FAQPage"/);
  assert.match(liveHtml, new RegExp(live!.items[0]!.question.replace(/[?*]/g, "\\$&")));

  const liveZh = await getPageFaq("home", "zh-CN");
  assert.ok(liveZh?.items[0]?.question.includes("Mpillow"));
  assert.notEqual(liveZh!.items[0]!.question, live!.items[0]!.question);

  const missing = await getPageFaq("product:00000000-0000-4000-8000-000000000000", "en-US");
  assert.equal(missing, null);

  console.log("page-faq-section self-check ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
