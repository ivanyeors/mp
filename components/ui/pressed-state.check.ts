/**
 * Touch feedback and hit areas on the shared primitives (token asserts).
 * Phones never apply Tailwind v4 `hover:`, so every tappable primitive carries an
 * `active:` style, and small controls grow their hit area to 44px.
 * Run: npx tsx components/ui/pressed-state.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const css = read("app/globals.css");
const button = read("components/ui/button.tsx");
const tabs = read("components/ui/tabs.tsx");
const checkbox = read("components/ui/checkbox.tsx");
const switchUi = read("components/ui/switch.tsx");
const sortable = read("components/ui/sortable-row.tsx");
const infoTip = read("components/ui/info-tip.tsx");
const table = read("components/ui/table.tsx");
const select = read("components/ui/select.tsx");
const card = read("components/ui/card.tsx");
const shell = read("components/settings/settings-sidebar-nav.tsx");
const mobileList = read("components/settings/mobile-list.tsx");

// The pressed tint is a token in both themes.
assert.match(css, /--color-press: var\(--press\)/);
assert.equal((css.match(/--press: oklch\(/g) ?? []).length, 2);

// Every Button variant presses; `asChild` (Slot drops Motion's whileTap) scales in CSS.
for (const token of ["active:bg-primary/80", "active:bg-destructive/80", "active:opacity-60"]) {
  assert.ok(button.includes(token), `button: ${token}`);
}
assert.ok((button.match(/active:bg-press/g) ?? []).length >= 3, "button: outline/secondary/ghost press");
assert.match(button, /"active:scale-\[0\.97\] motion-reduce:active:scale-100"/);

// Tabs: the trigger's hit area covers the list padding; an inactive trigger tints.
assert.match(tabs, /after:-inset-y-\[5px\]/);
assert.match(tabs, /data-\[state=inactive\]:active:bg-background\/60/);

// 16px checkbox and 36×20 switch: 44px hit areas, a halo while pressed.
assert.match(checkbox, /after:-inset-3\.5/);
assert.match(switchUi, /after:-inset-y-3/);
for (const src of [checkbox, switchUi]) assert.match(src, /active:ring-\[6px\]/);

// Drag handle, InfoTip, clickable table rows.
assert.match(sortable, /min-h-11 min-w-11[^"]*active:bg-press/);
assert.match(infoTip, /active:bg-press/);
assert.match(table, /\[&\.cursor-pointer\]:active:bg-press/);

// A full-width select gives way to its neighbours and never widens its card on a phone.
assert.match(select, /max-w-full shrink items-center/);
assert.match(select, /truncate text-left max-md:\[contain:inline-size\]/);

// Card padding reads variables; the Admin Panel shell tightens them on phones.
assert.match(card, /py-\[var\(--card-py,1\.5rem\)\]/);
assert.match(card, /gap-\[var\(--card-gap,1\.5rem\)\]/);
assert.ok((card.match(/px-\[var\(--card-px,1\.5rem\)\]/g) ?? []).length >= 3, "card: header/content/footer px");
assert.match(shell, /max-md:\[--card-gap:1rem\] max-md:\[--card-px:1rem\] max-md:\[--card-py:1rem\]/);
// A title-only header has no empty second row (and its 8px gap) on a phone.
assert.match(card, /grid-rows-\[auto_auto\] items-start gap-2 max-md:grid-rows-none/);

// The shell drops iOS's grey tap flash: the pressed tints replace it.
assert.match(shell, /\[-webkit-tap-highlight-color:transparent\]/);

// Breadcrumb links are 44px tall inside the 56px header.
assert.match(shell, /className="block truncate py-3 active:opacity-60"/);

// Phone list rows: one ≥56px target with a pressed tint.
assert.match(mobileList, /min-h-14/);
assert.match(mobileList, /has-\[\[data-row-target\]:active\]:bg-press/);
assert.match(mobileList, /flex shrink-0 items-center gap-2 pr-2/);

console.log("pressed-state.check.ts ok");
