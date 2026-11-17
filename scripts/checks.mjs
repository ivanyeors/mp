#!/usr/bin/env node
// Run the `*.check.ts` invariant scripts: assert-based guards, many written
// after a review found the same thing broken once already. For years they ran
// only when someone remembered `npx tsx <file>`, and eleven had drifted from
// the code by the time this runner put them in CI.
//
//   pnpm checks                   every check that needs no live service
//   pnpm checks --live            ...and the ones that need a database or site
//   pnpm checks <file>...         the checks for these files: a `*.check.ts`
//                                 runs itself; any other file runs the checks
//                                 in its own folder (what the hooks pass)
//
// Exits 1 if any check fails, printing the tail of each failure.

import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const TSX = path.join(ROOT, "node_modules/.bin/tsx");

// These read a real Supabase project or fetch a running site, so they fail
// anywhere without `.env.local`. Run them with --live after a migration or
// seed, the way their headers describe. answer-lede-coverage also WRITES
// `products.content` (it fills in missing seo_answer), and home-page-faq
// inserts and deletes `landing_sections` rows: point --live at the database
// you mean.
const LIVE = new Set([
  "app/[lang]/mp-config/configurator-page-faq.check.ts",
  "app/[lang]/shop/[slug]/pdp-page-faq.check.ts",
  "components/page-faq/page-faq-section.check.ts",
  "components/sections/landing/home-page-faq.check.ts",
  "components/settings/settings-faq.check.ts",
  "lib/marketing-consent/unsubscribe-route.check.ts",
  "lib/page-faq/page-faq.integration.check.ts",
  "lib/rules-engine/api-roundtrip.check.ts",
  "lib/seo/answer-lede-coverage.check.ts",
  "lib/seo/page-faq-staging-signoff.check.ts",
]);

const args = process.argv.slice(2);
const live = args.includes("--live");
const named = args.filter((a) => !a.startsWith("--"));

function allChecks() {
  return execFileSync("git", ["ls-files", "*.check.ts"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

function checksFor(file) {
  const rel = path.relative(ROOT, path.resolve(ROOT, file)).split(path.sep).join("/");
  if (rel.endsWith(".check.ts")) return existsSync(path.join(ROOT, rel)) ? [rel] : [];
  const dir = path.dirname(rel);
  if (!existsSync(path.join(ROOT, dir))) return [];
  return readdirSync(path.join(ROOT, dir))
    .filter((f) => f.endsWith(".check.ts"))
    .map((f) => (dir === "." ? f : `${dir}/${f}`));
}

const wanted = [...new Set(named.length ? named.flatMap(checksFor) : allChecks())];
const skipped = live ? [] : wanted.filter((f) => LIVE.has(f));
const run = wanted.filter((f) => live || !LIVE.has(f));

if (!existsSync(TSX)) {
  console.error("checks: node_modules/.bin/tsx is missing. Run `pnpm install` first.");
  process.exit(1);
}
if (run.length === 0) {
  if (named.length === 0) console.log("checks: none found");
  process.exit(0);
}

function runOne(file) {
  return new Promise((resolve) => {
    const child = spawn(TSX, [file], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), 120_000);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ file, ok: code === 0, out: signal ? `${out}\n(killed after 120s)` : out });
    });
  });
}

const queue = [...run];
const results = [];
await Promise.all(
  Array.from({ length: Math.min(availableParallelism(), 6, run.length) }, async () => {
    while (queue.length) results.push(await runOne(queue.shift()));
  }),
);

const failed = results.filter((r) => !r.ok).sort((a, b) => a.file.localeCompare(b.file));
for (const r of failed) {
  const tail = r.out.split("\n").filter((l) => l.trim() && !/^\s+at /.test(l)).slice(-15);
  console.error(`\nFAIL ${r.file}\n${tail.map((l) => `  ${l}`).join("\n")}`);
}
console.log(
  `\nchecks: ${results.length - failed.length} passed, ${failed.length} failed` +
    (skipped.length ? `, ${skipped.length} skipped (need --live)` : ""),
);
process.exit(failed.length ? 1 : 0);
