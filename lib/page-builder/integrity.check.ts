/**
 * Slice 02 self-check: page-builder write/read path integrity.
 * Run: npx tsx --env-file=.env.local lib/page-builder/integrity.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ALLOWED_IMAGE_HOSTS,
  CUSTOM_SECTION_TYPES,
  CreatableSectionTypeSchema,
  SECTION_TYPES,
  SectionContentSchema,
  isAllowedImageUrl,
  isCustomSectionType,
  isSingletonSectionType,
} from "@/lib/page-builder/validation";
import { CUSTOM_SECTION_TEMPLATES } from "@/lib/types/landing-sections";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// --- Section types are a closed set, and only custom types are creatable ---
assert.ok(SECTION_TYPES.includes("hero"), "hero is a known type");
assert.equal(CreatableSectionTypeSchema.safeParse("hero").success, false, "hero cannot be POSTed");
assert.equal(CreatableSectionTypeSchema.safeParse("shop_cta").success, true, "custom types can be POSTed");
assert.equal(CreatableSectionTypeSchema.safeParse("nonsense_type").success, false, "typos rejected");
assert.equal(CreatableSectionTypeSchema.safeParse("").success, false, "empty type rejected");

// Every template the Add dialog offers must actually be creatable, or it is a dead entry.
for (const tmpl of CUSTOM_SECTION_TEMPLATES) {
  assert.ok(
    CreatableSectionTypeSchema.safeParse(tmpl.type).success,
    `add-dialog template "${tmpl.type}" is creatable`,
  );
}
assert.equal(CUSTOM_SECTION_TEMPLATES.length, CUSTOM_SECTION_TYPES.length, "template list matches custom types");

// --- Custom vs built-in drives slug locking and deletion ---
assert.equal(isCustomSectionType("custom_rich_text"), true);
assert.equal(isCustomSectionType("hero"), false);
assert.equal(isCustomSectionType("text_image"), false, "text_image is built-in despite being generic");

// --- Singletons: faq duplicates would emit a second FAQPage block ---
assert.equal(isSingletonSectionType("faq"), true);
assert.equal(isSingletonSectionType("hero"), true);
assert.equal(isSingletonSectionType("text_image"), false, "the seed ships two text_image sections");
assert.equal(isSingletonSectionType("custom_text_image"), false, "custom sections may repeat");

// --- Image URLs: the field that can 500 the homepage ---
assert.equal(isAllowedImageUrl(""), true, "cleared field falls back to the site_settings slot");
assert.equal(isAllowedImageUrl("/images/hero.webp"), true, "repo-relative path allowed");
assert.equal(isAllowedImageUrl(`https://${ALLOWED_IMAGE_HOSTS[0]}/storage/v1/object/public/media/a.webp`), true);
assert.equal(isAllowedImageUrl("https://evil.example.com/a.png"), false, "non-allowlisted host rejected");
assert.equal(isAllowedImageUrl("http://" + ALLOWED_IMAGE_HOSTS[0] + "/a.png"), false, "http rejected");
assert.equal(isAllowedImageUrl("//evil.example.com/a.png"), false, "protocol-relative rejected");
assert.equal(isAllowedImageUrl("not a url"), false, "garbage rejected");

assert.equal(SectionContentSchema.safeParse({ title: "hi" }).success, true, "content without an image passes");
assert.equal(SectionContentSchema.safeParse({ image: "/ok.webp" }).success, true);
const badImage = SectionContentSchema.safeParse({ image: "https://evil.example.com/a.png" });
assert.equal(badImage.success, false, "bad image host rejected at write time");
assert.match(
  badImage.success ? "" : badImage.error.issues[0].message,
  /media library/,
  "rejection tells the operator what to do instead",
);
assert.equal(SectionContentSchema.safeParse({ image: 42 }).success, false, "non-string image rejected");

// --- Routes: guards, audit, and the built-in protections ---
const listRoute = read("app/api/landing-sections/route.ts");
assert.match(listRoute, /export async function GET[\s\S]{0,200}requireAdmin\("page-builder"\)/, "GET is staff-only");
assert.match(listRoute, /CreatableSectionTypeSchema/, "POST validates the type union");
assert.match(listRoute, /isSingletonSectionType/, "POST enforces singletons");
assert.match(listRoute, /landing_section\.create/, "create is audited");

const idRoute = read("app/api/landing-sections/[id]/route.ts");
assert.match(idRoute, /isCustomSectionType\(before\.section_type\)/, "slug lock and delete lock consult the type");
assert.match(idRoute, /landing_section\.update/, "update is audited");
// Slice 05 turned delete into a draft mark, so the audited action was renamed.
assert.match(idRoute, /landing_section\.(delete|mark_deleted)/, "delete is audited");
assert.match(idRoute, /built-in section and cannot be deleted/, "built-ins cannot be deleted");
assert.match(idRoute, /SectionContentSchema/, "PATCH validates content");

const reorder = read("app/api/landing-sections/reorder/route.ts");
const reorderCode = reorder.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
assert.doesNotMatch(reorderCode, /Promise\.all/, "reorder is no longer N unsequenced updates");
assert.match(reorder, /upsert\(/, "reorder applies the order in one statement");
assert.match(reorder, /every section exactly once/, "reorder rejects a partial order");
assert.match(reorder, /landing_section\.reorder/, "reorder is audited");

// --- Store: the seed layout is an empty-table fallback, not an all-hidden one ---
const store = read("lib/landing-sections.ts");
assert.doesNotMatch(store, /getAllLandingSections/, "the unused helper is gone");
assert.match(store, /if \(rows\.length === 0\) return DEFAULT_SECTIONS;/, "seed only when the table is empty");
assert.match(store, /rows\.filter\(\(section\) => section\.visible\)/, "visibility filtered after the empty check");
assert.doesNotMatch(store, /data\?\.length \? data : DEFAULT_SECTIONS/, "the old all-hidden bug is gone");

// --- Rich text renders markdown, not raw HTML ---
const richText = read("components/sections/landing/custom-rich-text-section.tsx");
assert.match(richText, /react-markdown/, "rich text uses react-markdown");
assert.doesNotMatch(
  richText.replace(/\/\*\*[\s\S]*?\*\//g, ""),
  /dangerouslySetInnerHTML/,
  "no dangerouslySetInnerHTML outside comments",
);
const editor = read("components/settings/page-builder/section-editor.tsx");
assert.match(editor, /Body \(Markdown\)/, "editor label matches the renderer");
assert.doesNotMatch(editor, /Body \(HTML\)/, "the misleading HTML label is gone");

console.log("landing-integrity self-check ok");
