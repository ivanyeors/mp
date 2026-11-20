#!/usr/bin/env node
// Make the checks mandatory, not a request in a prompt.
//
//   verify.mjs edit   PostToolUse on Edit|Write: eslint on the file just written.
//   verify.mjs task   TaskCompleted: eslint, then the tests and checks, for what changed.
//   verify.mjs stop   Stop: the same, before the session may finish.
//
// A failure exits 2, which is what sends Claude back to fix it. Most tools
// exit 1 on failure, and Claude Code treats 1 as a warning and carries on, so
// every failure here is translated to 2 on purpose, a crash of this script
// included.
//
// "What changed" is every file that differs from origin/main: committed on
// this branch, staged, unstaged or untracked. The task and stop runs remember
// the last state that passed and do nothing until something changes, so a
// session that is only talking costs nothing. A pass is recorded only when
// the tree at the end of the run is the tree that was checked (apart from the
// baseline the run itself pruned); if something changed meanwhile, nothing is
// recorded and the next run looks again. They give up after three failed
// attempts on the same state, so a failure the change didn't cause can't hold
// a session forever; the user is told instead. A lint failure is reported at
// once, before the tests run.
//
// Lint runs against the baseline, eslint-suppressions.json (agent-rails PRD,
// decision 2): ESLint's bulk suppressions, a count per file and rule of the
// violations that existed when the rails went in. Every run prunes, so a
// count that fell is lowered in the file without the agent hearing about it,
// and a count that rose fails. ESLint then lists every occurrence of that
// rule in the file, the old ones too, so the hook adds one line per rule
// saying how many it allows and how many are there now.
//
// The baseline is keyed by path, and an entry can go missing: a move (git mv
// or a plain mv), several moves in a row, a move back, a prune run between a
// move and the hook. The rule: a file with no working entry gets what HEAD's
// committed baseline holds for the file git says it was at HEAD (the same
// path, or the path it was renamed from since HEAD); a file that is new since
// HEAD gets nothing; and one HEAD path's allowance goes to one file. "What git
// says" is `git diff -M -B HEAD` on a scratch copy of the index with every
// loose code file staged (the real index is never touched). When the working
// baseline still holds the old path's entry, that one moves (its counts may
// already be lower). The same run's prune lowers a restored entry to what the
// file has. This is the one write to the file that is not ESLint's own, and
// existing working entries are never touched by it.
//
// One allowance, one file: content cannot say which file "is" the old one
// (git does not break files under 400 bytes for -B, and a moved file edited a
// lot drifts at any size), so the hook remembers what it gave away. When it
// gives a file F the entry of a different path P, it records the claim F -> P
// (with F's content, so a later move of F is found again by git's rename
// detection between two small trees); while that claim stands, P's allowance
// goes to no other file, the file re-created at P included. A claim ends with
// its file, with its entry, or when the move is committed with the baseline.
// The claims live in this checkout's git directory. If the move and the new
// file at the old path both happen before the first hook run, -B tells them
// apart for large files; for small ones the old path keeps its entry and the
// moved file gets none, which fails closed.
//
// Known limits: a move committed without the baseline's change, in a clone
// whose working baseline is then HEAD's, is not healed (CI is red on that
// commit anyway); and if the claims file is lost (deleted by hand), a small
// or drifted file re-created at a moved file's old path can get the
// allowance twice, which the totals check in scripts/pr-risk.mjs sees.
//
// A baseline with merge conflict markers cannot be read: every run says to
// resolve it with `node scripts/lint-baseline.mjs --resolve`.
//
// A file that does not parse reports a fatal error with no rule id, which
// ESLint's prune reads as "every suppression unused" and deletes the file's
// entry. Its entry is put back exactly as it was before the run. Nothing here
// ever raises a count, and guard.mjs stops Claude from doing it by hand.
//
// edit lints the file in its own checkout: a worker in a worktree under
// .claude/worktrees/ is linted by that worktree's config and baseline (the
// main clone's config ignores that folder), and is told if that worktree has
// no node_modules. task and stop judge the project directory.
//
// Without node_modules (a fresh clone, a cloud session whose install failed)
// the checks cannot run, and that is never a silent pass. A session that
// changed no code file still costs nothing. Otherwise task and stop exit 2 and
// say to install, under the same three-attempts rule, so a machine that cannot
// install tells the user the checks did not run instead of holding the
// session; edit says so once per session rather than on every edit. Once a
// machine has given up for want of node_modules, a new state is not blocked
// again: stop tells the user once for it and lets the session finish.
// "Changed" is the branch against origin/main, so a clone with no
// node_modules on a branch that already differs from main is told to install
// even if this session changed nothing; that is deliberate, because the
// alternative is a silent pass.

