import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const journey = read("app/[lang]/settings/analytics/ProspectJourneyCard.tsx");
assert.match(journey, /function openCamera\(/);
assert.match(journey, /setCamera\(openCamera\(laid, viewport\.w, viewport\.h\)\)/);
assert.match(journey, /const pad = vw < NARROW_W \? 16 : 110;/);
assert.match(journey, /onTouchStart\(ev, inPanel \? "panel" : "node", path\);/);
assert.match(journey, /if \(ev\.pointerType === "touch"\) \{\s*onTouchStart\(ev, "canvas"\);/);
assert.match(journey, /onTouchStart\(ev, "edge", null, e\);/);
assert.match(journey, /if \(ev\.pointerType !== "touch"\) ev\.stopPropagation\(\);/);
assert.match(journey, /if \(ev\.pointerType === "touch"\) return;\s*ev\.stopPropagation\(\);/);
assert.match(journey, /if \(!selectedSet\.has\(tap\.path\)\) revealExpanded\(tap\.path\);/);
assert.match(journey, /t\.pinch = \{/);
assert.match(journey, /window\.addEventListener\("pointercancel", onTouchEnd, \{ signal \}\)/);
assert.match(journey, /fullscreen \? "touch-none" : "touch-pan-y"/);
assert.match(journey, /pressedPath === n\.path \? \(\s*<rect[\s\S]{0,240}className="fill-press"/);
assert.match(journey, /if \(ev\.pointerType !== "touch"\) clearEdgeTooltip\(\);/);

const waterfall = read("app/[lang]/settings/analytics/InventoryMovementWaterfallVisx.tsx");
assert.match(waterfall, /Math\.ceil\(44 \* \(rows\.length \+ 0\.25\)\)/);
assert.match(waterfall, /key=\{`hit-\$\{r\.key\}`\}[\s\S]{0,200}width=\{margin\.left \+ innerWidth\}/);
assert.match(waterfall, /fill="var\(--press\)"/);
assert.doesNotMatch(waterfall, /<text[^>]*onClick/);

const toolbar = read("components/settings/markdown-toolbar.ts");
assert.match(toolbar, /MOBILE_MD_EXTRA_COMMANDS: ICommand\[\] = \[codeEdit, codePreview\]/);
for (const file of [
  "app/[lang]/settings/blogs/[id]/blog-editor-client.tsx",
  "app/[lang]/settings/partners/partners-client.tsx",
]) {
  const src = read(file);
  assert.match(src, /from "@\/components\/settings\/markdown-toolbar"/, file);
  assert.match(src, /extraCommands=\{isMobile \? MOBILE_MD_EXTRA_COMMANDS : undefined\}/, file);
  assert.doesNotMatch(src, /const MOBILE_MD_COMMANDS/, file);
}
const productBody = read("components/markdown-editor/markdown-editor-impl.tsx");
assert.match(productBody, /const TOOL =\s*"[^"]*max-md:h-11 max-md:min-w-11"/);
assert.match(productBody, /max-md:h-11 max-md:px-3/);
assert.match(read("app/[lang]/settings/products/[id]/product-editor-client.tsx"), /from "@\/components\/markdown-editor\/markdown-editor"/);
const css = read("app/globals.css");
assert.match(css, /\.w-md-editor \.w-md-editor-toolbar li > button:active \{\s*background-color: var\(--press\);/);
assert.match(css, /@media \(max-width: 767px\) \{\s*\.w-md-editor \.w-md-editor-toolbar \{[\s\S]{0,200}width: 44px;\s*height: 44px;/);

const campaign = read("app/[lang]/settings/campaigns/campaign-editor.tsx");
assert.match(campaign, /<RichText\s[^>]*?id="c-subject"\s+singleLine\b/);
assert.match(campaign, /<RichText\s[^>]*?id="c-preheader"\s+singleLine\b/);
const richTextBox = read("components/block-editor/rich-text-style.ts");
assert.match(richTextBox, /RICH_TEXT_BOX = \[\s*"[^"]*\bbreak-words whitespace-pre-wrap\b/);
assert.match(read("components/block-editor/rich-text-editor.tsx"), /class: cn\(RICH_TEXT_BOX,/);
const oneLine = read("components/block-editor/rich-text-schema.ts");
assert.match(oneLine, /transformPastedText: \(text\) => text\.replace\(\/\\s\*\[\\r\\n\]\+\\s\*\/g, " "\)/);
assert.match(oneLine, /if \(singleLine\) out\.push\(OneLine\);/);
const emailCopy = read("app/[lang]/settings/email-templates/email-copy-editor.tsx");
assert.match(emailCopy, /from "@\/components\/block-editor\/rich-text"/);
assert.match(emailCopy, /singleLine=\{isOneLine\(field\)\}/);

const grid = read("components/ui/sheet-grid.tsx");
assert.match(grid, /if \(lastPointer\.current === "touch" && !\(active && editing\)\) startEdit\(v, true\);/);
assert.match(grid, /pointer-coarse:h-11/);
assert.match(grid, /pointer-coarse:hidden/);
const dims = read("app/[lang]/settings/inventory/configure/dimensions-section.tsx");
assert.match(dims, /<div className="mt-1 flex items-center gap-1 md:hidden">\s*<SourceBadge/);
assert.match(dims, /font-medium text-muted-foreground max-md:hidden">Status/);

console.log("mobile-touch.check.ts: ok");
