/**
 * Overlay close button must stay in view while a scrolling overlay scrolls.
 *
 * SheetContent and DialogContent (on mobile) are their own scroll containers,
 * so an `absolute` X inside them scrolls away with the content — after
 * expanding a couple of sections in a drawer the X ends up floating mid-list.
 * Token asserts for the fix; run: npx tsx components/ui/overlay-dismiss-scroll.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const dismiss = read("components/ui/overlay-dismiss.tsx");
const sheet = read("components/ui/sheet.tsx");
const dialog = read("components/ui/dialog.tsx");

// The dismiss button offers a viewport-pinned variant for edge-anchored sheets.
assert.match(dismiss, /variant === "pinned" && \[\s*"fixed"/);
assert.doesNotMatch(dismiss, /variant === "sticky"/);
// 44px mobile hit area is unchanged.
assert.match(dismiss, /min-h-11 min-w-11/);

// Sheet: right/bottom sheets pin the X to the viewport corner (which is the
// sheet's own corner); it must never fall back to a bare `absolute` corner
// inside the `overflow-y-auto` content for those sides.
assert.match(sheet, /overflow-y-auto/);
assert.match(
  sheet,
  /!hideClose && \(resolvedSide === "right" \|\| resolvedSide === "bottom"\)/,
);
assert.match(sheet, /variant=\{hasPinnedClose \? "pinned" : "corner"\}/);
assert.doesNotMatch(sheet, /<OverlayDismissButton \/>/);

// Dialog: below md it is a bottom drawer whose close control is the grab handle,
// stuck to the top of the scrollport, so no X floats over the last control.
// Desktop keeps its top-right X.
assert.match(dialog, /data-slot="dialog-drawer-handle"/);
assert.match(dialog, /className="sticky top-0 z-10 order-first [^"]*md:hidden"/);
assert.match(dialog, /<OverlayDismissButton variant="corner" className=\{mobileDrawer \? "max-md:hidden" : undefined\} \/>/);
assert.match(dialog, /\{mobileDrawer && <DialogDrawerHandle \/>\}/);
assert.doesNotMatch(dialog, /hideMobileClose/);
// Sticky needs a flex column scroll container (a grid item's containing block
// is only its own grid area).
assert.match(dialog, /max-md:flex /);
assert.match(dialog, /max-md:flex-col max-md:overflow-y-auto/);

// Mobile bottom sheets span the viewport so the pinned corner is the sheet's,
// and SheetFooter keeps its actions clear of the pinned X.
assert.match(sheet, /isMobileBottomSheet && "w-full max-w-none sm:max-w-none"/);
assert.match(sheet, /hasPinnedClose && "max-md:pr-\[4\.25rem\]"/);

console.log("overlay-dismiss-scroll.check.ts: ok");
