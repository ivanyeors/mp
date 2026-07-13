import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { preferenceCategoryAllowed, soleCaseId } from "./preference-policy";

assert.equal(preferenceCategoryAllowed("pillow", "cover"), true);
assert.equal(preferenceCategoryAllowed("pillow", "case"), true);
assert.equal(preferenceCategoryAllowed("bolster", "case"), true);
assert.equal(preferenceCategoryAllowed("bolster", "cover"), false);
assert.equal(soleCaseId([]), null);
assert.equal(soleCaseId([{ item_id: 42 }]), 42);
assert.equal(soleCaseId([{ item_id: 42 }, { item_id: 43 }]), null);

const client = readFileSync(
  "app/[lang]/mbolster-config/mbolster-config-client.tsx",
  "utf8",
);
assert.match(client, /\bcaseOnly\b/);
assert.doesNotMatch(client, /\{ item_id: selectedCover!, quantity: 1, category: "cover" \}/);

const holdRoute = readFileSync("app/api/results/hold/route.ts", "utf8");
assert.match(holdRoute, /preferenceCategoryAllowed\(v\.productType, line\.category\)/);

console.log("preference-policy self-check ok: bolster is case-only; sole case auto-selects");