import { createHash, randomBytes } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const fail = (msg) => {
  process.stderr.write(`${msg}\n`);
  process.exit(2);
};
process.on("uncaughtException", (e) => fail(`verify.mjs itself failed, so the checks did not run: ${e?.stack ?? e}`));

const mode = process.argv[2];
const started = Date.now();
let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {}

const CODE = /\.(ts|tsx|mts|js|jsx|mjs)$/;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const tail = (s, n = 40) => s.split("\n").filter((l) => l.trim()).slice(-n).join("\n");

const gitAt = (dir, args, env = {}) => {
  try {
    const out = execFileSync("git", ["-C", dir, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, ...env },
    });
    return { ok: true, out };
  } catch {
    return { ok: false, out: "" };
  }
};
const toplevel = (dir) => gitAt(dir, ["rev-parse", "--show-toplevel"]).out.trim() || null;
const commonDir = (dir) => {
  const d = gitAt(dir, ["rev-parse", "--git-common-dir"]).out.trim();
  return d ? path.resolve(dir, d) : null;
};

const PROJECT = toplevel(process.env.CLAUDE_PROJECT_DIR || input.cwd || ".");
if (!PROJECT) process.exit(0);

let ROOT = PROJECT;
let editFile = null;
if (mode === "edit") {
  const file = input.tool_input?.file_path;
  if (!file || !CODE.test(file) || !existsSync(file)) process.exit(0);
  editFile = realpathSync(file);
  const own = toplevel(path.dirname(editFile));
  // Only this repository's checkouts: the main clone or one of its worktrees.
  if (!own || commonDir(own) !== commonDir(PROJECT)) process.exit(0);
  ROOT = own;
}

const git = (...args) => gitAt(ROOT, args).out;
const bin = (name) => path.join(ROOT, "node_modules/.bin", name);
const hasDeps = existsSync(bin("eslint")) && existsSync(bin("vitest"));
const INSTALL = "pnpm install --frozen-lockfile";
const NO_DEPS = `The checks have not run: this clone has no node_modules. Run \`${INSTALL}\`, then carry on.`;
const mergeBase = () => git("merge-base", "HEAD", "origin/main").trim() || "HEAD";

// State and lock files: the system temp directory, else this checkout's git
// directory (never shown by git status). Keyed by the checkout's root.
const STATE_DIR = (() => {
  for (const dir of [path.join(tmpdir(), "mp-claude-verify"), path.resolve(ROOT, git("rev-parse", "--git-path", "mp-claude-verify").trim() || ".git/mp-claude-verify")]) {
    try {
      mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, `.probe-${process.pid}`);
      writeFileSync(probe, "");
      unlinkSync(probe);
      return dir;
    } catch {}
  }
  return null;
})();
const stateFile = STATE_DIR && path.join(STATE_DIR, `${createHash("sha1").update(ROOT).digest("hex").slice(0, 12)}.json`);

// ----------------------------------------------------------------- lock ----

const readOrNull = (file) => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
};

/** A lock is stale when its holder is gone, or has lived longer than any holder can (its hook's timeout). */
function isStale(file, content) {
  const [pid, , maxAge] = content.split(" ");
  let mtime = Date.now();
  try {
    mtime = statSync(file).mtimeMs;
  } catch {}
  if (Date.now() - mtime > (Number(maxAge) || 600_000)) return true;
  try {
    process.kill(Number(pid), 0);
    return false;
  } catch (e) {
    return e?.code !== "EPERM";
  }
}

