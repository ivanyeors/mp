import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isAdminJourneyPath } from "@/lib/analytics/journey/paths";
import { isMarketingRoute } from "@/lib/routing/is-marketing-route";
import { PAGE_BUILDER_PREVIEW_PATH, isPageBuilderPreviewRoute } from "@/lib/routing/preview-route";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const readCode = (rel: string) =>
  read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

assert.equal(isPageBuilderPreviewRoute(PAGE_BUILDER_PREVIEW_PATH), true);
assert.equal(isPageBuilderPreviewRoute("/"), false);
assert.equal(isPageBuilderPreviewRoute("/page-builder-preview/anything"), true);
assert.equal(isPageBuilderPreviewRoute("/page-builder-previewer"), false, "prefix match is exact");

assert.equal(
  isAdminJourneyPath(PAGE_BUILDER_PREVIEW_PATH),
  true,
  "journey analytics excludes Preview mode — otherwise editing pollutes the landing funnel",
);
assert.equal(isAdminJourneyPath("/en-US" + PAGE_BUILDER_PREVIEW_PATH), true, "locale-prefixed too");
assert.equal(isAdminJourneyPath("/"), false, "the real landing page is still tracked");

assert.equal(isMarketingRoute(PAGE_BUILDER_PREVIEW_PATH), false, "header/footer suppressed");
assert.equal(isMarketingRoute("/"), true, "the real landing page keeps its chrome");

const dock = readCode("components/ui/app-dock.tsx");
assert.match(dock, /isPageBuilderPreviewRoute\(basePathname\)/, "the fixed dock is hidden in preview");
const overlay = readCode("components/slide-in-pages/book-appointment-overlay.tsx");
assert.match(overlay, /isPageBuilderPreviewRoute/, "the booking overlay is hidden in preview");

const list = read("components/sections/landing/landing-sections-list.tsx");
assert.match(list, /data-section=\{section\.slug\}/, "section anchors are preserved");
assert.match(list, /id=\{section\.slug\}/, "the slug anchor is preserved for deep links");
assert.match(list, /data-preview-hidden/, "hidden sections are marked in preview, not omitted");

const publicPage = readCode("app/[lang]/page.tsx");
assert.match(publicPage, /LandingSectionsList/, "the public route uses the shared list");
assert.doesNotMatch(publicPage, /sections\.map\(/, "the public route no longer inlines the section markup");

const previewPage = readCode("app/[lang]/page-builder-preview/page.tsx");
assert.match(previewPage, /LandingSectionsList/, "preview uses the same shared list");
assert.match(previewPage, /requireAdminPage\("page-builder"/, "preview requires an admin session");
assert.match(previewPage, /draftSections\(rows\)/, "preview renders the draft");
assert.match(previewPage, /preview$/m, "preview passes the preview flag");
assert.match(read("app/[lang]/page-builder-preview/page.tsx"), /index: false/, "preview is not indexable");
assert.doesNotMatch(previewPage, /draftMode/, "Next draft mode is not used");

const data = readCode("lib/landing-page-data.ts");
assert.match(data, /export async function loadLandingPageData/, "the data loader is shared");
assert.match(publicPage, /loadLandingPageData\(\)/, "public route uses it");
assert.match(previewPage, /loadLandingPageData\(\)/, "preview uses it");

const stories = readCode("components/sections/stories-section.tsx");
assert.match(stories, /if \(!preview\)/, "preview skips the Places call");
assert.match(stories, /FALLBACK_TESTIMONIALS/, "preview still renders testimonials");

for (const [file, id] of [
  ["components/sections/landing/text-image-section.tsx", "ambassadors"],
  ["components/sections/landing/video-section.tsx", "review"],
  ["components/sections/landing/stories-section-wrapper.tsx", "stories"],
  ["components/sections/landing/neck-pains-section.tsx", "why"],
  ["components/sections/landing/pick-mpillow-section.tsx", "pick"],
] as const) {
  assert.doesNotMatch(
    readCode(file),
    new RegExp(`id="${id}"`),
    `${file} no longer emits its own #${id} — the wrapper owns the anchor`,
  );
}

console.log("landing-preview self-check ok");
