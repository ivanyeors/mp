/**
 * Slice 07 self-check: Page FAQ on mp-config / mbolster-config shells.
 * Run: npx tsx --env-file=.env.local app/[lang]/mp-config/configurator-page-faq.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PageFaqSection, PageFaqSectionView } from "@/components/page-faq/page-faq-section";
import { ConfiguratorSeoIntro } from "@/components/seo/configurator-seo-intro";
import { getPageFaq } from "@/lib/page-faq";

const ROOT = process.cwd();

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function assertConfiguratorWiring(rel: string, surfaceKey: "mp-config" | "mbolster-config") {
  const src = read(rel);
  assert.match(src, /ConfiguratorSeoIntro/);
  assert.match(src, /PageFaqSection/);
  assert.match(src, new RegExp(`surfaceKey="${surfaceKey}"`));
  assert.match(src, /buildConfiguratorProductJsonLd/);
  // Order: SEO intro → Page FAQ → client wizard
  const introAt = src.indexOf("<ConfiguratorSeoIntro");
  const faqAt = src.indexOf("<PageFaqSection");
  const clientAt = Math.max(src.indexOf("<MpConfigClient"), src.indexOf("<MbolsterConfigClient"));
  assert.ok(introAt >= 0 && faqAt > introAt && clientAt > faqAt, `${surfaceKey} FAQ between intro and wizard`);
}

assertConfiguratorWiring("app/[lang]/mp-config/page.tsx", "mp-config");
assertConfiguratorWiring("app/[lang]/mbolster-config/page.tsx", "mbolster-config");

// Empty set → no FAQ chrome
assert.equal(PageFaqSectionView({ title: "FAQs", items: [], locale: "en-US" }), null);

// ConfiguratorSeoIntro still emits H1 + answer lede + Product JSON-LD (unchanged behavior)
const introHtml = renderToStaticMarkup(
  createElement(ConfiguratorSeoIntro, {
    h1: "Customise Your Mpillow Pillow",
    answerLede: "Sized and fitted for your neck.",
    jsonLd: { "@type": "Product", name: "Mpillow Custom Pillow" },
  })
);
assert.match(introHtml, /Customise Your Mpillow Pillow/);
assert.match(introHtml, /Sized and fitted for your neck/);
assert.match(introHtml, /"@type":"Product"/);

async function assertSurface(surfaceKey: "mp-config" | "mbolster-config") {
  const set = await getPageFaq(surfaceKey, "en-US");
  assert.ok(set && set.items.length >= 1, `${surfaceKey} Page FAQ non-empty`);

  const section = await PageFaqSection({ surfaceKey, locale: "en-US" });
  assert.ok(section, `${surfaceKey} renders when non-empty`);
  const html = renderToStaticMarkup(section);
  assert.match(html, /data-page-faq/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /"@type":"Question"/);
  assert.match(
    html,
    new RegExp(set!.items[0]!.question.replace(/[?*+^${}()|[\]\\]/g, "\\$&"))
  );

  const zh = await getPageFaq(surfaceKey, "zh-CN");
  assert.ok(zh?.items[0]?.question);
  assert.notEqual(zh!.items[0]!.question, set!.items[0]!.question);
}

async function main() {
  await assertSurface("mp-config");
  await assertSurface("mbolster-config");

  // Empty surface still hides
  const empty = await PageFaqSection({
    surfaceKey: "product:00000000-0000-4000-8000-000000000000",
    locale: "en-US",
  });
  assert.equal(empty, null);

  console.log("configurator-page-faq self-check ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
