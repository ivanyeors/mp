/**
 * Slice 02 self-check: mobile chrome (Close, bg, padding).
 * Run: npx tsx components/configurator/configurator-mobile-chrome.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ConfiguratorExitDialog,
  ConfiguratorMobileCloseBar,
  ConfiguratorStepActions,
  configuratorCardPadClassName,
  configuratorMobileCloseClearanceClassName,
  configuratorOuterPadClassName,
  configuratorPreviewPadClassName,
} from "./configurator-mobile-chrome";
import { sheetStickyBottomClassName } from "@/lib/sheet/safe-area";

const ROOT = process.cwd();
const mp = readFileSync(join(ROOT, "app/[lang]/mp-config/mp-config-client.tsx"), "utf8");
const bolster = readFileSync(
  join(ROOT, "app/[lang]/mbolster-config/mbolster-config-client.tsx"),
  "utf8",
);

for (const src of [mp, bolster]) {
  assert.match(src, /ConfiguratorExitDialog/);
  assert.match(src, /ConfiguratorMobileCloseBar/);
  assert.match(src, /requestExit/);
  assert.match(src, /useIsMobile/);
  // Mobile gates effects off post-welcome / on preview
  assert.match(src, /!isMobile/);
  // Desktop toast exit preserved
  assert.match(src, /toast\.message\("Exit configuration\?"/);
  assert.match(src, /id: ".*-config-exit"/);
}

// Mpillow: welcome keeps fx; post-welcome mobile unmounts RetroGrid/Particles
assert.match(mp, /\(!isMobile \|\| currentStep === "welcome"\)/);
assert.match(mp, /RetroGrid/);
assert.match(mp, /Particles/);
// Top X only when not mobile
assert.match(mp, /currentStep !== "welcome" && !isMobile/);
assert.match(mp, /ConfiguratorMobileCloseBar/);

// Mbolster preview: Particles/DotPattern behind !isMobile
assert.match(bolster, /!isMobile && \([\s\S]*?Particles[\s\S]*?DotPattern/);
assert.match(bolster, /state\.step !== "welcome" && isMobile/);

// Padding tokens
assert.equal(configuratorOuterPadClassName, "p-4 max-md:px-3");
assert.equal(configuratorCardPadClassName, "p-5 md:p-8");
assert.equal(configuratorPreviewPadClassName, "px-3 py-6 md:px-5");
assert.match(configuratorMobileCloseClearanceClassName, /pb-\[calc\(6rem\+var\(--safe-bottom\)\)\]/);
assert.match(mp, /configuratorCardPadClassName/);
assert.match(mp, /configuratorOuterPadClassName/);
assert.match(bolster, /configuratorCardPadClassName/);
assert.match(bolster, /px-3 md:px-6/);
// Preview hold footer must clear fixed Close (not only the scroll pane above it)
assert.match(
  mp,
  /border-t bg-background px-5 py-4[\s\S]*?configuratorMobileCloseClearanceClassName[\s\S]*?holdCta/,
);
assert.match(
  bolster,
  /border-t bg-background px-5 py-4[\s\S]*?configuratorMobileCloseClearanceClassName[\s\S]*?holdCta/,
);

// Mobile: every step's Back / Continue live in the bottom bar, beside Close.
for (const src of [mp, bolster]) {
  assert.match(src, /actionsRef=\{setMobileActionsSlot\}/);
  // Both bars (questionnaire + preview) expose the slot.
  assert.equal(src.match(/<ConfiguratorMobileCloseBar[^>]*actionsRef=/g)?.length, 2);
  // Every Back button sits inside a ConfiguratorStepActions; the preview
  // header's icon-only back arrow is the one exception (aria-label="Back").
  const backButtons = src.match(/^\s*Back$/gm)?.length ?? 0;
  const opens = src.match(/<ConfiguratorStepActions/g)?.length ?? 0;
  assert.ok(backButtons > 0 && backButtons === opens, `Back rows ${backButtons} vs actions ${opens}`);
  assert.match(src, /mobile=\{isMobile\}\s+slot=\{mobileActionsSlot\}/);
}
// Desktop renders the row in place; mobile renders nothing in place.
assert.equal(
  renderToStaticMarkup(
    createElement(ConfiguratorStepActions, { mobile: false, slot: null, className: "row" }, "go"),
  ),
  '<div class="row">go</div>',
);
assert.equal(
  renderToStaticMarkup(
    createElement(ConfiguratorStepActions, { mobile: true, slot: null, className: "row" }, "go"),
  ),
  "",
);

// Close bar uses slide-in safe-bottom language
assert.match(sheetStickyBottomClassName, /--safe-bottom/);
const barHtml = renderToStaticMarkup(
  createElement(ConfiguratorMobileCloseBar, { onClose: () => {} }),
);
assert.match(barHtml, /Close/);
assert.match(barHtml, /md:hidden|safe-bottom|--safe-bottom/);
// OverlayDismissButton renders sr-only Close
assert.match(barHtml, /sr-only/);
// Actions slot: collapses when empty; the last action (Continue) fills the bar.
assert.match(barHtml, /empty:hidden/);
assert.match(barHtml, /\[&amp;&gt;:last-child\]:flex-1/);

const dialogHtml = renderToStaticMarkup(
  createElement(ConfiguratorExitDialog, {
    open: true,
    onOpenChange: () => {},
    description: "Clear session.",
    onConfirmExit: () => {},
  }),
);
// Radix Dialog may portal; at least title/actions present when forced open via props
// (SSR often omits portal content — assert component source instead if empty)
const chromeSrc = readFileSync(
  join(ROOT, "components/configurator/configurator-mobile-chrome.tsx"),
  "utf8",
);
assert.match(chromeSrc, /Stay/);
assert.match(chromeSrc, /Exit/);
assert.match(chromeSrc, /Exit configuration\?/);
assert.match(chromeSrc, /sheetStickyBottomClassName/);
assert.match(chromeSrc, /OverlayDismissButton/);
assert.match(chromeSrc, /md:hidden/);
// Slice 01: exit confirmation has no corner X (Stay/Exit/backdrop only)
assert.match(chromeSrc, /ConfiguratorExitDialog[\s\S]*?DialogContent hideClose/);

void dialogHtml;
void barHtml;

// Issue #64: mp-maker gates Particles/DotPattern behind !isMobile (match config pages).
const maker = readFileSync(join(ROOT, "app/[lang]/mp-maker/page.tsx"), "utf8");
assert.match(maker, /useIsMobile/);
assert.match(maker, /!isMobile && \([\s\S]*?Particles[\s\S]*?DotPattern/);
// Effects must not be rendered unconditionally: every Particles/DotPattern tag
// sits after the `!isMobile && (` gate.
const gateIdx = maker.indexOf("!isMobile && (");
assert.ok(gateIdx > 0, "mp-maker must have an !isMobile effect gate");
assert.ok(
  maker.indexOf("<Particles") > gateIdx && maker.indexOf("<DotPattern") > gateIdx,
  "mp-maker Particles/DotPattern must be gated, not unconditional",
);

console.log("configurator-mobile-chrome.check.ts: ok");
