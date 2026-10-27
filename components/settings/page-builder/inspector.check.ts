/**
 * Slice 09 self-check: inspector completeness and builder accessibility.
 * Run: npx tsx --env-file=.env.local components/settings/page-builder/inspector.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const readCode = (rel: string) =>
  read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const editor = read("components/settings/page-builder/section-editor.tsx");
const editorCode = readCode("components/settings/page-builder/section-editor.tsx");
const tree = read("components/settings/page-builder/section-tree.tsx");

// --- Card sections are editable at all ---
assert.match(editorCode, /Add card/, "cards can be added");
assert.match(editorCode, /Remove card \$\{idx \+ 1\}/, "cards can be removed");
assert.match(editorCode, /Move card \$\{idx \+ 1\} up/, "cards can be reordered");
assert.match(editorCode, /SeedCardsPrompt/, "starting an override seeds from the defaults");
assert.match(editorCode, /getMessages\(locale\)\.home\.whyChoose\.cards/, "why-choose seeds from i18n");
assert.match(editorCode, /getMessages\(locale\)\.home\.credibility\.cards/, "credibility seeds from i18n");
assert.doesNotMatch(
  editorCode,
  /Using default cards from i18n\. Edit to override\./,
  "the dead-end message is gone — there was no way to start overriding",
);

// --- Alt text survives the picker and reaches the page ---
assert.match(editorCode, /onSelect=\{\(s\) => onChange\(s\.url, s\.assetId, s\.alt\)\}/, "the picker's alt text is carried");
assert.match(editorCode, /Image alt text/, "alt text is editable");
for (const file of [
  "components/sections/landing/text-image-section.tsx",
  "components/sections/landing/custom-text-image-section.tsx",
]) {
  assert.match(readCode(file), /const alt = c\.alt \?\? title;/, `${file} uses stored alt text`);
  assert.match(readCode(file), /alt=\{alt\}/, `${file} renders it`);
}

// --- Typing a URL must not downgrade a tracked Media Asset ---
assert.match(editorCode, /if \(assetId !== undefined\) \{\s*next\.media_asset_id = assetId;/, "the picker sets the asset id");
assert.doesNotMatch(editorCode, /onChange\(e\.target\.value, null\)/, "typing no longer nulls the asset id");

// --- Fields the component already reads but had no input ---
assert.match(editorCode, /ctaCustomiseLabel/, "hero customise CTA is editable");
assert.match(editorCode, /ctaBookLabel/, "hero book CTA is editable");

// --- Destructive actions confirm, and unsaved edits are not lost silently ---
assert.match(editorCode, /Reset this section to its defaults\?/, "reset confirms");
assert.match(editorCode, /<Dialog/, "reset uses the design system dialog");
assert.match(editorCode, /beforeunload/, "navigating away with unsaved edits warns");
assert.match(editorCode, /const dirty = /, "dirtiness is tracked");
assert.match(editorCode, /disabled=\{!dirty\}/, "save reflects whether there is anything to save");
assert.match(editorCode, /Discard your unsaved edits/, "cancelling with unsaved edits warns");

// --- Accessibility of the builder's own controls (slice 07 + 09) ---
assert.match(tree, /aria-pressed=\{section\.visible\}/, "visibility toggle announces state");
assert.match(tree, /Move \$\{title\} up/, "keyboard reorder exists");
assert.match(tree, /aria-label=\{`Drag \$\{title\} to reorder`\}/, "drag handle is named");
assert.match(editorCode, /aria-pressed=\{locale === code\}/, "the language switch announces state");
assert.match(editorCode, /aria-label="Editing language"/, "the language group is named");

// --- No unoptimised masters left in the landing sections ---
const sectionFiles = readdirSync(join(ROOT, "components/sections/landing")).filter((f) => f.endsWith(".tsx"));
for (const file of sectionFiles) {
  assert.doesNotMatch(
    readCode(join("components/sections/landing", file)),
    /<img\s/,
    `${file} uses next/image, not a raw img`,
  );
}

console.log("page-builder-inspector self-check ok");

// --- Adversarial-review regressions (slice 09) ---

// `dirty` compared a local object against a jsonb round-trip, which reorders keys —
// adding a shorter key (like `alt`) left the editor permanently dirty after a save.
assert.match(editorCode, /stableStringify\(content\)/, "dirtiness uses a key-order-independent compare");
assert.doesNotMatch(
  editorCode,
  /JSON\.stringify\(content\) !== JSON\.stringify/,
  "the literal stringify compare is gone",
);

// beforeunload cannot cover in-app navigation, so selection changes are guarded too.
const shell = readCode("app/[lang]/settings/page-builder/page-builder-client.tsx");
assert.match(editorCode, /onDirtyChange\?\.\(dirty\)/, "the editor lifts its dirty state");
assert.match(shell, /const selectSection = useCallback/, "the shell guards selection changes");
assert.match(shell, /inspectorDirty\.current &&/, "selection asks before discarding edits");
assert.doesNotMatch(shell, /onSelect=\{setSelectedSlug\}/, "no selection path bypasses the guard");

// Every alt field the inspector offers must actually reach the page.
for (const [file, fallback] of [
  ["components/sections/landing/hero-section.tsx", "Mpillow cervical pillow on a bed"],
  ["components/sections/landing/neck-pains-section.tsx", "Mpillow cervical neck support"],
] as const) {
  const src = readCode(file);
  assert.match(src, /c\.alt \?\?/, `${file} uses the stored alt text`);
  assert.doesNotMatch(
    src,
    new RegExp(`alt="${fallback}"`),
    `${file} no longer hardcodes its alt, which made the editor field a dead control`,
  );
}
assert.match(read("lib/types/landing-sections.ts"), /export interface NeckPainsContent \{\n  image\?: string;\n  alt\?: string;/);

// Typing a different URL must release the Media Asset id, or the DAM marks the wrong
// asset as Used — the inverse of the bug the guard was added for.
assert.match(editorCode, /} else if \(url !== prev\.image\) \{/, "a typed URL releases a stale asset id");
// The library's alt text is English copy regardless of the language being edited.
assert.match(editorCode, /writeLocalisedValue\(prev\.alt, DEFAULT_LOCALE, alt\)/, "picker alt lands in en-US");

// Keyless cards all shared a React key, so added cards collided.
assert.match(readCode("components/sections/landing/why-choose-section.tsx"), /key: card\.key,/);

// "Editor completeness" means paragraphs get the same controls as cards.
assert.match(editorCode, /Remove paragraph \$\{idx \+ 1\}/, "paragraphs can be removed");
assert.match(editorCode, /Move paragraph \$\{idx \+ 1\} up/, "paragraphs can be reordered");

console.log("page-builder-inspector regression checks ok");