/**
 * Remove a stale lock, but only the one we judged stale: two processes that
 * both find it dead would otherwise both remove a lock, the second one the
 * fresh lock the first just took. Breaking is itself serialised by a second
 * lock file held for microseconds; one left by a killed process expires in
 * 10 s.
 */
function breakStale(file, seen) {
  const brk = `${file}.break`;
  try {
    writeFileSync(brk, String(process.pid), { flag: "wx" });
  } catch {
    try {
      if (Date.now() - statSync(brk).mtimeMs > 10_000) unlinkSync(brk);
    } catch {}
    sleep(50);
    return;
  }
  try {
    if (readOrNull(file) === seen) unlinkSync(file);
  } finally {
    try {
      unlinkSync(brk);
    } catch {}
  }
}

/**
 * Take `file` as a lock, declaring that this holder lives at most `maxAge` ms,
 * and wait up to `waitMs` for a live holder. Returns the release function, or
 * false when the wait ran out, or null when no lock can be made at all.
 * Release only removes the lock while it is still ours.
 */
function lock(file, maxAge, waitMs) {
  if (!file) return null;
  const me = `${process.pid} ${randomBytes(6).toString("hex")} ${maxAge}`;
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      writeFileSync(file, me, { flag: "wx" });
      break;
    } catch (e) {
      if (e?.code !== "EEXIST") return null;
    }
    const seen = readOrNull(file);
    if (seen === null) continue; // released between our two calls
    if (isStale(file, seen)) breakStale(file, seen);
    else if (Date.now() > deadline) return false;
    else sleep(200);
  }
  let held = true;
  const release = () => {
    if (!held) return;
    held = false;
    try {
      if (readOrNull(file) === me) unlinkSync(file);
    } catch {}
  };
  process.on("exit", release);
  return release;
}

// Tests shorten the waits; nothing else sets it.
const waitFor = (ms) => Number(process.env.MP_VERIFY_LOCK_WAIT_MS) || ms;

// ------------------------------------------------------------- baseline ----

const BASELINE_NAME = "eslint-suppressions.json";
const BASELINE = path.join(ROOT, BASELINE_NAME);
// Every prune rewrites the baseline, and edits land in parallel: one writer
// at a time, or two prunes lose each other's change. Separate from the
// task/stop run lock below, which is held for the whole test run; an edit
// waiting on that would outlast its 60-second hook timeout.
const BASELINE_LOCK = stateFile && `${stateFile}.baseline.lock`;

function readBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE, "utf8"));
  } catch {
    return null;
  }
}

// The format ESLint writes (json-stable-stringify-without-jsonify, space 2):
// keys sorted at every level, two-space indent, no trailing newline. Written
// any other way, the next prune rewrites the whole file and the diff is noise.
// Object key order equals insertion order here because no path or rule id is
// an integer-like string.
const sortKeys = (v) =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;

