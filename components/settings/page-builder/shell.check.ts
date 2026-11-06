/**
 * Slice 07 self-check: three-pane shell, preview selection, device and theme controls.
 * Run: npx tsx --env-file=.env.local components/settings/page-builder/shell.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const readCode = (rel: string) =>
  read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const shell = read("app/[lang]/settings/page-builder/page-builder-client.tsx");
const shellCode = readCode("app/[lang]/settings/page-builder/page-builder-client.tsx");
const frame = read("components/settings/page-builder/preview-frame.tsx");
const frameCode = readCode("components/settings/page-builder/preview-frame.tsx");
const tree = read("components/settings/page-builder/section-tree.tsx");

// --- Three panes, with the tree and inspector as siblings of the preview ---
assert.match(shell, /data-page-builder-shell/, "the shell is identifiable");
assert.match(shellCode, /lg:grid-cols-\[/, "three columns above the large breakpoint");
assert.match(shellCode, /<SectionTree/, "left pane is the section tree");
assert.match(shellCode, /<PreviewFrame/, "centre pane is the preview");
assert.match(shellCode, /<SectionEditor/, "right pane is the inspector");

// --- Selection is two-way ---
// Slice 09 routed selection through a guard that asks before discarding unsaved edits.
assert.match(shellCode, /onSelect=\{selectSection\}/, "the tree selects");
assert.match(frameCode, /onSelect\(hit\.slug\)/, "the preview selects");
assert.match(frameCode, /getElementById\(selectedSlug\)/, "tree selection finds the landing section");
assert.match(frameCode, /data-builder-section="\$\{CSS\.escape\(selectedSlug\)\}"/, "tree selection finds a sub page section");
assert.match(frameCode, /target\?\.scrollIntoView/, "tree selection scrolls the preview");
assert.match(frameCode, /closest\("\[data-section\]"\)/, "selection reads the existing section anchors");

// --- Same-origin: no message protocol, no library ---
assert.doesNotMatch(frameCode, /postMessage|addEventListener\("message"/, "no message protocol is needed");
assert.match(frameCode, /contentDocument/, "the frame's DOM is read directly");
const pkg = JSON.parse(read("package.json"));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
for (const banned of ["@measured/puck", "puck", "grapesjs", "react-frame-component", "@craftjs/core"]) {
  assert.ok(!(banned in deps), `no page-builder library was added (${banned})`);
}

// --- Click arbitration survives the reload after every edit ---
assert.match(frameCode, /mode === "select"/, "an overlay gates pointer events");
assert.match(frameCode, /setMode\(/, "select and interact can be toggled");
assert.match(frameCode, /elementFromPoint/, "hit-testing goes through the overlay");

// --- The frame must not bind to a foreign page ---
assert.match(
  frameCode,
  /path\.includes\(PAGE_BUILDER_PREVIEW_PATH\)/,
  "selection is refused once the frame navigates away — data-section is not landing-only",
);

// --- Device widths, with a real desktop that scales ---
assert.match(frameCode, /desktop: 1280/, "desktop is a real desktop width");
assert.match(frameCode, /mobile: 390/, "mobile preset");
assert.match(frameCode, /tablet: 834/, "tablet preset");
assert.match(frameCode, /transform: `scale\(\$\{scale\}\)`/, "the frame is scaled, not merely narrowed");
assert.match(frameCode, /ResizeObserver/, "scale follows the pane width");

// --- Preview theme is independent of the admin's own ---
assert.match(frameCode, /classList\.toggle\("dark", dark\)/, "theme is set on the frame document");
assert.doesNotMatch(frameCode, /useTheme|next-themes/, "next-themes is not used — it shares this origin's storage");

// --- Locale switch ---
assert.match(frameCode, /\/\$\{locale\}\$\{previewPath\}/, "the frame loads the chosen locale");
assert.match(frameCode, /previewPath = PAGE_BUILDER_PREVIEW_PATH/, "the landing page is the default preview");

// --- Reload after an edit ---
assert.match(frameCode, /refreshKey/, "an edit re-renders the preview");
assert.match(shellCode, /setRefreshKey\(\(k\) => k \+ 1\)/, "every draft change bumps the preview");

// --- Keyboard reorder, and accessible controls ---
assert.match(tree, /aria-label=\{`Move \$\{title\} up`\}/, "sections can be moved without a pointer");
assert.match(tree, /aria-label=\{`Move \$\{title\} down`\}/, "both directions");
assert.match(tree, /aria-pressed=\{section\.visible\}/, "the visibility toggle announces its state");
assert.match(tree, /aria-label=\{section\.visible \? `Hide/, "the visibility toggle is named");
assert.match(tree, /aria-label=\{`Drag \$\{title\} to reorder`\}/, "the drag handle is named");
assert.match(frame, /aria-label="Preview width"/, "the device group is named");
assert.match(frame, /aria-label="Preview language"/, "the language group is named");

// --- Narrow screens keep a preview instead of losing the feature ---
assert.match(shellCode, /useMediaQuery\("\(max-width: 1023px\)"\)/, "the shell adapts below its grid breakpoint");
assert.match(shellCode, /mobilePreviewOpen/, "mobile gets a full-screen preview sheet");
const mobileBranch = shellCode.slice(shellCode.indexOf("if (narrow)"), shellCode.indexOf("return (\n    <div className=\"space-y-4\">\n      {header}\n      <div"));
assert.match(mobileBranch, /<PreviewFrame/, "the mobile branch still renders a preview");
assert.match(mobileBranch, /\{tree\}/, "the mobile branch reuses the same tree");
assert.match(mobileBranch, /\{inspector\}/, "the mobile branch reuses the same inspector");

console.log("page-builder-shell self-check ok");

// --- Adversarial-review regressions (slice 07) ---

// Reorder must ignore sections staged for removal, or it 400s until someone publishes.
const reorderRoute = readCode("app/api/landing-sections/reorder/route.ts");
assert.match(
  reorderRoute,
  /\.not\("draft_deleted", "is", true\)/,
  "reorder excludes soft-deleted rows, which the builder's list already excludes",
);
assert.match(shellCode, /typeof body\?\.error === "string"/, "reorder surfaces the server's message");

// Scale must be measured on the scroll container: measuring the stage is a fixed point.
assert.match(frameCode, /observer\.observe\(pane\)/, "scale is measured on the pane, not the stage");
assert.doesNotMatch(frameCode, /observer\.observe\(stage\)/, "measuring the stage would pin scale at 1");
assert.match(frameCode, /if \(available <= 0\) return;/, "a zero-width pane cannot collapse the frame");

// The overlay must not swallow scrolling, or only the top of the page is reachable.
assert.match(frameCode, /addEventListener\("wheel", onWheel, \{ passive: false \}\)/, "wheel is forwarded to the frame");
assert.match(frameCode, /win\.scrollBy\(e\.deltaX, e\.deltaY\)/, "forwarded scroll reaches the preview");

// Reload must return to the preview, not to wherever a CTA navigated.
assert.match(frameCode, /location\.replace\(src\)/, "reload re-navigates to the preview URL");
assert.doesNotMatch(frameCode, /location\.reload\(\)/, "a plain reload would reload the wrong page");

// next-themes shares this origin's storage and would revert the preview theme.
assert.match(frameCode, /addEventListener\("storage", apply\)/, "theme survives an admin theme change");
assert.match(frameCode, /prefers-color-scheme: dark/, "theme survives an OS theme change");

// Hover must not re-render at pointer rate.
assert.match(frameCode, /prev\.slug === next\.slug/, "hover state bails when nothing changed");

// A cancelled drag must not persist a reorder.
// The guard lives in the shared helper both builders reorder through (#105).
assert.match(read("lib/dnd/sortable-move.ts"), /event\.canceled/, "Escape mid-drag does not reorder");
assert.match(shellCode, /sortableMove\(/, "the landing builder reorders through it");

// The 768-1023 band must get one of the two layouts, not neither.
assert.match(shellCode, /max-width: 1023px/, "the shell switches at the same breakpoint as its grid");
assert.doesNotMatch(shellCode, /useIsMobile/, "the 768px hook would leave tablets in neither layout");

// Deletability is derived, not a second hand-maintained list.
assert.match(tree, /CUSTOM_SECTION_TEMPLATES\.some/, "isCustom is derived from the shared list");
assert.doesNotMatch(tree, /\["featured_products", "shop_cta", "faq"\]/, "no duplicated type list");

// Narrow screens open on the phone preset.
assert.match(shellCode, /initialDevice="mobile"/, "the mobile sheet previews at phone width");

// An outside tap must not discard unsaved edits on mobile.
assert.match(shellCode, /onInteractOutside=\{\(e\) => e\.preventDefault\(\)\}/, "the mobile inspector closes deliberately");

console.log("page-builder-shell regression checks ok");
