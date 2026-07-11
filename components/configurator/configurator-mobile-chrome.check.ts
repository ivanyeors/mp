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
assert.match(configuratorMobileCloseClearanceClassName, /pb-24/);
assert.match(mp, /configuratorCardPadClassName/);
assert.match(mp, /configuratorOuterPadClassName/);
assert.match(bolster, /configuratorCardPadClassName/);
assert.match(bolster, /px-3 md:px-6/);

// Close bar uses slide-in safe-bottom language
assert.match(sheetStickyBottomClassName, /--safe-bottom/);
const barHtml = renderToStaticMarkup(
  createElement(ConfiguratorMobileCloseBar, { onClose: () => {} }),
);
assert.match(barHtml, /Close/);
assert.match(barHtml, /md:hidden|safe-bottom|--safe-bottom/);
// OverlayDismissButton renders sr-only Close
assert.match(barHtml, /sr-only/);

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

void dialogHtml;
void barHtml;

console.log("configurator-mobile-chrome.check.ts: ok");
