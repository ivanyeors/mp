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

const html = renderToStaticMarkup(
  createElement(MobileStickyActionBar, null, "child"),
);

assert.match(html, /fixed/);
assert.match(html, /bottom-0/);
assert.match(html, /md:hidden/);
assert.match(html, /--mobile-bottom-clearance/);
assert.match(html, /env\(safe-area-inset-bottom/);
assert.match(html, /child/);

// Spacer helper pages use to clear the bar.
assert.match(mobileStickyActionBarSpacerClassName, /--mobile-bottom-clearance/);
assert.match(mobileStickyActionBarSpacerClassName, /env\(safe-area-inset-bottom/);
assert.match(mobileStickyActionBarSpacerClassName, /md:pb-0/);

console.log("mobile-sticky-action-bar.check.ts: ok");
