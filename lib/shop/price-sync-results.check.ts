import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const DIRS = ["app", "lib", "components", "hooks", "scripts"];
const CALL = /\b(syncVariantPricesFromCostings|repriceFromCostings)\(/g;
const KEPT_PREFIX = /(=|return|\(|,|\.\.\.|=>)\s*(await\s+)?$/;
const SWALLOW = /^\s*\.(catch|then)\(\s*\(\s*\)\s*=>/;

function closeParen(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return i;
  }
  return src.length;
}

export function discardedCalls(src: string): string[] {
  const found: string[] = [];
  for (const m of src.matchAll(CALL)) {
    const at = m.index!;
    const lineStart = src.lastIndexOf("\n", at) + 1;
    const prefix = src.slice(lineStart, at);
    if (/\bfunction\s+$/.test(prefix) || /^\s*(import|\/\/|\*)/.test(prefix) || /`[^`]*$/.test(prefix)) continue;
    const line = src.slice(0, at).split("\n").length;
    const after = src.slice(closeParen(src, at + m[0].length - 1) + 1);
    if (!KEPT_PREFIX.test(src.slice(Math.max(0, at - 200), at))) found.push(`line ${line}: result of ${m[1]} is not kept`);
    else if (SWALLOW.test(after)) found.push(`line ${line}: ${m[1]}'s error is swallowed`);
  }
  return found;
}

assert.deepEqual(discardedCalls("  await syncVariantPricesFromCostings(id).catch(() => {});"), [
  "line 1: result of syncVariantPricesFromCostings is not kept",
]);
assert.equal(discardedCalls("  const r = await syncVariantPricesFromCostings(id).catch(() => {});").length, 1);
assert.equal(discardedCalls("  void repriceFromCostings({ id, name }, 'x');").length, 1);
assert.equal(discardedCalls("  await repriceFromCostings({ id, name }, 'x');").length, 1);
assert.deepEqual(discardedCalls("  const w = await repriceFromCostings({ id, name }, 'x');"), []);
assert.deepEqual(discardedCalls("  w.push(...(await repriceFromCostings({ id, name }, 'x')));"), []);
assert.deepEqual(discardedCalls("  rows.map((p) => syncVariantPricesFromCostings(p.id).catch((err) => toProblem(err)))"), []);
assert.deepEqual(discardedCalls("  rows.map((p) =>\n    syncVariantPricesFromCostings(p.id).catch(\n (err) => toProblem(err)))"), []);
assert.equal(discardedCalls("  x = 1;\n  await syncVariantPricesFromCostings(id);").length, 1);
assert.equal(discardedCalls("  if (a) {\n    await repriceFromCostings(p, 'x');\n  }").length, 1);

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(name) && !/\.(test|check)\.tsx?$/.test(name)) out.push(path);
  }
}

const files: string[] = [];
for (const dir of DIRS) walk(join(ROOT, dir), files);

const problems: string[] = [];
let calls = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  calls += [...src.matchAll(CALL)].length;
  for (const p of discardedCalls(src)) problems.push(`${relative(ROOT, file)} ${p}`);
}

assert.ok(calls >= 8, `expected to find the price-sync call sites, found ${calls}`);
assert.deepEqual(
  problems,
  [],
  `A Costings reprice that drops its problems tells staff a price was saved when Stripe may still charge the old one. Keep the result and carry stripeWarnings to the route's response:\n${problems.join("\n")}`,
);

console.log(`price-sync-results.check.ts: ok (${calls} call sites)`);
