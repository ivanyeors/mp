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

// The dismiss button offers a viewport-pinned variant (for edge-anchored
// sheets) and an in-flow sticky variant (for centered dialogs).
assert.match(dismiss, /variant === "pinned" && \[\s*"fixed"/);
assert.match(dismiss, /variant === "sticky" && \[[\s\S]*?max-md:sticky max-md:bottom-/);
assert.match(dismiss, /variant === "sticky" && \[[\s\S]*?md:absolute md:top-4 md:right-4/);
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

// Dialog: centered by a transform (which would also capture `fixed`), so the
// X rides in flow and sticks to the bottom of the mobile scrollport.
assert.match(dialog, /-translate-x-1\/2 -translate-y-1\/2/);
assert.match(dialog, /<OverlayDismissButton variant="sticky" \/>/);
// A grid item's containing block is its own grid area, which gives sticky no
// travel; the mobile scroll container must be a flex column.
assert.match(dialog, /max-md:overflow-y-auto max-md:flex max-md:flex-col/);

// Mobile bottom sheets span the viewport so the pinned corner is the sheet's,
// and SheetFooter keeps its actions clear of the pinned X.
assert.match(sheet, /isMobileBottomSheet && "w-full max-w-none sm:max-w-none"/);
assert.match(sheet, /hasPinnedClose && "max-md:pr-\[4\.25rem\]"/);

console.log("overlay-dismiss-scroll.check.ts: ok");