/** Write the whole baseline at once. The temp name is in .gitignore, for a run killed mid-write. */
function writeBaseline(b) {
  const tmp = `${BASELINE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(sortKeys(b), null, 2));
  renameSync(tmp, BASELINE);
}

function baselineAt(ref) {
  try {
    return JSON.parse(git("show", `${ref}:${BASELINE_NAME}`)) ?? {};
  } catch {
    return {};
  }
}

// Paths in git commands are literal: `app/[lang]/x.tsx` is not a pattern.
const LITERAL = { GIT_LITERAL_PATHSPECS: "1" };

/**
 * `git diff --cached --name-status -z -M -B HEAD` on a scratch copy of the
 * index with every loose code file staged (untracked, deleted, modified), so
 * a plain `mv` reads as the rename it is and a file rewritten at a moved
 * file's old path reads as new. The real index is never touched. Without a
 * usable copy, only what the index already holds is seen.
 */
function viewSinceHead() {
  const args = ["diff", "--cached", "--name-status", "-z", "-M", "-B", "HEAD"];
  const index = path.resolve(ROOT, git("rev-parse", "--git-path", "index").trim() || ".git/index");
  const copy = STATE_DIR && path.join(STATE_DIR, `index-${process.pid}`);
  try {
    copyFileSync(index, copy);
  } catch {
    return gitAt(ROOT, args).out;
  }
  try {
    const env = { ...LITERAL, GIT_INDEX_FILE: copy };
    const loose = [
      ...git("ls-files", "-z", "--others", "--exclude-standard").split("\0"),
      ...git("ls-files", "-z", "--deleted").split("\0"),
      ...git("ls-files", "-z", "--modified").split("\0"),
    ].filter((f) => f && CODE.test(f));
    // One add for all; if a path vanished since the listing, which fails the
    // whole add, then one at a time so the rest still count.
    if (loose.length && !gitAt(ROOT, ["add", "-A", "--", ...loose], env).ok) for (const f of loose) gitAt(ROOT, ["add", "-A", "--", f], env);
    return gitAt(ROOT, args, env).out;
  } finally {
    try {
      unlinkSync(copy);
    } catch {}
  }
}

// Claims: which file holds the allowance of which HEAD path, so one HEAD
// path's allowance goes to one file. { "<path K>": { from: "<HEAD path P>",
// blob: "<K's content as a git blob>" } }. Kept in this checkout's git
// directory, which lives exactly as long as the uncommitted work it
// describes; read and written under the baseline lock. The blob (written to
// the object store with hash-object -w, unreferenced, collected by git gc)
// is how a claimed file is found again after a later move.
const CLAIMS = path.resolve(ROOT, git("rev-parse", "--git-path", "mp-claude-verify/claims.json").trim() || ".git/mp-claude-verify/claims.json");

function readClaims() {
  try {
    const c = JSON.parse(readFileSync(CLAIMS, "utf8"));
    return c && typeof c === "object" && !Array.isArray(c) ? c : {};
  } catch {
    return {};
  }
}

function writeClaims(c) {
  try {
    mkdirSync(path.dirname(CLAIMS), { recursive: true });
    const tmp = `${CLAIMS}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(c));
    renameSync(tmp, CLAIMS);
  } catch {}
}

/** Blob ids of `files` (written to the object store), in order. */
function blobsOf(files) {
  if (files.length === 0) return [];
  return gitAt(ROOT, ["hash-object", "-w", "--", ...files]).out.split("\n").filter(Boolean);
}

/** A tree holding `entries` ([path, blob]); null if git cannot make one. */
function treeOf(entries) {
  if (!STATE_DIR) return null;
  const env = { GIT_INDEX_FILE: path.join(STATE_DIR, `tree-index-${process.pid}`) };
  try {
    if (!gitAt(ROOT, ["read-tree", "--empty"], env).ok) return null;
    if (entries.length && !gitAt(ROOT, ["update-index", "--add", ...entries.flatMap(([p, b]) => ["--cacheinfo", `100644,${b},${p}`])], env).ok) return null;
    return gitAt(ROOT, ["write-tree"], env).out.trim() || null;
  } finally {
    try {
      unlinkSync(env.GIT_INDEX_FILE);
    } catch {}
  }
}

/**
 * Where each claimed file that is gone went: git's rename detection between a
 * tree of the gone files' last known content and a tree of the files on disk
 * with no entry. Returns new path -> old path.
 */
function claimedMoves(gone, claims, candidates) {
  const moves = new Map();
  if (gone.length === 0 || candidates.length === 0) return moves;
  const before = treeOf(gone.map((k) => [k, claims[k].blob]));
  const blobs = blobsOf(candidates);
  const after = blobs.length === candidates.length ? treeOf(candidates.map((f, i) => [f, blobs[i]])) : null;
  if (!before || !after) return moves;
  const fields = gitAt(ROOT, ["diff-tree", "-r", "-M", "--name-status", "-z", before, after]).out.split("\0");
  for (let i = 0; i < fields.length - 1; ) {
    if (fields[i].startsWith("R")) {
      moves.set(fields[i + 2], fields[i + 1]);
      i += 3;
    } else i += /^C/.test(fields[i]) ? 3 : 2;
  }
  return moves;
}

