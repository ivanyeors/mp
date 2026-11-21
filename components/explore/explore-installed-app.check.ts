import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const source = readFileSync(path.join(import.meta.dirname, "explore-experience.tsx"), "utf8");

assert.match(
  source,
  /<main\s+className="fixed inset-0 overflow-hidden[^"]*\bstandalone:bottom-auto\b[^"]*\bstandalone:h-lvh\b/,
  "in the installed iPhone app (iOS 26) a fixed inset-0 box stops one status-bar height above the screen's bottom edge, leaving a stripe of page background: the sky and scene must reach 100lvh there",
);
assert.match(
  source,
  /"pointer-events-none absolute inset-0 flex flex-col[^"]*\bstandalone:bottom-auto\b[^"]*\bstandalone:h-dvh\b/,
  "the words and buttons stay in 100dvh, the part of the screen the page is sure to show, so the footer is never under that stripe",
);
assert.match(
  source,
  /html,body\{background:\$\{toHex\(sky\.palette\.seaDeep\)\}\}/,
  "the page behind Explore is the sea's colour, so whatever iOS paints in that stripe is sea and not the dark-mode #0a0a0a",
);

console.log("explore-installed-app: ok");
