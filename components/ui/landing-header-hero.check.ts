/**
 * Slices 08–09: landing header Profile left + hero CTAs lower on mobile;
 * compact pill is logo-only, with booking and chat in the dock.
 * Run: npx tsx components/ui/landing-header-hero.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const header = readFileSync(join(ROOT, "components/ui/home-header.tsx"), "utf8");
const dock = readFileSync(join(ROOT, "components/ui/app-dock.tsx"), "utf8");
const hero = readFileSync(
  join(ROOT, "components/sections/landing/hero-section.tsx"),
  "utf8",
);

const expandedStart = header.indexOf('data-slot="home-header-expanded"');
assert.ok(expandedStart > 0, "expanded header marker present");
const expanded = header.slice(
  expandedStart,
  header.indexOf("</header>", expandedStart),
);
assert.match(expanded, /ProfileMenu/);
assert.ok(
  expanded.indexOf("<ProfileMenu") < expanded.indexOf("src={LOGO_SRC}"),
  "Profile is left of logo",
);
const right = expanded.slice(expanded.indexOf("justify-end"));
assert.match(right, /LanguageToggle/);
assert.match(right, /ModeToggle/);
assert.doesNotMatch(right, /ProfileMenu/);
// The compact pill is just the logo; booking and chat moved to the dock.
const compact = header.slice(0, expandedStart);
assert.match(compact, /src=\{LOGO_INV_SRC\}/);
assert.doesNotMatch(header, /openBookAppointment|SUPPORT_WHATSAPP_URL/);
assert.match(dock, /openBookAppointment/);
assert.match(dock, /openSupportChat/);
// Marketing pages go home via that logo, so only other pages get a dock Home.
assert.match(dock, /marketing \? productItems : \[homeItem, \.\.\.productItems\]/);

assert.match(hero, /mt-auto/);
assert.match(hero, /pb-\[var\(--mobile-bottom-clearance/);
assert.match(hero, /md:mt-0 md:pb-0/);
assert.match(hero, /flex h-full max-w-xl flex-col/);
assert.doesNotMatch(
  hero,
  /pb-\[calc\(3rem\+var\(--mobile-bottom-clearance/,
);

console.log("landing-header-hero.check.ts: ok");