/**
 * Give each of `files` that is on disk and has no working entry what HEAD's
 * baseline holds for the file git says it was at HEAD (see the header), at
 * most once per HEAD path. Returns the files it wrote an entry for: they must
 * be linted in the same run, so the prune lowers them. Existing working
 * entries are never touched, except that an entry moving with its file leaves
 * the old path.
 */
function restoreAllowances(files) {
  const working = readBaseline();
  if (!working) return [];
  const onDisk = (f) => existsSync(path.join(ROOT, f));
  const atHead = baselineAt("HEAD");
  const claims = readClaims();
  const claimsBefore = JSON.stringify(claims);
  const written = [];

  // A claimed file that moved since the last run takes its entry and claim
  // along. Candidates: every loose code file on disk with no entry.
  const loose = [
    ...new Set([
      ...files,
      ...git("ls-files", "-z", "--others", "--exclude-standard").split("\0"),
      ...git("diff", "-z", "--name-only", "HEAD").split("\0"),
    ]),
  ].filter((f) => f && CODE.test(f) && !working[f] && onDisk(f));
  const gone = Object.keys(claims).filter((k) => !onDisk(k) && working[k] && claims[k].blob);
  for (const [to, k] of claimedMoves(gone, claims, loose)) {
    if (working[to] || !working[k]) continue;
    working[to] = working[k];
    delete working[k];
    claims[to] = { ...claims[k] };
    delete claims[k];
    written.push(to);
  }
  // A claim ends with its file, with its entry, or once the move is committed.
  for (const k of Object.keys(claims)) if (!onDisk(k) || !working[k] || atHead[k] || !claims[k]?.from) delete claims[k];
  const claimed = (p, f) => Object.entries(claims).some(([k, c]) => k !== f && c.from === p);

  let todo = files.filter((f) => !working[f] && onDisk(f));
  const inHead = new Set(todo.length ? gitAt(ROOT, ["ls-tree", "-z", "--name-only", "HEAD", "--", ...todo], LITERAL).out.split("\0").filter(Boolean) : []);
  // A file at HEAD under its own name with nothing in HEAD's baseline has
  // nothing to get, whatever the view says.
  todo = todo.filter((f) => !(inHead.has(f) && !atHead[f]));

  if (todo.length) {
    // R P F and C P F: F came from P. The source of a C is a file written
    // anew at P (with -B, a rewrite that is not P's old content).
    const from = new Map();
    const rewritten = new Set();
    const fields = viewSinceHead().split("\0");
    for (let i = 0; i < fields.length - 1; ) {
      const status = fields[i];
      if (/^[RC]/.test(status)) {
        from.set(fields[i + 2], fields[i + 1]);
        if (status.startsWith("C")) rewritten.add(fields[i + 1]);
        i += 3;
      } else i += 2;
    }
    const ancestor = (f) => (from.has(f) ? from.get(f) : rewritten.has(f) || !inHead.has(f) ? null : f);

    for (const file of todo) {
      const p = ancestor(file);
      if (!p || claimed(p, file)) continue;
      const amount = p !== file && working[p] ? working[p] : atHead[p];
      if (!amount) continue;
      working[file] = amount;
      if (p !== file) {
        delete working[p];
        claims[file] = { from: p };
      }
      written.push(file);
    }
  }

  // Each live claim remembers its file's current content, to be found again.
  const live = Object.keys(claims);
  const blobs = blobsOf(live);
  if (blobs.length === live.length) live.forEach((k, i) => (claims[k].blob = blobs[i]));
  if (JSON.stringify(claims) !== claimsBefore) writeClaims(claims);
  if (written.length) writeBaseline(working);
  return written;
}

/** The baseline holds merge conflict markers, so neither ESLint nor this hook can read it. */
function baselineConflict() {
  if (!existsSync(BASELINE) || readBaseline()) return null;
  if (!/^(<<<<<<<|>>>>>>>) /m.test(readOrNull(BASELINE) ?? "")) return null;
  return (
    `${BASELINE_NAME} has merge conflict markers, so lint cannot run. ` +
    "Run `node scripts/lint-baseline.mjs --resolve` (it keeps the lower count on each side), then `git add eslint-suppressions.json`."
  );
}

