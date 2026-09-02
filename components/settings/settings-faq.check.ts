/**
 * Slice 04 self-check: Settings FAQ admin APIs + chrome + store mutations.
 * Run: npx tsx --env-file=.env.local components/settings/settings-faq.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PageFaqsEmptyState } from "@/components/settings/page-faqs-panel";
import { roleHasPermission } from "@/lib/auth/permissions";
import {
  createPageFaqItem,
  deletePageFaqItem,
  ensurePageFaqSet,
  getPageFaq,
  getPageFaqSetAdmin,
  pageFaqPreviewPath,
  productSurfaceKey,
  reorderPageFaqItems,
  updatePageFaqItem,
} from "@/lib/page-faq";

const ROOT = process.cwd();

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

// --- Preview paths ---
assert.equal(pageFaqPreviewPath("home"), "/");
assert.equal(pageFaqPreviewPath("mp-config"), "/mp-config");
assert.equal(pageFaqPreviewPath("mbolster-config"), "/mbolster-config");
assert.equal(pageFaqPreviewPath("product:84c85b30-c6ee-40fc-9cbe-1a5e66dc6c99"), null);
assert.equal(
  pageFaqPreviewPath("product:84c85b30-c6ee-40fc-9cbe-1a5e66dc6c99", "mpillow-basic"),
  "/shop/mpillow-basic"
);
assert.equal(pageFaqPreviewPath("nope"), null);

// --- Empty state chrome ---
const emptyHtml = renderToStaticMarkup(
  createElement(PageFaqsEmptyState, { surfaceKey: "home" })
);
assert.match(emptyHtml, /data-page-faq-empty/);
assert.match(emptyHtml, /No questions on this surface/);
assert.match(emptyHtml, /home/);

// --- Settings page has Global | Page FAQs tabs; Global chrome preserved ---
const settingsFaqPage = read("app/[lang]/settings/faq/faq-client.tsx");
assert.match(settingsFaqPage, /Global FAQ/);
assert.match(settingsFaqPage, /Page FAQs/);
assert.match(settingsFaqPage, /data-settings-faq-tabs/);
assert.match(settingsFaqPage, /PageFaqsPanel/);
assert.match(settingsFaqPage, /Categories/);
assert.match(settingsFaqPage, /\/api\/faq\/categories/);
assert.match(settingsFaqPage, /\/api\/faq\/items/);

// --- Page FAQs panel: surface picker + preview + bilingual fields ---
const panel = read("components/settings/page-faqs-panel.tsx");
assert.match(panel, /FIXED_SURFACE_OPTIONS/);
assert.match(panel, /data-page-faq-product-picker/);
assert.match(panel, /data-page-faq-preview/);
assert.match(panel, /en-US/);
assert.match(panel, /zh-CN/);
assert.match(panel, /productSurfaceKey/);
assert.match(panel, /\/api\/page-faq\/items\/reorder/);

// --- Admin APIs: same page-builder gate as Global FAQ (public cannot mutate) ---
const apiFiles = [
  "app/api/page-faq/sets/route.ts",
  "app/api/page-faq/sets/[id]/route.ts",
  "app/api/page-faq/items/route.ts",
  "app/api/page-faq/items/[id]/route.ts",
  "app/api/page-faq/items/reorder/route.ts",
];
for (const file of apiFiles) {
  const src = read(file);
  assert.match(src, /requireAdmin\("page-builder"\)/, `${file} must gate page-builder`);
}
assert.equal(roleHasPermission("owner", "page-builder"), true);
assert.equal(roleHasPermission("viewer", "page-builder"), false);

async function main() {
  // --- Product surface ensure + CRUD roundtrip (throwaway surface) ---
  const testKey = productSurfaceKey("00000000-0000-4000-8000-000000000099");
  const setRow = await ensurePageFaqSet(testKey, {
    "en-US": "Slice 04 test",
    "zh-CN": "切片04测试",
  });
  assert.ok(setRow, "ensure product set");
  assert.equal(setRow!.surface_key, testKey);

  // Clean any leftover items from prior runs
  const existing = await getPageFaqSetAdmin(testKey);
  for (const item of existing?.items ?? []) {
    await deletePageFaqItem(item.id);
  }

  const a = await createPageFaqItem({
    setId: setRow!.id,
    slug: `slice04-a-${Date.now()}`,
    content: {
      "en-US": { question: "Slice04 A?", answer: "Answer A" },
      "zh-CN": { question: "切片A？", answer: "答案A" },
    },
    position: 0,
  });
  const b = await createPageFaqItem({
    setId: setRow!.id,
    slug: `slice04-b-${Date.now()}`,
    content: {
      "en-US": { question: "Slice04 B?", answer: "Answer B" },
      "zh-CN": { question: "切片B？", answer: "答案B" },
    },
    position: 1,
  });
  assert.ok(a && b, "create items");

  // Reorder B before A
  assert.equal(await reorderPageFaqItems(setRow!.id, [b!.id, a!.id]), true);
  let adminSet = await getPageFaqSetAdmin(testKey);
  assert.deepEqual(
    adminSet!.items.map((i) => i.id),
    [b!.id, a!.id]
  );

  // Toggle visibility — hidden item dropped from public getPageFaq
  await updatePageFaqItem(a!.id, { visible: false });
  const publicSet = await getPageFaq(testKey, "en-US");
  assert.ok(publicSet);
  assert.equal(publicSet!.items.length, 1);
  assert.equal(publicSet!.items[0].id, b!.id);
  assert.equal(publicSet!.items[0].question, "Slice04 B?");

  // Bilingual edit reflects in store reads (slice 03+)
  await updatePageFaqItem(b!.id, {
    content: {
      "en-US": { question: "Slice04 B edited?", answer: "Answer B edited" },
      "zh-CN": { question: "切片B已改？", answer: "答案B已改" },
    },
  });
  const zh = await getPageFaq(testKey, "zh-CN");
  assert.equal(zh!.items[0].question, "切片B已改？");

  // Delete
  assert.equal(await deletePageFaqItem(a!.id), true);
  assert.equal(await deletePageFaqItem(b!.id), true);
  adminSet = await getPageFaqSetAdmin(testKey);
  assert.equal(adminSet!.items.length, 0);
  const emptyPublic = await getPageFaq(testKey, "en-US");
  // set may remain; public embed hides when items empty (slice 03)
  assert.ok(!emptyPublic || emptyPublic.items.length === 0);

  // Global home still readable (no regression from Page FAQ work)
  const home = await getPageFaq("home", "en-US");
  assert.ok(home && home.items.length >= 3, "home Page FAQ still seeded");

  console.log("settings-faq self-check ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
