import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const src = readFileSync(
  join(ROOT, "app/[lang]/shop/[slug]/product-detail-client.tsx"),
  "utf8",
);

assert.match(src, /MobileStickyActionBar/);

assert.match(src, /snap-x/);
const code = ts.transpileModule(src, {
  fileName: "product-detail-client.tsx",
  compilerOptions: { removeComments: true, jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ESNext },
}).outputText;
assert.doesNotMatch(
  code,
  /touch-action|touchAction|touch-(none|auto|pan|pinch|manipulation)/,
  "no touch-action on the gallery: the default lets a one-finger drag pan the snap track",
);

assert.doesNotMatch(src, /images\.slice\(0,\s*\d/);
assert.doesNotMatch(src, /\.slice\(0,\s*5\)/);

console.log("pdp-mobile.check.ts: ok");