const relOf = (abs) => path.relative(ROOT, abs).split(path.sep).join("/");

/**
 * eslint on `files` against the baseline, pruning it. Call with the baseline
 * lock held. `files` may name deleted files: they lint nothing, and the prune
 * drops their entries. `snapshot` is the baseline as it was before this run
 * touched it (before restoreAllowances): a file that does not parse keeps the
 * entry it had there, and if eslint did not finish, the whole snapshot is put
 * back, so no entry this run restored survives.
 */
function lint(files, timeout, snapshot) {
  // With no files eslint lints the whole repository.
  if (files.length === 0) return { ok: true };
  const before = readBaseline();
  const r = spawnSync(
    bin("eslint"),
    [
      ...(before ? ["--prune-suppressions"] : []),
      "--max-warnings",
      "0",
      "--no-warn-ignored",
      "--no-error-on-unmatched-pattern",
      "--format",
      "json",
      ...files,
    ],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout },
  );
  const raw = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  let results = null;
  try {
    results = JSON.parse(r.stdout);
  } catch {}
  if (r.error || r.signal || !Array.isArray(results)) {
    if (snapshot) writeBaseline(snapshot);
    const why = r.error?.code === "ETIMEDOUT" || r.signal ? "did not finish in time" : r.error ? `could not be started (${r.error.message})` : "failed";
    return { ok: false, report: `eslint ${why}, so these files were not linted. The baseline is as it was.\n${tail(raw)}` };
  }

  const fatal = results.filter((x) => x.fatalErrorCount > 0).map((x) => relOf(x.filePath));
  if (fatal.length && snapshot) {
    const now = readBaseline();
    if (!now) writeBaseline(snapshot);
    else {
      for (const f of fatal) {
        if (snapshot[f]) now[f] = snapshot[f];
        else delete now[f];
      }
      writeBaseline(now);
    }
  }
  if (r.status === 0) return { ok: true };

  const lines = [];
  const over = [];
  for (const result of results) {
    if (result.messages.length === 0) continue;
    const rel = relOf(result.filePath);
    lines.push(rel);
    const counts = {};
    for (const m of result.messages) {
      lines.push(`  ${m.line ?? 0}:${m.column ?? 0}  ${m.severity === 2 ? "error" : "warning"}  ${m.message}${m.ruleId ? `  ${m.ruleId}` : ""}`);
      if (m.ruleId && m.severity === 2) counts[m.ruleId] = (counts[m.ruleId] ?? 0) + 1;
    }
    for (const [rule, now] of Object.entries(counts)) {
      const allowed = before?.[rel]?.[rule]?.count ?? 0;
      if (allowed > 0)
        over.push(
          `${rel}: the baseline allows ${allowed} of ${rule} in this file and it now has ${now}. ` +
            `ESLint lists all ${now}; remove the ${now - allowed} added, not the old ${allowed}.`,
        );
    }
  }
  for (const f of fatal) over.push(`${f} does not parse. Its baseline entry is kept as it was until it does.`);
  if (lines.length === 0) lines.push(tail(raw));
  return { ok: false, report: [...lines.slice(0, 80), ...(lines.length > 80 ? [`  … ${lines.length - 80} more lines`] : []), ...over].join("\n") };
}

// ----------------------------------------------------------------- edit ----

