/**
 * Slice 01 self-check: page-builder glossary terms are defined in CONTEXT.md.
 * Run: npx tsx --env-file=.env.local lib/page-builder/glossary.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ctx = readFileSync(join(process.cwd(), "CONTEXT.md"), "utf8");

/** Each new term, and a phrase its definition must contain. */
const TERMS: Array<[string, RegExp]> = [
  ["**Landing section**", /landing_sections/],
  ["**Section draft**", /nullable draft columns/],
  ["**Publish** (landing)", /atomically/],
  ["**Publish snapshot**", /[Aa]ppend-only/],
  ["**Preview mode**", /no second renderer/],
];

for (const [term, mustSay] of TERMS) {
  const start = ctx.indexOf(`\n${term}:\n`);
  assert.ok(start !== -1, `${term} is defined in CONTEXT.md`);

  // The entry runs to the next blank-line-separated bold term.
  const body = ctx.slice(start + term.length + 3).split(/\n\n/)[0];
  assert.match(body, mustSay, `${term} definition mentions ${mustSay}`);
  assert.match(body, /^_Avoid_: /m, `${term} has an _Avoid_ line`);
}

// Terms live beside Product Visualize in ## Marketing, not in an invented section.
const marketing = ctx.indexOf("\n## Marketing\n");
const afterMarketing = ctx.indexOf("\n## ", marketing + 1);
assert.ok(marketing !== -1, "## Marketing section exists");
for (const [term] of TERMS) {
  const at = ctx.indexOf(`\n${term}:\n`);
  assert.ok(at > marketing && at < afterMarketing, `${term} sits inside ## Marketing`);
}

// Collisions the Avoid lines must name, so the terms cannot blur into existing ones.
const landing = ctx.slice(ctx.indexOf("\n**Landing section**:\n")).split(/\n\n/)[0];
assert.match(landing, /bare \*\*Section\*\*/, "Landing section warns off bare Section");

const publish = ctx.slice(ctx.indexOf("\n**Publish** (landing):\n")).split(/\n\n/)[0];
assert.match(publish, /\*\*Rule graph\*\* publish/, "Publish distinguishes Rule graph publish");
assert.match(publish, /\*\*Sellable item\*\*/, "Publish distinguishes storefront publishing");
assert.match(publish, /\*\*Promote\*\*/, "Publish distinguishes Promote");

const preview = ctx.slice(ctx.indexOf("\n**Preview mode**:\n")).split(/\n\n/)[0];
assert.match(preview, /customisation preview/, "Preview mode distinguishes the customisation preview");
assert.match(preview, /draft mode/, "Preview mode records why Next draft mode is not used");

// Bare "Section" still means the pillow filling compartment — the new terms must not have moved it.
assert.match(ctx, /^\*\*Section\*\* \(pillow fillings\):$/m, "pillow Section entry is intact");

// Flagged ambiguities record the two decisions later slices must not relitigate.
const ambiguities = ctx.slice(ctx.indexOf("\n## Flagged ambiguities\n"));
assert.match(ambiguities, /Landing draft storage — resolved:/, "draft storage decision recorded");
assert.match(ambiguities, /Landing preview transport — resolved:/, "preview transport decision recorded");
assert.match(ambiguities, /per-row drafts preserve the concurrency/, "draft storage reason recorded");

console.log(`landing-glossary self-check ok (${TERMS.length}/${TERMS.length} terms)`);
