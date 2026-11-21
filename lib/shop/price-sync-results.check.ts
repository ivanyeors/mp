import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const DIRS = ["app", "lib", "components", "hooks", "scripts"];
const RAW_ALLOWED = new Set(["lib/shop/price-sync.ts", "scripts/costings-sync-prices.ts"]);
const RAW = /\bsyncVariantPricesFromCostings\b/g;
const REPRICE = /\brepriceFromCostings\b/g;
const ASSIGNED = /(?:^|[^=!<>])=\s*await\s+$|\.\.\.\(\s*await\s+$/;
const CHAINED = /^\s*\.\s*(catch|then|finally)\b/;
const IMPORT_OPEN = /\bimport\s*\{[^{}]*$/;
const IMPORT_NEXT = /^\s*[,}]/;

function closeParen(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return i;
  }
  return src.length;
}

const lineOf = (src: string, at: number) => src.slice(0, at).split("\n").length;
const declared = (src: string, at: number) => /\bfunction\s+$/.test(src.slice(Math.max(0, at - 20), at));

export function violations(file: string, src: string): string[] {
  const found: string[] = [];
  if (!RAW_ALLOWED.has(file)) {
    for (const m of src.matchAll(RAW)) {
      found.push(
        `${file} line ${lineOf(src, m.index!)}: names syncVariantPricesFromCostings; use repriceFromCostings and keep its result`,
      );
    }
  }
  for (const m of src.matchAll(REPRICE)) {
    const at = m.index!;
    const end = at + m[0].length;
    const before = src.slice(Math.max(0, at - 400), at);
    const rest = src.slice(end);
    if (declared(src, at)) continue;
    if (IMPORT_OPEN.test(before) && IMPORT_NEXT.test(rest)) continue;
    const isCall = rest.startsWith("(");
    if (isCall && ASSIGNED.test(before.slice(-200)) && !CHAINED.test(src.slice(closeParen(src, end) + 1))) continue;
    found.push(
      `${file} line ${lineOf(src, at)}: repriceFromCostings may only be imported by its own name or called as const x = await …, x = await … or ...(await …)`,
    );
  }
  return found;
}

const REVIEW_LINES = [
  "await Promise.all(ids.map((id) => syncVariantPricesFromCostings(id)));",
  "await Promise.all(ids.map((id) => syncVariantPricesFromCostings(id).catch((e) => console.error(e))));",
  "const r = await syncVariantPricesFromCostings(id).catch((e) => null);",
  "return syncVariantPricesFromCostings(id).catch(console.error);",
];
for (const line of REVIEW_LINES) {
  assert.equal(violations("lib/ecommerce/x.ts", line).length, 1, `should fail: ${line}`);
  const viaReprice = line.replaceAll("syncVariantPricesFromCostings(id)", "repriceFromCostings(p)");
  assert.equal(violations("lib/ecommerce/x.ts", viaReprice).length, 1, `should fail: ${viaReprice}`);
}
assert.equal(violations("app/api/x/route.ts", "  const r = await syncVariantPricesFromCostings(id);").length, 1);
assert.deepEqual(violations("scripts/costings-sync-prices.ts", "  const r = await syncVariantPricesFromCostings(id);"), []);
assert.deepEqual(violations("lib/shop/price-sync.ts", "rows.map((p) => syncVariantPricesFromCostings(p.id).catch(f))"), []);
assert.deepEqual(violations("lib/x.ts", "  const w = await repriceFromCostings({ id, name });"), []);
assert.deepEqual(violations("lib/x.ts", "  w = await repriceFromCostings({ id, name });"), []);
assert.deepEqual(violations("lib/x.ts", "  w.push(...(await repriceFromCostings({ id, name })));"), []);
assert.deepEqual(violations("lib/x.ts", "  w.push(\n    ...(await repriceFromCostings({ id, name })),\n  );"), []);
assert.deepEqual(violations("lib/x.ts", "export async function repriceFromCostings(p) {}"), []);
for (const bad of [
  "  await repriceFromCostings(p);",
  "  void repriceFromCostings(p);",
  "  return repriceFromCostings(p);",
  "  f(repriceFromCostings(p));",
  "  const ok = a, w = repriceFromCostings(p);",
  "  if (x === await repriceFromCostings(p)) {}",
  "  const w = await repriceFromCostings(p).then((w) => w);",
]) {
  assert.equal(violations("lib/x.ts", bad).length, 1, `should fail: ${bad}`);
}
for (const bad of [
  "await Promise.all(ids.map(syncVariantPricesFromCostings));",
  "await Promise.all(rows.map(repriceFromCostings));",
  'import { syncVariantPricesFromCostings as reprice } from "@/lib/shop/price-sync"; await reprice(id);',
  'import { repriceFromCostings as r } from "@/lib/shop/price-sync";',
  'import { syncVariantPricesFromCostings } from "@/lib/shop/price-sync";',
  "const f = repriceFromCostings;",
  'export { repriceFromCostings } from "@/lib/shop/price-sync";',
]) {
  assert.equal(violations("lib/ecommerce/x.ts", bad).length, 1, `should fail: ${bad}`);
}
assert.deepEqual(violations("lib/x.ts", 'import { repriceFromCostings } from "@/lib/shop/price-sync";'), []);
assert.deepEqual(
  violations("lib/x.ts", 'import {\n  productName,\n  repriceFromCostings,\n  type X,\n} from "@/lib/shop/price-sync";'),
  [],
);
assert.deepEqual(
  violations("scripts/costings-sync-prices.ts", 'import {\n  loadCostingsPriceMaps,\n  syncVariantPricesFromCostings,\n} from "@/lib/shop/price-sync";'),
  [],
);

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
let reprices = 0;
for (const path of files) {
  const src = readFileSync(path, "utf8");
  reprices += [...src.matchAll(REPRICE)].length;
  problems.push(...violations(relative(ROOT, path), src));
}

assert.ok(reprices >= 8, `expected to find the repriceFromCostings call sites, found ${reprices}`);
assert.deepEqual(
  problems,
  [],
  `A Costings reprice that drops its problems tells staff a price was saved when Stripe may still charge the old one:\n${problems.join("\n")}`,
);

console.log(`price-sync-results.check.ts: ok (${reprices} repriceFromCostings matches)`);