if (mode === "edit") {
  const rel = relOf(editFile);
  if (rel.startsWith("..") || rel.startsWith("node_modules")) process.exit(0);
  if (!hasDeps) {
    // Once per session: the stop run repeats it until the install happens.
    const told = stateFile && `${stateFile}.nodeps-${createHash("sha1").update(String(input.session_id ?? "")).digest("hex").slice(0, 12)}`;
    if (told && existsSync(told)) process.exit(0);
    try {
      if (told) writeFileSync(told, "");
    } catch {}
    fail(NO_DEPS);
  }
  // The hook's timeout is 60 s: wait at most 40 for the baseline, so there is
  // time left to lint and to say so if it could not.
  const release = lock(BASELINE_LOCK, 60_000, waitFor(40_000));
  if (release === false)
    fail(
      `eslint did not run on ${rel}: another hook run held the lint baseline for 40 s. ` +
        "The task and stop checks lint it; carry on, or edit the file again to lint it now.",
    );
  // null: no lock can be made anywhere. Linting unlocked beats not linting.
  const conflict = baselineConflict();
  if (conflict) fail(conflict);
  const snapshot = readBaseline();
  // A claimed file found again at a new path is linted too, so its moved entry is pruned now.
  const restored = restoreAllowances([rel]);
  const r = lint([...new Set([rel, ...restored])], Math.max(5_000, 55_000 - (Date.now() - started)), snapshot);
  release?.();
  if (!r.ok) fail(`eslint found errors in ${rel}. Fix them before moving on:\n${r.report}`);
  process.exit(0);
}

if (mode !== "task" && mode !== "stop") process.exit(0);

// ------------------------------------------------------------ task, stop ----

// The hook's timeout is 600 s; everything here fits in 570, so a run that
// overruns says so instead of being killed silently.
const remaining = () => Math.max(10_000, 570_000 - (Date.now() - started));
function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: remaining() });
  const why = r.error?.code === "ETIMEDOUT" || r.signal ? "\n(did not finish in time)" : r.error ? `\n(could not be started: ${r.error.message})` : "";
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}${why}` };
}

if (!STATE_DIR) {
  process.stdout.write(
    JSON.stringify({
      systemMessage: `The lint, tests and checks did not run: neither the temp directory nor ${ROOT}'s git directory can hold their state. Run them by hand.`,
    }),
  );
  process.exit(0);
}

// One run at a time per clone. Two tasks completed together would otherwise
// run the same tests twice at once, and timing-sensitive tests then fail for
// no reason. A second run waits, then usually finds the first one's verdict.
const runLock = lock(`${stateFile}.lock`, 600_000, waitFor(300_000));

// The state being judged: HEAD, the diff from it, and each untracked file's
// mtime. `withBaseline: false` leaves out the baseline, which the run itself
// prunes.
const fingerprintNow = (withBaseline = true) =>
  createHash("sha1")
    .update(git("rev-parse", "HEAD"))
    .update(withBaseline ? git("diff", "HEAD") : git("diff", "HEAD", "--", ".", `:(exclude)${BASELINE_NAME}`))
    .update(
      git("ls-files", "--others", "--exclude-standard")
        .split("\n")
        .filter(Boolean)
        .map((f) => `${f}:${statSync(path.join(ROOT, f), { throwIfNoEntry: false })?.mtimeMs ?? 0}`)
        .join("\n"),
    )
    .digest("hex");
// Taken before the list of changed files, so a file added after it shows up
// as a changed tree at the end, and that run records nothing.
const fingerprint = fingerprintNow();
const treeAtStart = fingerprintNow(false);

let state = {};
try {
  state = JSON.parse(readFileSync(stateFile, "utf8"));
} catch {}
const save = () => {
  try {
    writeFileSync(stateFile, JSON.stringify(state));
  } catch {}
};

if (state.passed === fingerprint) process.exit(0);

const base = mergeBase();
const changed = [
  ...new Set([
    ...git("diff", "--name-only", base).split("\n"),
    ...git("ls-files", "--others", "--exclude-standard").split("\n"),
  ]),
].filter((f) => f && CODE.test(f) && !f.startsWith("graphify-out/") && existsSync(path.join(ROOT, f)));
const baselineNow = readBaseline() ?? {};
// Code files deleted on this branch that still have a baseline entry: linting
// them prunes the entry, so `pnpm lint` passes without anyone editing the JSON.
const gone = git("diff", "--name-only", "--diff-filter=D", base)
  .split("\n")
  .filter((f) => f && baselineNow[f] && !existsSync(path.join(ROOT, f)));
