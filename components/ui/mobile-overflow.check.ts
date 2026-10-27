/**
 * Slice 12: mobile overflow / no page side-scroll (token asserts).
 * Run: npx tsx components/ui/mobile-overflow.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const home = read("app/[lang]/page.tsx");
const marquee = read("components/sections/landing/marquee-section.tsx");
const carousel = read("components/ui/apple-cards-carousel.tsx");
const sizeMatters = read("components/slide-in-pages/size-matters-slide-in.tsx");
const settingsNav = read("components/settings/settings-sidebar-nav.tsx");
const settingsGeneral = read("app/[lang]/settings/general/general-client.tsx");
const mp = read("app/[lang]/mp-config/mp-config-client.tsx");
const bolster = read("app/[lang]/mbolster-config/mbolster-config-client.tsx");
const input = read("components/ui/input.tsx");
const textarea = read("components/ui/textarea.tsx");
const globals = read("app/globals.css");
const header = read("components/ui/home-header.tsx");

// Home: containment without relying only on html overflow
assert.match(home, /min-w-0 max-w-full overflow-x-hidden/);
assert.doesNotMatch(marquee, /className="[^"]*w-screen/);
assert.match(marquee, /w-full overflow-hidden/);

// Contained carousel: local scroll + min-w-0 so the track cannot widen the document
assert.match(carousel, /relative w-full min-w-0/);
assert.match(carousel, /min-w-0 overflow-x-auto/);
assert.match(carousel, /overscroll-x-contain/);

// Size Matters sheet: X clipped in the scroll viewport
assert.match(sizeMatters, /min-w-0 flex-1 overflow-y-auto overflow-x-hidden/);
assert.match(sizeMatters, /<Carousel\b/);

// Configurators: page roots clamp width
for (const src of [mp, bolster]) {
  assert.match(src, /min-w-0 max-w-full overflow-x-hidden/);
}

// Sample /settings page + Admin mobile shell
// `overflow-x-clip` is the later, scroll-container-free form of the same containment.
assert.match(settingsNav, /min-h-svh w-full min-w-0 overflow-x-(?:hidden|clip) md:overflow-x-visible/);
assert.match(settingsNav, /min-w-0 max-w-full px-2 (?:py-3|pt-3 pb-)/);
assert.match(settingsGeneral, /min-w-0 max-w-full overflow-x-auto/);
assert.match(settingsGeneral, /flex-col gap-3 sm:flex-row/);

// Inputs ≥16px on mobile (text-base) before pinch-zoom lock (slice 13)
assert.match(input, /text-base[\s\S]*?md:text-sm/);
assert.match(textarea, /text-base[\s\S]*?md:text-sm/);

// Safety net stays; sources are fixed above
assert.match(globals, /html\s*\{[\s\S]*?overflow-x:\s*hidden/);
assert.match(globals, /overflow-x:\s*clip/);

// Compact header: no 100vw max-width (scrollbar-safe)
assert.doesNotMatch(header, /100vw/);
assert.match(header, /max-w-\[calc\(100%-0\.5rem\)\]/);

console.log("mobile-overflow.check.ts: ok");
