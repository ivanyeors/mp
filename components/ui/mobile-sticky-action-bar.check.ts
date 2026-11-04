/**
 * Issue #57: shared MobileStickyActionBar renders the cart bar's
 * fixed / dock-clearing / md:hidden wrapper.
 * Run: npx tsx components/ui/mobile-sticky-action-bar.check.ts
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  MobileStickyActionBar,
  mobileStickyActionBarSpacerClassName,
} from "./mobile-sticky-action-bar";
import { screenBottomPinClassName } from "@/hooks/use-screen-bottom-pin";

const html = renderToStaticMarkup(
  createElement(MobileStickyActionBar, null, "child"),
);

assert.match(html, /fixed/);
// bottom: 0, kept on the screen's edge on iOS after a keyboard (useScreenBottomPin).
assert.ok(html.includes(screenBottomPinClassName), "bar must use the screen-bottom pin");
assert.match(html, /md:hidden/);
assert.match(html, /--mobile-bottom-clearance/);
// --mobile-bottom-clearance already contains --safe-bottom; adding the inset
// again left ~34px of dead space on iPhones.
assert.doesNotMatch(html, /env\(safe-area-inset-bottom/);
assert.match(html, /child/);

// Spacer helper pages use to clear the bar: the bar's measured height while
// mounted, the dock clearance alone otherwise.
assert.match(mobileStickyActionBarSpacerClassName, /--mobile-sticky-action-bar-height/);
assert.match(mobileStickyActionBarSpacerClassName, /--mobile-bottom-clearance/);
assert.doesNotMatch(mobileStickyActionBarSpacerClassName, /env\(safe-area-inset-bottom/);
assert.match(mobileStickyActionBarSpacerClassName, /md:pb-0/);

console.log("mobile-sticky-action-bar.check.ts: ok");