// Files with an entry in HEAD's baseline, on disk, and none in the working one
// (a move and a move back, a prune between a move and a hook run): they get
// it back by the rule in the header.
const missing = readBaseline()
  ? Object.keys(baselineAt("HEAD")).filter((f) => !baselineNow[f] && CODE.test(f) && existsSync(path.join(ROOT, f)))
  : [];
if (changed.length === 0 && gone.length === 0 && missing.length === 0) process.exit(0);

// Attempts that failed for want of node_modules say nothing about the code,
// so once they are installed the same state is judged afresh.
if (state.noDeps && hasDeps) state = {};
// A machine that has already given up for want of node_modules cannot do
// better on the next state, so that state starts given up: stop tells the user
// once for it, and nothing is blocked.
if (!hasDeps && state.noDeps && (state.attempts ?? 0) >= 3 && state.failed !== fingerprint) {
  state = { failed: fingerprint, attempts: 3, noDeps: true };
  save();
}
if (state.failed === fingerprint && (state.attempts ?? 0) >= 3) {
  if (mode === "stop" && !state.told) {
    state.told = true;
    save();
    process.stdout.write(
      JSON.stringify({
        systemMessage: state.noDeps
          ? `The tests and checks for the changed files did not run: this clone has no node_modules and three attempts did not change that. Run \`${INSTALL}\` and the checks.`
          : "Lint, tests or checks for the changed files still fail, or could not run, after three attempts. The session stopped anyway; see the last failure above.",
      }),
    );
  }
  process.exit(0);
}

/**
 * Exit 2 with `msg`, counting the attempt against the state as it now is
 * (the run's own prune included), if the tree is still the one that was
 * checked. Otherwise nothing is recorded and the next run looks again.
 */
function failAttempt(msg, extra = {}) {
  if (fingerprintNow(false) === treeAtStart) {
    const now = fingerprintNow();
    state = { failed: now, attempts: state.failed === now ? (state.attempts ?? 0) + 1 : 1, ...extra };
    save();
  }
  fail(msg);
}
const before = mode === "stop" ? "Before finishing" : "Before this task is done";

if (!runLock) failAttempt(`The checks have not run: ${runLock === false ? "another check run held the lock for 300 s" : `no lock file can be made in ${STATE_DIR}`}.`);
if (!hasDeps) failAttempt(NO_DEPS, { noDeps: true });

// Held for the lint only: the tests below may run verify.mjs edit on this
// clone (verify.test.ts does), and that waits for this lock.
const releaseBaseline = lock(BASELINE_LOCK, 600_000, waitFor(120_000));
if (releaseBaseline === false) failAttempt(`${before}: eslint did not run: another hook run held the lint baseline for 120 s.`);
const conflict = baselineConflict();
if (conflict) failAttempt(`${before}: ${conflict}`);
const snapshot = readBaseline();
const restored = restoreAllowances([...new Set([...changed, ...missing])]);
const lintRun = lint([...new Set([...changed, ...gone, ...restored])], remaining(), snapshot);
releaseBaseline?.();
if (!lintRun.ok) failAttempt(`${before}: eslint fails on the files you changed. Fix it before anything else; the tests have not run yet.\n\n${lintRun.report}`);

const failures = [];
if (changed.length > 0) {
  const tests = run(bin("vitest"), ["related", "--run", "--passWithNoTests", ...changed]);
  if (!tests.ok) failures.push(`vitest related:\n${tail(tests.out)}`);
  const checks = run(process.execPath, [path.join(ROOT, "scripts/checks.mjs"), ...changed]);
  if (!checks.ok) failures.push(`checks:\n${tail(checks.out)}`);
}

if (failures.length > 0)
  failAttempt(
    `${before}: the tests or checks for the files you changed fail. ` +
      `Fix them (or, if the failure has nothing to do with your change, say so to the user).\n\n${failures.join("\n\n")}`,
  );
// A pass counts only for the tree that was checked.
if (fingerprintNow(false) === treeAtStart) {
  state = { passed: fingerprintNow() };
  save();
}
process.exit(0);
