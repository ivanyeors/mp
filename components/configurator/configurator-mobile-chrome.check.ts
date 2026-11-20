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
  configuratorStickyHeaderClassName,
} from "./configurator-mobile-chrome";
import { screenBottomPinClassName } from "@/hooks/use-screen-bottom-pin";
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
  assert.match(src, /!isMobile/);
  assert.match(src, /toast\.message\("Exit configuration\?"/);
  assert.match(src, /id: ".*-config-exit"/);
}

assert.match(mp, /\(!isMobile \|\| currentStep === "welcome"\)/);
assert.match(mp, /RetroGrid/);
assert.match(mp, /Particles/);
assert.match(mp, /currentStep !== "welcome" && !isMobile/);
assert.match(mp, /ConfiguratorMobileCloseBar/);

assert.match(bolster, /!isMobile && \([\s\S]*?Particles[\s\S]*?DotPattern/);
assert.match(bolster, /state\.step !== "welcome" && isMobile/);

assert.equal(configuratorOuterPadClassName, "p-4 max-md:px-3");
assert.equal(configuratorCardPadClassName, "p-5 md:p-8");
assert.equal(configuratorPreviewPadClassName, "px-3 py-6 md:px-5");
assert.match(configuratorMobileCloseClearanceClassName, /pb-\[calc\(6rem\+var\(--safe-bottom\)\)\]/);
assert.match(mp, /configuratorCardPadClassName/);
assert.match(mp, /configuratorOuterPadClassName/);
assert.match(bolster, /configuratorCardPadClassName/);
assert.match(bolster, /px-3 md:px-6/);
assert.match(
  mp,
  /border-t bg-background px-5 py-4[\s\S]*?configuratorMobileCloseClearanceClassName[\s\S]*?holdCta/,
);
assert.match(
  bolster,
  /border-t bg-background px-5 py-4[\s\S]*?configuratorMobileCloseClearanceClassName[\s\S]*?holdCta/,
);

for (const src of [mp, bolster]) {
  assert.match(src, /actionsRef=\{setMobileActionsSlot\}/);
  assert.equal(src.match(/<ConfiguratorMobileCloseBar[^>]*actionsRef=/g)?.length, 2);
  const backButtons = src.match(/^\s*Back$/gm)?.length ?? 0;
  const opens = src.match(/<ConfiguratorStepActions/g)?.length ?? 0;
  assert.ok(backButtons > 0 && backButtons === opens, `Back rows ${backButtons} vs actions ${opens}`);
  assert.match(src, /mobile=\{isMobile\}\s+slot=\{mobileActionsSlot\}/);
}
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

assert.match(sheetStickyBottomClassName, /--safe-bottom/);
const barHtml = renderToStaticMarkup(
  createElement(ConfiguratorMobileCloseBar, { onClose: () => {} }),
);
assert.match(barHtml, /Close/);
assert.match(barHtml, /md:hidden|safe-bottom|--safe-bottom/);
assert.match(barHtml, /sr-only/);
assert.match(barHtml, /empty:hidden/);
assert.match(barHtml, /\[&amp;&gt;:last-child\]:flex-1/);
assert.ok(barHtml.includes(screenBottomPinClassName), "bar must use the screen-bottom pin");
assert.match(barHtml, /\bfixed\b/);
assert.match(
  readFileSync(join(ROOT, "components/configurator/configurator-mobile-chrome.tsx"), "utf8"),
  /publishMobileBottomBarHeight\(el\)/,
);
for (const file of ["components/analytics/analytics-notice-bar.tsx", "components/support/support-chat-window.tsx"]) {
  assert.match(readFileSync(join(ROOT, file), "utf8"), /--mobile-bottom-bar-height/, file);
}

assert.match(configuratorStickyHeaderClassName, /^sticky top-0 /);
assert.match(configuratorStickyHeaderClassName, /standalone:pt-\[var\(--safe-top\)\]/);
assert.match(configuratorStickyHeaderClassName, /standalone:-mt-\[var\(--safe-top\)\]/);
assert.equal(mp.match(/cn\(\s*configuratorStickyHeaderClassName,/g)?.length, 1);
assert.equal(bolster.match(/cn\(\s*configuratorStickyHeaderClassName,/g)?.length, 2);
for (const src of [mp, bolster]) assert.doesNotMatch(src, /className="sticky top-0/);

const dialogHtml = renderToStaticMarkup(
  createElement(ConfiguratorExitDialog, {
    open: true,
    onOpenChange: () => {},
    description: "Clear session.",
    onConfirmExit: () => {},
  }),
);
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
assert.match(chromeSrc, /ConfiguratorExitDialog[\s\S]*?DialogContent hideClose/);

void dialogHtml;
void barHtml;

const maker = readFileSync(join(ROOT, "app/[lang]/mp-maker/page.tsx"), "utf8");
assert.match(maker, /useIsMobile/);
assert.match(maker, /!isMobile && \([\s\S]*?Particles[\s\S]*?DotPattern/);
const gateIdx = maker.indexOf("!isMobile && (");
assert.ok(gateIdx > 0, "mp-maker must have an !isMobile effect gate");
assert.ok(
  maker.indexOf("<Particles") > gateIdx && maker.indexOf("<DotPattern") > gateIdx,
  "mp-maker Particles/DotPattern must be gated, not unconditional",
);

console.log("configurator-mobile-chrome.check.ts: ok");
