#!/usr/bin/env node
// Make the checks mandatory, not a request in a prompt.
//
//   verify.mjs edit   PostToolUse on Edit|Write: eslint on the file just written.
//   verify.mjs task   TaskCompleted: the tests and checks for what changed.
//   verify.mjs stop   Stop: the same, before the session may finish.
//
// A failure exits 2, which is what sends Claude back to fix it. Most tools
// exit 1 on failure, and Claude Code treats 1 as a warning and carries on, so
// every failure here is translated to 2 on purpose.
//
// "What changed" is every file that differs from origin/main: committed on
// this branch, staged, unstaged or untracked. The task and stop runs remember
// the last state that passed and do nothing until something changes, so a
// session that is only talking costs nothing. They give up after three
// failed attempts on the same state, so a failure the change didn't cause
// can't hold a session forever; the user is told instead.
//
// Without node_modules (a fresh clone, a cloud session before install) every
// mode does nothing.

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const mode = process.argv[2];
let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {}

const ROOT = (() => {
  try {
    return execFileSync("git", ["-C", process.env.CLAUDE_PROJECT_DIR || input.cwd || ".", "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    process.exit(0);
  }
})();
const bin = (name) => path.join(ROOT, "node_modules/.bin", name);
if (!existsSync(bin("eslint")) || !existsSync(bin("vitest"))) process.exit(0);

const CODE = /\.(ts|tsx|mts|js|jsx|mjs)$/;
const tail = (s, n = 40) => s.split("\n").filter((l) => l.trim()).slice(-n).join("\n");
const fail = (msg) => {
  process.stderr.write(`${msg}\n`);
  process.exit(2);
};

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 600_000 });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

// ----------------------------------------------------------------- edit ----

if (mode === "edit") {
  const file = input.tool_input?.file_path;
  if (!file || !CODE.test(file) || !existsSync(file)) process.exit(0);
  const rel = path.relative(ROOT, file);
  if (rel.startsWith("..") || rel.startsWith("node_modules")) process.exit(0);
  const r = run(bin("eslint"), ["--quiet", "--no-warn-ignored", file]);
  if (!r.ok) fail(`eslint found errors in ${rel}. Fix them before moving on:\n${tail(r.out)}`);
  process.exit(0);
}

if (mode !== "task" && mode !== "stop") process.exit(0);

// ------------------------------------------------------------ task, stop ----

const git = (...args) => {
  try {
    return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return "";
  }
};

const base = git("merge-base", "HEAD", "origin/main").trim() || "HEAD";
const changed = [
  ...new Set([
    ...git("diff", "--name-only", base).split("\n"),
    ...git("ls-files", "--others", "--exclude-standard").split("\n"),
  ]),
].filter((f) => f && CODE.test(f) && !f.startsWith("graphify-out/") && existsSync(path.join(ROOT, f)));
if (changed.length === 0) process.exit(0);

// The state being judged: HEAD, the diff from it, and each untracked file's mtime.
const fingerprint = createHash("sha1")
  .update(git("rev-parse", "HEAD"))
  .update(git("diff", "HEAD"))
  .update(
    git("ls-files", "--others", "--exclude-standard")
      .split("\n")
      .filter(Boolean)
      .map((f) => `${f}:${statSync(path.join(ROOT, f), { throwIfNoEntry: false })?.mtimeMs ?? 0}`)
      .join("\n"),
  )
  .digest("hex");

const stateDir = path.join(tmpdir(), "mp-claude-verify");
mkdirSync(stateDir, { recursive: true });
const stateFile = path.join(stateDir, `${createHash("sha1").update(ROOT).digest("hex").slice(0, 12)}.json`);

// One run at a time per clone. Two tasks completed together would otherwise
// run the same tests twice at once, and timing-sensitive tests then fail for
// no reason. A second run waits, then usually finds the first one's verdict.
const lockFile = `${stateFile}.lock`;
for (let waited = 0; ; waited++) {
  try {
    writeFileSync(lockFile, String(process.pid), { flag: "wx" });
    break;
  } catch {
    let alive = false;
    try {
      process.kill(Number(readFileSync(lockFile, "utf8")), 0);
      alive = true;
    } catch {}
    if (!alive || waited > 600) {
      try {
        unlinkSync(lockFile);
      } catch {}
      continue;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
}
process.on("exit", () => {
  try {
    unlinkSync(lockFile);
  } catch {}
});

let state = {};
try {
  state = JSON.parse(readFileSync(stateFile, "utf8"));
} catch {}
const save = () => writeFileSync(stateFile, JSON.stringify(state));

if (state.passed === fingerprint) process.exit(0);
if (state.failed === fingerprint && (state.attempts ?? 0) >= 3) {
  if (mode === "stop" && !state.told) {
    state.told = true;
    save();
    process.stdout.write(
      JSON.stringify({
        systemMessage:
          "Tests or checks for the changed files still fail after three attempts. The session stopped anyway; see the last failure above.",
      }),
    );
  }
  process.exit(0);
}

const failures = [];
const tests = run(bin("vitest"), ["related", "--run", "--passWithNoTests", ...changed]);
if (!tests.ok) failures.push(`vitest related:\n${tail(tests.out)}`);
const checks = run(process.execPath, [path.join(ROOT, "scripts/checks.mjs"), ...changed]);
if (!checks.ok) failures.push(`checks:\n${tail(checks.out)}`);

if (failures.length === 0) {
  state = { passed: fingerprint };
  save();
  process.exit(0);
}

state = { failed: fingerprint, attempts: state.failed === fingerprint ? (state.attempts ?? 0) + 1 : 1 };
save();
fail(
  `${mode === "stop" ? "Before finishing" : "Before this task is done"}: the tests or checks for the files you changed fail. ` +
    `Fix them (or, if the failure has nothing to do with your change, say so to the user).\n\n${failures.join("\n\n")}`,
);
