#!/usr/bin/env node
// Totals of eslint-suppressions.json, ESLint's bulk-suppression baseline: the
// violations that existed when the lint rails went in (agent-rails PRD,
// decision 2). The baseline only goes down; this shows by how much.
//
//   node scripts/lint-baseline.mjs                    total per rule
//   node scripts/lint-baseline.mjs --against          and the change against origin/main
//   node scripts/lint-baseline.mjs --against <ref>    ... against <ref> (or --against=<ref>)
//
//   node scripts/lint-baseline.mjs --resolve          settle a merge conflict in the file
//
// A ref that exists but has no baseline file counts as zero, and says so; a
// ref that does not exist is named as such, not read as zero. Reporting
// exits 0 on every outcome, problems included, so nothing gates on it by
// accident; slice 03's hooks do the gating.
//
// --resolve is the one mode that writes. After a merge leaves conflict
// markers in the baseline, Claude can neither edit the file (settings.json
// denies it) nor take one side (guard.mjs blocks checkout over changes), and
// every hook run would fail. It reads the three index stages of the file and
// writes their merge in ESLint's format, never a count above what either
// side holds (see mergeBaselines). It does not stage the file. Outside a
// conflict it says so, changes nothing and exits 1.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const FILE = "eslint-suppressions.json";
const DEFAULT_REF = "origin/main";

// The file is { "<path>": { "<ruleId>": { "count": n } } }.
export function totalsByRule(baseline) {
  const totals = {};
  for (const rules of Object.values(baseline ?? {})) {
    for (const [rule, { count }] of Object.entries(rules)) {
      totals[rule] = (totals[rule] ?? 0) + count;
    }
  }
  return totals;
}

// Returns the ref named by `--against`, `--against <ref>` or
// `--against=<ref>`, or null when there is no `--against`.
export function parseAgainst(argv) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--against=")) return arg.slice("--against=".length) || DEFAULT_REF;
    if (arg === "--against") {
      const next = argv[i + 1];
      return next && !next.startsWith("--") ? next : DEFAULT_REF;
    }
  }
  return null;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
}

// { baseline } or { problem } in words.
function readAt(ref) {
  try {
    git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  } catch {
    return { problem: `no commit or branch named "${ref}" (fetch it, or check the spelling)` };
  }
  let text;
  try {
    text = git(["show", `${ref}:${FILE}`]);
  } catch {
    return { baseline: {}, note: `${ref} has no ${FILE}; counted as zero` };
  }
  try {
    return { baseline: JSON.parse(text) };
  } catch {
    return { problem: `${FILE} at ${ref} is not valid JSON` };
  }
}

function readWorkingTree() {
  let text;
  try {
    text = readFileSync(FILE, "utf8");
  } catch {
    return { problem: `no ${FILE} in ${process.cwd()} (run from the repo root)` };
  }
  try {
    return { baseline: JSON.parse(text) };
  } catch (e) {
    return { problem: `${FILE} is not valid JSON: ${e.message}` };
  }
}

/**
 * The merge of two baselines that share `base`, per path and rule: on both
 * sides, the lower count; in the base and gone from either side, gone (that
 * side fixed it, or moved or deleted the file); not in the base and on one
 * side only, kept (that side's new file or its owner-approved raise); not in
 * the base and on both, the lower. No count ends above both sides'.
 */
export function mergeBaselines(base, ours, theirs) {
  const merged = {};
  for (const file of new Set([...Object.keys(ours ?? {}), ...Object.keys(theirs ?? {})])) {
    const rules = new Set([...Object.keys(ours?.[file] ?? {}), ...Object.keys(theirs?.[file] ?? {})]);
    for (const rule of rules) {
      const o = ours?.[file]?.[rule]?.count;
      const t = theirs?.[file]?.[rule]?.count;
      const inBase = base?.[file]?.[rule] !== undefined;
      let count;
      if (o !== undefined && t !== undefined) count = Math.min(o, t);
      else if (inBase) continue;
      else count = o ?? t;
      (merged[file] ??= {})[rule] = { count };
    }
  }
  return merged;
}

// ESLint's own format: keys sorted at every level, two-space indent, no
// trailing newline (as .claude/hooks/verify.mjs writes it too).
const sortKeys = (v) =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
export const formatBaseline = (b) => JSON.stringify(sortKeys(b), null, 2);

function resolve() {
  let root;
  try {
    root = git(["rev-parse", "--show-toplevel"]).trim();
  } catch {
    console.log("lint-baseline: not inside a git repository");
    return 1;
  }
  const unmerged = (() => {
    try {
      return git(["-C", root, "ls-files", "-u", "--", FILE]).trim();
    } catch {
      return "";
    }
  })();
  if (!unmerged) {
    console.log(`lint-baseline: ${FILE} is not in a merge conflict; nothing changed`);
    return 1;
  }
  const stage = (n) => {
    try {
      return JSON.parse(git(["-C", root, "show", `:${n}:${FILE}`]));
    } catch {
      return {};
    }
  };
  const merged = mergeBaselines(stage(1), stage(2), stage(3));
  writeFileSync(path.join(root, FILE), formatBaseline(merged));
  console.log(`lint-baseline: wrote the merged ${FILE} (${Object.keys(merged).length} files). Check it, then \`git add ${FILE}\`.`);
  return 0;
}

function main(argv) {
  if (argv.includes("--resolve")) {
    process.exitCode = resolve();
    return;
  }
  const current = readWorkingTree();
  if (current.problem) return console.log(`lint-baseline: ${current.problem}`);

  const ref = parseAgainst(argv);
  let then = {};
  if (ref) {
    const old = readAt(ref);
    if (old.problem) return console.log(`lint-baseline: ${old.problem}`);
    if (old.note) console.log(`lint-baseline: ${old.note}`);
    then = totalsByRule(old.baseline);
  }

  const now = totalsByRule(current.baseline);
  const rules = [...new Set([...Object.keys(now), ...Object.keys(then)])].sort(
    (a, b) => (now[b] ?? 0) - (now[a] ?? 0) || a.localeCompare(b),
  );

  const width = Math.max(5, ...rules.map((r) => r.length));
  const sum = (t) => Object.values(t).reduce((a, b) => a + b, 0);
  const delta = (n) => (n > 0 ? `+${n}` : String(n));
  const row = (name, n, d) => `${name.padEnd(width)}  ${String(n).padStart(7)}${ref ? `  ${d.padStart(7)}` : ""}`;

  console.log(row("rule", "count", ref ? `vs ${ref}` : ""));
  for (const rule of rules) {
    console.log(row(rule, now[rule] ?? 0, delta((now[rule] ?? 0) - (then[rule] ?? 0))));
  }
  console.log(row("total", sum(now), delta(sum(now) - sum(then))));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
