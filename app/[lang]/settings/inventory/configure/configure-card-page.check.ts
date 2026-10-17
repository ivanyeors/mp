/**
 * Slice 02 self-check: product cards open the full [card] page, not a Sheet.
 * Run: npx tsx "app/[lang]/settings/inventory/configure/configure-card-page.check.ts"
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const dir = join(process.cwd(), "app", "[lang]", "settings", "inventory", "configure");
const grid = readFileSync(join(dir, "configure-client.tsx"), "utf8");
const card = readFileSync(join(dir, "[card]", "page.tsx"), "utf8");

// Grid: cards are links to the deep-linkable [card] route; the drawer is gone.
assert.match(grid, /settings\/inventory\/configure\/\$\{card\}/, "grid cards must link to the [card] route");
assert.doesNotMatch(grid, /from "@\/components\/ui\/sheet"/, "grid must not import the Sheet drawer");
assert.doesNotMatch(card, /from "@\/components\/ui\/sheet"/, "card page must not import the Sheet drawer");

// Card page: default export, URL-derived identity, breadcrumbs back to Configure.
assert.match(card, /export default function ConfigureCardPage/, "card page must export a page component");
assert.match(card, /useParams<\{ card: string \}>/, "card identity must come from the URL");
assert.match(card, /BreadcrumbLink/, "card page must render breadcrumbs");
assert.match(card, /notFound\(\)/, "unknown card ids must 404");

// Both product tabs survived the move (Product + Filling Config).
assert.match(card, /TabsTrigger value="product"/, "Product tab must exist");
assert.match(card, /TabsTrigger value="filling"/, "Filling Config tab must exist");

// Slice 09: unpromoted ranking + Promote live in the Filling Config tab, Admin Panel only.
assert.match(card, /Popular unpromoted mixes/, "unpromoted ranking section must render in the Filling Config tab");
assert.match(card, /configure\/unpromoted/, "card page must call the unpromoted API");
const configurator = readFileSync(
  join(process.cwd(), "app", "[lang]", "mp-config", "mp-config-client.tsx"),
  "utf8",
);
assert.doesNotMatch(
  configurator,
  /unpromoted|promote/i,
  "Promote is Admin Panel only — no configurator entry point",
);

console.log("configure-card-page.check: all assertions passed");
