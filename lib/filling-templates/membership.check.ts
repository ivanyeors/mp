import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeTemplateKeys, primaryTemplateKey, templateServesKey } from "./keys";

const read = (path: string) => readFileSync(path, "utf8");

for (const keys of [["M"], ["XS", "XL"], ["L", "S", "M"]]) {
  const normalized = normalizeTemplateKeys("pillow", keys);
  assert.ok(normalized.ok, `normalizes ${keys.join("+")}`);
  if (normalized.ok) {
    assert.ok(
      normalized.keys.includes(primaryTemplateKey("pillow", normalized.keys)),
      "primary key must be one of the sizes the template serves",
    );
  }
}
assert.equal(normalizeTemplateKeys("pillow", []).ok, false, "empty membership is refused");
assert.ok(!templateServesKey({ key: "S", keys: ["M"] }, "S"), "membership overrides the primary");

const membership = read("lib/filling-templates/membership.ts");
const insertAt = membership.indexOf('.upsert(');
const deleteAt = membership.indexOf('.delete()');
assert.ok(insertAt > 0 && deleteAt > 0, "setTemplateKeys both adds and prunes");
assert.ok(
  insertAt < deleteAt,
  "setTemplateKeys must ADD before it prunes: there is no transaction between the " +
    "two round trips, and a failure after a wholesale delete leaves a template " +
    "serving no size at all — invisible everywhere, with nothing to rebuild it from",
);
assert.match(
  membership,
  /clearDefaultsOutsideMembership/,
  "rescoping clears the Default Filling Template of any card it stops serving",
);

const configurePage = read("app/[lang]/settings/inventory/configure/[card]/page.tsx");
assert.doesNotMatch(
  configurePage,
  /const existing = templates\.find\(\(t\) => t\.name === trimmed\)/,
  "saveTemplate must not resolve its target by NAME: the typed name may belong to " +
    "another template, and writing there would overwrite a recipe — and rewrite the " +
    "size membership — of something the operator never opened",
);
assert.match(
  configurePage,
  /if \(selectedId !== ""\) \{\s*\n\s*await putTemplatePlacements\(selectedId, trimmed\)/,
  "saveTemplate targets the open template and carries the name as a rename",
);

assert.match(
  configurePage,
  /placements: spatialRows\(\)[^}]*\}\),\s*\n\s*\},\s*\n\s*\);/,
  "the fork request sends the editor's current recipe",
);
const forkRoute = read(
  "app/[lang]/settings/inventory/configure/templates/[templateId]/fork/route.ts",
);
assert.match(
  forkRoute,
  /parsed\.data\.placements/,
  "the fork route prefers the posted recipe over the stored rows — an operator forks " +
    "mid-edit, so copying what is stored would discard the very changes that prompted it",
);

for (const [path, needle] of [
  ["lib/results/assign-prep.ts", "templateIdsForKey"],
  ["app/api/results/[id]/assign/route.ts", "loadTemplateKeys"],
  ["app/api/mp-config/assist/route.ts", "templateIdsForKey"],
  ["app/api/mp-config/assist/context/route.ts", "loadTemplateKeys"],
  ["app/api/shop/customize/route.ts", "templateIdsForKey"],
  ["app/[lang]/settings/inventory/configure/unpromoted/route.ts", "templateIdsForKey"],
  ["app/[lang]/settings/inventory/actions.ts", "templateIdsForKey"],
] as const) {
  assert.match(read(path), new RegExp(needle), `${path} scopes filling templates by membership`);
}

assert.doesNotMatch(
  read("app/api/shop/customize/route.ts"),
  /\.eq\("kind", "bolster"\)\s*\n\s*\.eq\("key", bolsterVariant\)/,
  "the shopper bolster preview must not filter Filling Templates on the primary key",
);

console.log("filling-template membership self-check ok");
