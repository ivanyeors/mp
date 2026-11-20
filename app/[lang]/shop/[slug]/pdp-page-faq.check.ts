import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { PageFaqSection, PageFaqSectionView } from "@/components/page-faq/page-faq-section";
import { getProductBySlug } from "@/lib/ecommerce/products";
import { getPageFaq, productSurfaceKey } from "@/lib/page-faq";

const ROOT = process.cwd();

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const pageSrc = read("app/[lang]/shop/[slug]/page.tsx");
assert.match(pageSrc, /PageFaqSectionView|PageFaqSection/);
assert.match(pageSrc, /productSurfaceKey\(product\.id\)/);
assert.match(pageSrc, /pageFaq=/);
assert.match(pageSrc, /resolveAnswerLede/);
assert.match(pageSrc, /withJsonLd=\{false\}/);

const clientSrc = read("app/[lang]/shop/[slug]/product-detail-client.tsx");
assert.match(clientSrc, /pageFaq\?:/);
assert.match(clientSrc, /\{pageFaq\}/);
const belowFold = clientSrc.match(/<Tabs ref=\{detailTabsRef\}[\s\S]*?\{relatedProducts/)?.[0] ?? "";
assert.match(belowFold, /<\/Tabs>/);
assert.match(belowFold, /\{pageFaq\}/);
assert.ok(
  belowFold.indexOf("</Tabs>") < belowFold.indexOf("{pageFaq}"),
  "pageFaq after description tabs"
);

const layoutSrc = read("app/[lang]/shop/[slug]/layout.tsx");
assert.match(layoutSrc, /buildProductJsonLd/);
assert.match(layoutSrc, /buildFaqPageJsonLd/);
assert.match(layoutSrc, /JsonLdScript/);
assert.match(layoutSrc, /productSurfaceKey/);

assert.equal(PageFaqSectionView({ title: "FAQs", items: [], locale: "en-US" }), null);

async function main() {
  const product = await getProductBySlug("mpillow-basic");
  assert.ok(product?.id, "seeded mpillow-basic product");
  const surfaceKey = productSurfaceKey(product!.id);

  const set = await getPageFaq(surfaceKey, "en-US");
  assert.ok(set && set.items.length >= 1, "seeded product Page FAQ non-empty");

  const section = await PageFaqSection({ surfaceKey, locale: "en-US" });
  assert.ok(section, "PDP with visible FAQs renders section");
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
  const zhSection = await PageFaqSection({ surfaceKey, locale: "zh-CN" });
  const zhHtml = renderToStaticMarkup(zhSection!);
  assert.match(
    zhHtml,
    new RegExp(zh!.items[0]!.question.replace(/[?*+^${}()|[\]\\]/g, "\\$&"))
  );
  assert.doesNotMatch(
    zhHtml,
    new RegExp(set!.items[0]!.question.replace(/[?*+^${}()|[\]\\]/g, "\\$&"))
  );

  const emptyKey = productSurfaceKey("00000000-0000-4000-8000-000000000000");
  const empty = await PageFaqSection({ surfaceKey: emptyKey, locale: "en-US" });
  assert.equal(empty, null);

  const other = await getProductBySlug("mpillow-premium");
  if (other?.id) {
    const premium = await getPageFaq(productSurfaceKey(other.id), "en-US");
    assert.ok(premium && premium.items.length >= 1, "seeded premium also has FAQs");
  }

  console.log("pdp-page-faq self-check ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
