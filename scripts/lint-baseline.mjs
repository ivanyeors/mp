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
//   node scripts/lint-baseline.mjs --prune-staged     the pre-commit step (.githooks/pre-commit)
//
// A ref that exists but has no baseline file counts as zero, and says so; a
// ref that does not exist is named as such, not read as zero. Reporting
// exits 0 on every outcome, problems included, so nothing gates on it by
// accident; slice 03's hooks do the gating.
//
// --prune-staged makes every commit carry a pruned baseline (owner,
// 2026-11-22). verify.mjs's edit hook does not prune, so without it a commit
// made before a task or stop run carries counts above what its files have,
// which `pnpm lint` fails as unused suppressions. For each code file being
// committed that has an entry in the staged baseline, it lints the STAGED
// content with ESLint and lowers that entry to what it has (ESLint's prune:
// a count only falls, a rule with none left goes); a file deleted in the
// commit loses its entry. The result goes in the index as the baseline and
// nothing else is staged: it starts from the index's baseline, not the
// working file, so a count lowered in the working file for a file not in
// this commit stays out of it. The working file's entries for those files
// are lowered to what was committed, never raised, so the per-commit ratchet
// holds there too. It never fails the commit: if it cannot run it says so,
// and CI's lint is the backstop. A run of verify.mjs writing the working
// file at the same moment can lose one of the two writes; both only lower
// or restore HEAD's amount, and the next task or stop run redoes either.
//
// --resolve and --prune-staged are the modes that write. After a merge leaves conflict
// markers in the baseline, Claude can neither edit the file (settings.json
// denies it) nor take one side (guard.mjs blocks checkout over changes), and
// every hook run would fail. It reads the three index stages of the file and
// writes their merge in ESLint's format, never a count above what either
// side holds (see mergeBaselines). It does not stage the file. Outside a
// conflict it says so, changes nothing and exits 1.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
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
 * The three-way merge of two baselines that share `base`, per path and rule.
 * A side equal to the base yields to the other side, a removal included (so
 * the owner's raise on one side survives a branch that did not touch it).
 * Both changed: the lower count, and removed if either removed it (that side
 * fixed it, or moved or deleted the file). Not in the base: one side's new
 * entry is kept, both sides' the lower. No count ends above the higher side.
 */
export function mergeBaselines(base, ours, theirs) {
  const merged = {};
  const files = new Set([...Object.keys(base ?? {}), ...Object.keys(ours ?? {}), ...Object.keys(theirs ?? {})]);
  for (const file of files) {
    const rules = new Set([...Object.keys(base?.[file] ?? {}), ...Object.keys(ours?.[file] ?? {}), ...Object.keys(theirs?.[file] ?? {})]);
    for (const rule of rules) {
      const b = base?.[file]?.[rule]?.count;
      const o = ours?.[file]?.[rule]?.count;
      const t = theirs?.[file]?.[rule]?.count;
      let count;
      if (o === b) count = t;
      else if (t === b) count = o;
      else if (o === undefined || t === undefined) count = undefined;
      else count = Math.min(o, t);
      if (count !== undefined) (merged[file] ??= {})[rule] = { count };
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

// The files verify.mjs lints.
const CODE = /\.(ts|tsx|mts|js|jsx|mjs)$/;

/**
 * Lower `file`'s entry in `baseline` to `cap` ({ rule: { count } }, or
 * undefined for none), in place: a count above the cap falls to it, a rule
 * the cap does not hold goes, and so does an entry left empty. Never raises.
 */
export function lowerEntry(baseline, file, cap) {
  const entry = baseline[file];
  if (!entry) return;
  for (const rule of Object.keys(entry)) {
    const max = cap?.[rule]?.count ?? 0;
    if (max === 0) delete entry[rule];
    else if (entry[rule].count > max) entry[rule] = { count: max };
  }
  if (Object.keys(entry).length === 0) delete baseline[file];
}

// ESLint counts a suppressed violation the same way: an error with a rule id.
const countByRule = (messages) => {
  const counts = {};
  for (const m of messages) if (m.severity === 2 && m.ruleId) (counts[m.ruleId] ??= { count: 0 }).count++;
  return counts;
};

async function pruneStaged() {
  const root = git(["rev-parse", "--show-toplevel"]).trim();
  const at = (args, input) =>
    execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      input,
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
  let staged;
  try {
    staged = JSON.parse(at(["show", `:${FILE}`]));
  } catch {
    return;
  }
  const withEntry = (filter) =>
    at(["diff", "--cached", "--no-renames", "--name-only", "-z", `--diff-filter=${filter}`])
      .split("\0")
      .filter((f) => f && CODE.test(f) && staged[f]);
  const committed = withEntry("AMT");
  const deleted = withEntry("D");
  if (committed.length === 0 && deleted.length === 0) return;

  // This checkout's own eslint only: one installed elsewhere on the machine
  // resolves too, and lints by a config it cannot load.
  const own = path.join(root, "node_modules/eslint");
  if (!existsSync(path.join(own, "package.json"))) {
    console.error(`lint-baseline: no eslint in ${root}/node_modules, so ${FILE} in this commit is not pruned. Run \`pnpm install --frozen-lockfile\`.`);
    return;
  }
  const { ESLint } = createRequire(path.join(root, "package.json"))(own);
  const eslint = new ESLint({ cwd: root });
  const lowered = [];
  const lower = (f, cap) => {
    const was = JSON.stringify(staged[f]);
    lowerEntry(staged, f, cap);
    if (JSON.stringify(staged[f]) !== was) lowered.push(f);
  };
  for (const f of committed) {
    const [result] = await eslint.lintText(at(["show", `:${f}`]), { filePath: path.join(root, f), warnIgnored: false });
    // A file ESLint ignores or cannot parse keeps its entry, as verify.mjs keeps it.
    if (result && result.fatalErrorCount === 0) lower(f, countByRule(result.messages));
  }
  for (const f of deleted) lower(f, undefined);
  if (lowered.length === 0) return;
  const blob = at(["hash-object", "-w", "--stdin"], formatBaseline(staged)).trim();
  at(["update-index", "--cacheinfo", `100644,${blob},${FILE}`]);

  const workingFile = path.join(root, FILE);
  let working = null;
  try {
    working = JSON.parse(readFileSync(workingFile, "utf8"));
  } catch {}
  if (working) {
    const was = formatBaseline(working);
    for (const f of lowered) lowerEntry(working, f, staged[f]);
    if (formatBaseline(working) !== was) {
      const tmp = `${workingFile}.${process.pid}.tmp`;
      writeFileSync(tmp, formatBaseline(working));
      renameSync(tmp, workingFile);
    }
  }
  console.error(`lint-baseline: lowered ${FILE} in this commit for ${lowered.join(", ")}`);
}

function main(argv) {
  if (argv.includes("--resolve")) {
    process.exitCode = resolve();
    return;
  }
  if (argv.includes("--prune-staged")) {
    pruneStaged().catch((e) => console.error(`lint-baseline: ${FILE} in this commit is not pruned: ${e?.message ?? e}`));
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
