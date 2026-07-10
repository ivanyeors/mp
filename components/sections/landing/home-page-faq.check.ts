/**
 * Slice 05 self-check: home page-builder `faq` section → `home` surface.
 * Run: npx tsx --env-file=.env.local components/sections/landing/home-page-faq.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { PageFaqSection, PageFaqSectionView } from "@/components/page-faq/page-faq-section";
import { getLandingSections } from "@/lib/landing-sections";
import { getPageFaq } from "@/lib/page-faq";
import { supabaseAdmin } from "@/lib/supabase/server";
import { CUSTOM_SECTION_TEMPLATES } from "@/lib/types/landing-sections";

const ROOT = process.cwd();
const SLUG = `slice05-faq-check-${Date.now()}`;

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

// --- Builder: faq is addable, placement-only (no Q&A in section JSON) ---
const faqTmpl = CUSTOM_SECTION_TEMPLATES.find((t) => t.type === "faq");
assert.ok(faqTmpl, "faq in CUSTOM_SECTION_TEMPLATES");
assert.match(faqTmpl.description, /Settings/);

const typesSrc = read("lib/types/landing-sections.ts");
assert.match(typesSrc, /\| "faq"/);
assert.match(typesSrc, /FaqContent/);

const picker = read("app/[lang]/settings/page-builder/page.tsx");
assert.match(picker, /faq:\s*"Page FAQs"/);
assert.match(picker, /CUSTOM_SECTION_TEMPLATES/);

const editor = read("components/settings/page-builder/section-editor.tsx");
assert.match(editor, /case "faq"/);
assert.match(editor, /data-page-builder-faq-hint/);
assert.match(editor, /Page FAQs/);
const faqCase = editor.match(/case "faq":\s*return \([\s\S]*?\);/)?.[0] ?? "";
assert.match(faqCase, /data-page-builder-faq-hint/);
assert.doesNotMatch(faqCase, /<Input|<Textarea|set\("question|set\("answer/);

const renderer = read("components/sections/landing/landing-section.tsx");
assert.match(renderer, /case "faq"/);
assert.match(renderer, /PageFaqSection/);
assert.match(renderer, /surfaceKey="home"/);
const faqRender = renderer.match(/case "faq":[\s\S]*?(?=case "|default:)/)?.[0] ?? "";
assert.doesNotMatch(faqRender, /section\.content/);

// --- Empty set → no public FAQ chrome ---
assert.equal(PageFaqSectionView({ title: "FAQs", items: [], locale: "en-US" }), null);

async function main() {
  const admin = supabaseAdmin();

  // Create throwaway faq section (add)
  const { data: maxRow } = await admin
    .from("landing_sections")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (maxRow?.position ?? -1) + 1;

  const { data: created, error: createErr } = await admin
    .from("landing_sections")
    .insert({
      section_type: "faq",
      slug: SLUG,
      position,
      visible: true,
      content: {}, // Q&A not duplicated here
    })
    .select()
    .single();
  assert.ifError(createErr);
  assert.ok(created?.id);
  const id = created.id as string;

  try {
    // Visible faq section appears in public landing fetch
    const visible = await getLandingSections();
    assert.ok(
      visible.some((s) => s.id === id && s.section_type === "faq"),
      "visible faq section in getLandingSections"
    );
    assert.deepEqual(
      visible.find((s) => s.id === id)!.content,
      {},
      "section content stays empty (copy in Page FAQ store)"
    );

    // Hide
    const { error: hideErr } = await admin
      .from("landing_sections")
      .update({ visible: false, updated_at: new Date().toISOString() })
      .eq("id", id);
    assert.ifError(hideErr);
    const afterHide = await getLandingSections();
    assert.ok(!afterHide.some((s) => s.id === id), "hidden faq omitted from public sections");

    // Show again + reorder
    const newPos = Math.max(0, position - 1);
    const { error: showErr } = await admin
      .from("landing_sections")
      .update({ visible: true, position: newPos, updated_at: new Date().toISOString() })
      .eq("id", id);
    assert.ifError(showErr);
    const { data: reordered } = await admin
      .from("landing_sections")
      .select("position,visible")
      .eq("id", id)
      .single();
    assert.equal(reordered?.visible, true);
    assert.equal(reordered?.position, newPos, "faq section reordered");

    // Homepage path: faq section → PageFaqSection(home) → accordion + FAQPage JSON-LD
    const home = await getPageFaq("home", "en-US");
    assert.ok(home && home.items.length >= 1, "home Page FAQ set non-empty");

    const fromSection = await PageFaqSection({ surfaceKey: "home", locale: "en-US" });
    assert.ok(fromSection, "PageFaqSection renders when home has items");
    const html = renderToStaticMarkup(fromSection);
    assert.match(html, /data-page-faq/);
    assert.match(html, /"@type":"FAQPage"/);
    assert.match(html, /"@type":"Question"/);
    assert.match(html, new RegExp(home.items[0]!.question.replace(/[?*+^${}()|[\]\\]/g, "\\$&")));

    // Empty product surface still hides (section may exist but store empty → null)
    const empty = await PageFaqSection({
      surfaceKey: "product:00000000-0000-4000-8000-000000000000",
      locale: "en-US",
    });
    assert.equal(empty, null);
  } finally {
    await admin.from("landing_sections").delete().eq("id", id);
  }

  console.log("home-page-faq self-check ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
