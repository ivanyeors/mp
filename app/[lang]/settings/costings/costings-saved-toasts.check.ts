import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const page = readFileSync(join(ROOT, "app/[lang]/settings/costings/page.tsx"), "utf8");
const route = readFileSync(join(ROOT, "app/[lang]/settings/costings/save/route.ts"), "utf8");
const helper = readFileSync(join(ROOT, "lib/shop/stripe-warnings.ts"), "utf8");

assert.match(
  page,
  /import \{[^}]*\bcostingsSavedToasts\b[^}]*\} from "@\/lib\/shop\/stripe-warnings"/,
  "Costings page: costingsSavedToasts is not imported",
);
const save = page.match(/settingsPath\("\/settings\/costings\/save"\)[\s\S]*?\} finally \{/);
assert.ok(save, "Costings page: the save handler was not found");
assert.match(
  save[0],
  /for \(const t of costingsSavedToasts\(payload\)\) toast\[t\.type\]\(t\.title, t\.options\)/,
  "Costings page: the save handler does not show costingsSavedToasts(payload)",
);
assert.doesNotMatch(
  save[0],
  /toast\.success\(/,
  "Costings page: the save handler shows a success toast of its own, which can hide a Stripe warning",
);

const helperBody = helper.match(/export function costingsSavedToasts\([\s\S]*?\n\}/);
assert.ok(helperBody, "costingsSavedToasts not found");
const readKeys = [...helperBody[0].matchAll(/payload\?\.(\w+)/g)].map((m) => m[1]);
assert.deepEqual(new Set(readKeys), new Set(["unresolvable_variants", "stripe_warnings"]));
for (const key of readKeys) {
  assert.match(route, new RegExp(`\\b${key}:`), `the Costings save route does not return ${key}`);
}

console.log("costings-saved-toasts.check.ts: ok");
