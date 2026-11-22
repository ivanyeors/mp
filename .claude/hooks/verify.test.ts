import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// verify.mjs run against a throwaway git repository that has no node_modules,
// the state a cloud session is in before (or after a failed) install.
const VERIFY = path.join(import.meta.dirname, "verify.mjs");

let repo: string;

beforeEach(() => {
  // Resolved, because verify.mjs takes the root from git, which resolves
  // symlinks (macOS's /var/folders is one), and compares paths against it.
  repo = realpathSync(mkdtempSync(path.join(tmpdir(), "verify-test-")));
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "test");
  writeFileSync(path.join(repo, "README.md"), "x\n");
  writeFileSync(path.join(repo, ".gitignore"), "node_modules\n");
  mkdirSync(path.join(repo, "scripts"));
  writeFileSync(path.join(repo, "scripts/checks.mjs"), "");
  git("add", ".");
  git("commit", "-q", "-m", "init");
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

function verify(mode: string, input: object = {}, env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [VERIFY, mode], {
    input: JSON.stringify({ cwd: repo, session_id: "s1", ...input }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo, ...env },
    encoding: "utf8",
    // A hook that hangs is a failure too; the real ones are killed at 60 or 600 s.
    timeout: 90_000,
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

describe("verify.mjs without node_modules", () => {
  it("stop with a changed code file exits 2 and names the install command", () => {
    writeFileSync(path.join(repo, "a.ts"), "export const a = 1;\n");
    const r = verify("stop");
    expect(r.code).toBe(2);
    expect(r.err).toContain("pnpm install --frozen-lockfile");
    expect(r.err).toMatch(/not run/);
  });

  it("task with a changed code file exits 2 too", () => {
    writeFileSync(path.join(repo, "a.ts"), "export const a = 1;\n");
    const r = verify("task");
    expect(r.code).toBe(2);
    expect(r.err).toContain("pnpm install --frozen-lockfile");
  });

  it("stop with no changed code file exits 0 and says nothing", () => {
    writeFileSync(path.join(repo, "notes.md"), "y\n");
    const r = verify("stop");
    expect(r.code).toBe(0);
    expect(r.err).toBe("");
    expect(r.out).toBe("");
  });

  it("gives up on the fourth stop on the same state and tells the user the checks did not run", () => {
    writeFileSync(path.join(repo, "a.ts"), "export const a = 1;\n");
    for (let i = 0; i < 3; i++) expect(verify("stop").code).toBe(2);
    const r = verify("stop");
    expect(r.code).toBe(0);
    const msg = JSON.parse(r.out).systemMessage as string;
    expect(msg).toMatch(/did not run/);
    expect(msg).toContain("pnpm install --frozen-lockfile");
    expect(msg).not.toContain("corepack");
  });

  it("after giving up, a new state is not blocked again: stop tells the user once, task passes", () => {
    writeFileSync(path.join(repo, "a.ts"), "export const a = 1;\n");
    for (let i = 0; i < 4; i++) verify("stop");
    writeFileSync(path.join(repo, "b.ts"), "export const b = 1;\n");
    const r = verify("stop");
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).systemMessage).toMatch(/did not run/);
    const again = verify("stop");
    expect(again.code).toBe(0);
    expect(again.out).toBe("");
    writeFileSync(path.join(repo, "c.ts"), "export const c = 1;\n");
    expect(verify("task").code).toBe(0);
  });

  it("edit on a code file exits 2 once per session, then lets edits through", () => {
    const file = path.join(repo, "a.ts");
    writeFileSync(file, "export const a = 1;\n");
    const first = verify("edit", { tool_input: { file_path: file } });
    expect(first.code).toBe(2);
    expect(first.err).toContain("pnpm install --frozen-lockfile");
    expect(verify("edit", { tool_input: { file_path: file } }).code).toBe(0);
    expect(verify("edit", { tool_input: { file_path: file }, session_id: "s2" }).code).toBe(2);
  });

  it("edit on a file that is not code exits 0", () => {
    const file = path.join(repo, "notes.md");
    writeFileSync(file, "y\n");
    expect(verify("edit", { tool_input: { file_path: file } }).code).toBe(0);
  });
});

describe("verify.mjs once node_modules arrive", () => {
  it("judges a state that gave up for want of node_modules afresh", () => {
    writeFileSync(path.join(repo, "a.ts"), "export const a = 1;\n");
    for (let i = 0; i < 4; i++) verify("stop");
    const bin = path.join(repo, "node_modules/.bin");
    mkdirSync(bin, { recursive: true });
    for (const name of ["eslint", "vitest"]) {
      writeFileSync(path.join(bin, name), "#!/bin/sh\necho stub $0 failed >&2\nexit 1\n");
      chmodSync(path.join(bin, name), 0o755);
    }
    const r = verify("stop");
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/eslint failed/);
    expect(r.err).toContain("stub");
  });
});

// Stubs that pass: eslint prints an empty JSON report, as it does for files
// it does not lint, and each appends its arguments to .git/<name>.args (inside .git, so the tree being judged does not change).
function stubs({ eslint = "pass" }: { eslint?: "pass" | "not-executable" } = {}) {
  const bin = path.join(repo, "node_modules/.bin");
  mkdirSync(bin, { recursive: true });
  for (const name of ["eslint", "vitest"]) {
    writeFileSync(path.join(bin, name), `#!/bin/sh\necho "$@" >> "${repo}/.git/${name}.args"\n${name === "eslint" ? "echo '[]'\n" : ""}exit 0\n`);
    chmodSync(path.join(bin, name), name === "eslint" && eslint === "not-executable" ? 0o644 : 0o755);
  }
}
const ranTimes = (name: string) => readOrEmpty(path.join(repo, `.git/${name}.args`)).split("\n").filter(Boolean).length;
function readOrEmpty(file: string) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

describe("verify.mjs with an unwritable temp directory", () => {
  const blockedTmp = () => {
    const blocked = path.join(repo, "not-a-dir");
    writeFileSync(blocked, "");
    return blocked;
  };

  it("edit still lints", () => {
    const bin = path.join(repo, "node_modules/.bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(path.join(bin, "eslint"), "#!/bin/sh\necho stub eslint ran >&2\nexit 1\n");
    writeFileSync(path.join(bin, "vitest"), "#!/bin/sh\nexit 0\n");
    for (const name of ["eslint", "vitest"]) chmodSync(path.join(bin, name), 0o755);
    const file = path.join(repo, "a.ts");
    writeFileSync(file, "export const a = 1;\n");
    const r = verify("edit", { tool_input: { file_path: file } }, { TMPDIR: blockedTmp() });
    expect(r.code).toBe(2);
    expect(r.err).toContain("stub eslint ran");
  });

  it("stop keeps its state and lock in the git directory instead, and passes", () => {
    stubs();
    writeFileSync(path.join(repo, "a.ts"), "export const a = 1;\n");
    const tmp = blockedTmp();
    const r = verify("stop", {}, { TMPDIR: tmp });
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(verify("stop", {}, { TMPDIR: tmp }).code).toBe(0);
    expect(ranTimes("vitest")).toBe(1);
  });
});

describe("verify.mjs never exits without saying so", () => {
  it("an eslint that cannot be started fails edit and stop with exit 2", () => {
    stubs({ eslint: "not-executable" });
    writeFileSync(path.join(repo, "a.ts"), "export const a = 1;\n");
    const edit = verify("edit", { tool_input: { file_path: path.join(repo, "a.ts") } });
    expect(edit.code).toBe(2);
    expect(edit.err).toMatch(/eslint could not be started/);
    const stop = verify("stop");
    expect(stop.code).toBe(2);
    expect(stop.err).toMatch(/eslint could not be started/);
  });
});

describe("verify.mjs task and stop remember what passed", () => {
  it("runs once per state, and again when the state changes", () => {
    stubs();
    writeFileSync(path.join(repo, "a.ts"), "export const a = 1;\n");
    expect(verify("stop").code).toBe(0);
    expect(verify("stop").code).toBe(0);
    expect(verify("task").code).toBe(0);
    expect(ranTimes("vitest")).toBe(1);
    writeFileSync(path.join(repo, "a.ts"), "export const a = 2;\n");
    expect(verify("stop").code).toBe(0);
    expect(ranTimes("vitest")).toBe(2);
  });
});

const gitIn = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });
const baselineFile = () => path.join(repo, "eslint-suppressions.json");
const readBaseline = () => JSON.parse(readFileSync(baselineFile(), "utf8"));
// ESLint's own format: sorted keys, two spaces, no trailing newline.
const format = (b: object) => JSON.stringify(b, null, 2);

describe("verify.mjs writes the baseline in ESLint's own format (stub eslint)", () => {
  const entry = { "mp/no-comment": { count: 2 }, "react-hooks/refs": { count: 1 } };

  function commitWith(file: string, baseline: object) {
    stubs();
    mkdirSync(path.join(repo, "lib"));
    writeFileSync(path.join(repo, file), "export const a = 1;\n");
    writeFileSync(baselineFile(), format(baseline));
    gitIn("add", "lib", "eslint-suppressions.json");
    gitIn("commit", "-q", "-m", "baseline");
  }

  it("a moved entry is re-sorted under its new path, byte for byte as ESLint writes it", () => {
    commitWith("lib/old.ts", { "lib/old.ts": entry, "lib/z.ts": { "mp/no-comment": { count: 5 } } });
    gitIn("mv", "lib/old.ts", "lib/b-new.ts");
    const r = verify("stop");
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(readFileSync(baselineFile(), "utf8")).toBe(format({ "lib/b-new.ts": entry, "lib/z.ts": { "mp/no-comment": { count: 5 } } }));
  });

  it("does not overwrite an entry the new path already has", () => {
    const baseline = { "lib/new.ts": { "mp/no-comment": { count: 1 } }, "lib/old.ts": entry };
    commitWith("lib/old.ts", baseline);
    gitIn("mv", "lib/old.ts", "lib/new.ts");
    expect(verify("stop").code).toBe(0);
    expect(readFileSync(baselineFile(), "utf8")).toBe(format(baseline));
  });
});

// The real eslint, this repository's eslint.config.mjs and eslint-rules/, in a
// throwaway repository with its own baseline, so no test touches this clone's
// files and no hook running on this clone shares its state or lock files.
// node_modules links to this clone's packages; its .bin has the real eslint
// and a vitest stub that records each run.
const HERE = path.resolve(import.meta.dirname, "../..");
const COMMENT = "Comments are not allowed here";
const RULE = "mp/no-comment";
const PRODUCT = "export const a = 1;\n// first\nexport const b = 2;\n// second\nexport const c = 3;\n";
const BRACKETED = "app/[lang]/p.tsx";

function linkedNodeModules(root: string) {
  const nm = path.join(root, "node_modules");
  mkdirSync(path.join(nm, ".bin"), { recursive: true });
  for (const entry of readdirSync(path.join(HERE, "node_modules")).filter((e) => e !== ".bin"))
    symlinkSync(path.join(HERE, "node_modules", entry), path.join(nm, entry));
  writeFileSync(path.join(nm, ".bin/eslint"), `#!/bin/sh\nexec "${HERE}/node_modules/.bin/eslint" "$@"\n`);
  writeFileSync(path.join(nm, ".bin/vitest"), `#!/bin/sh\necho "$@" >> "${root}/vitest.args"\nexit 0\n`);
  for (const name of ["eslint", "vitest"]) chmodSync(path.join(nm, ".bin", name), 0o755);
}

// The fixture is the same files every time, so ESLint makes the same baseline
// every time: the first test makes it, the rest start from a copy. One ESLint
// start instead of 29, which was about a quarter of this file's run time.
let madeBaseline: string | undefined;

/** Builds the fixture and returns the baseline ESLint made for it. */
function realLintRepo(): Record<string, Record<string, { count: number }>> {
  linkedNodeModules(repo);
  writeFileSync(path.join(repo, ".gitignore"), "node_modules\n.claude/worktrees/\n*.args\n");
  copyFileSync(path.join(HERE, "eslint.config.mjs"), path.join(repo, "eslint.config.mjs"));
  mkdirSync(path.join(repo, "eslint-rules"));
  for (const f of readdirSync(path.join(HERE, "eslint-rules")).filter((f) => f.endsWith(".mjs")))
    copyFileSync(path.join(HERE, "eslint-rules", f), path.join(repo, "eslint-rules", f));
  mkdirSync(path.join(repo, "lib"));
  writeFileSync(path.join(repo, "lib/x.ts"), PRODUCT);
  writeFileSync(path.join(repo, "lib/w.ts"), PRODUCT);
  mkdirSync(path.join(repo, "app/[lang]"), { recursive: true });
  writeFileSync(path.join(repo, BRACKETED), PRODUCT);
  // The fixture's baseline is made the way the real one was: by ESLint, from
  // what the rules report today, so it follows any change to how they count.
  // Only here, in a throwaway repository; guard.mjs blocks it everywhere else.
  if (madeBaseline === undefined) {
    const made = spawnSync(path.join(repo, "node_modules/.bin/eslint"), ["--suppress-all", "lib", "app"], { cwd: repo, encoding: "utf8" });
    expect(made.status, made.stdout + made.stderr).toBe(0);
    madeBaseline = readFileSync(baselineFile(), "utf8");
  } else {
    writeFileSync(baselineFile(), madeBaseline);
  }
  gitIn("add", ".");
  gitIn("commit", "-q", "-m", "real lint");
  const baseline = readBaseline();
  for (const f of ["lib/x.ts", "lib/w.ts", BRACKETED]) expect(baseline[f]?.[RULE]?.count ?? 0, f).toBeGreaterThan(1);
  return baseline;
}

const editFile = (rel: string, env: Record<string, string> = {}) => verify("edit", { tool_input: { file_path: path.join(repo, rel) } }, env);
const allowed = (rel: string) => readBaseline()[rel]?.[RULE]?.count;
const removeOneComment = (rel: string) => writeFileSync(path.join(repo, rel), PRODUCT.replace("// second\n", ""));
const addOneComment = (rel: string) => writeFileSync(path.join(repo, rel), `${readFileSync(path.join(repo, rel), "utf8")}// one more\n`);
const stateFile = () => path.join(tmpdir(), "mp-claude-verify", `${createHash("sha1").update(repo).digest("hex").slice(0, 12)}.json`);

describe("verify.mjs edit against the baseline, with the real rules", () => {
  it("a comment beyond the file's count exits 2 with the rule's message and how many it allows", () => {
    const n = realLintRepo()["lib/x.ts"][RULE].count;
    addOneComment("lib/x.ts");
    const r = editFile("lib/x.ts");
    expect(r.code).toBe(2);
    expect(r.err).toContain(COMMENT);
    expect(r.err).toContain(`the baseline allows ${n} of ${RULE} in this file and it now has ${n + 1}`);
    expect(r.err).toContain(`remove the 1 added, not the old ${n}`);
    expect(allowed("lib/x.ts")).toBe(n);
  }, 60_000);

  it("a comment removed exits 0 and lowers the file's count", () => {
    const n = realLintRepo()["lib/x.ts"][RULE].count;
    removeOneComment("lib/x.ts");
    const r = editFile("lib/x.ts");
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(allowed("lib/x.ts")).toBe(n - 1);
  }, 60_000);

  it("works on a path with brackets", () => {
    const n = realLintRepo()[BRACKETED][RULE].count;
    addOneComment(BRACKETED);
    const r = editFile(BRACKETED);
    expect(r.code).toBe(2);
    expect(r.err).toContain(`the baseline allows ${n} of ${RULE} in this file and it now has ${n + 1}`);
  }, 60_000);

  // With noInlineConfig a directive raises a warning with no rule id, which no
  // suppression absorbs and `pnpm lint` (--max-warnings 0) fails on.
  it("a leftover ESLint directive exits 2, not hidden as a warning", () => {
    realLintRepo();
    writeFileSync(path.join(repo, "scripts/tool.mjs"), "/* eslint-disable */\nexport const a = 1;\n");
    const r = editFile("scripts/tool.mjs");
    expect(r.code).toBe(2);
    expect(r.err).toContain("noInlineConfig");
  }, 60_000);

  it("a file that does not parse fails, and keeps its baseline entry for when it does again", () => {
    const original = realLintRepo();
    writeFileSync(path.join(repo, "lib/x.ts"), `${PRODUCT}export const broken = {\n`);
    const r = editFile("lib/x.ts");
    expect(r.code).toBe(2);
    expect(r.err).toContain("lib/x.ts does not parse");
    expect(readBaseline()).toEqual(original);
    writeFileSync(path.join(repo, "lib/x.ts"), PRODUCT);
    const fixed = editFile("lib/x.ts");
    expect(fixed.err).toBe("");
    expect(fixed.code).toBe(0);
    expect(readBaseline()).toEqual(original);
  }, 60_000);

  it("an edit to a file moved with git mv finds its entry before linting", () => {
    const original = realLintRepo();
    gitIn("mv", "lib/x.ts", "lib/y.ts");
    const r = editFile("lib/y.ts");
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(readBaseline()["lib/y.ts"]).toEqual(original["lib/x.ts"]);
  }, 60_000);

  it("waits for another holder of the baseline lock, and says so if it cannot lint", () => {
    const n = realLintRepo()["lib/x.ts"][RULE].count;
    removeOneComment("lib/x.ts");
    const lockFile = `${stateFile()}.baseline.lock`;
    writeFileSync(lockFile, String(process.pid));
    try {
      const r = editFile("lib/x.ts", { MP_VERIFY_LOCK_WAIT_MS: "1500" });
      expect(r.code).toBe(2);
      expect(r.err).toMatch(/eslint did not run on lib\/x\.ts: another hook run held the lint baseline/);
      expect(allowed("lib/x.ts")).toBe(n);
    } finally {
      rmSync(lockFile, { force: true });
    }
    expect(editFile("lib/x.ts").code).toBe(0);
    expect(allowed("lib/x.ts")).toBe(n - 1);
  }, 30_000);

  it("takes over a lock older than any holder can live, even when its PID is alive (reused)", () => {
    const n = realLintRepo()["lib/x.ts"][RULE].count;
    removeOneComment("lib/x.ts");
    const lockFile = `${stateFile()}.baseline.lock`;
    writeFileSync(lockFile, String(process.pid));
    const old = new Date(Date.now() - 20 * 60_000);
    utimesSync(lockFile, old, old);
    try {
      const r = editFile("lib/x.ts");
      expect(r.err).toBe("");
      expect(r.code).toBe(0);
      expect(allowed("lib/x.ts")).toBe(n - 1);
      expect(existsSync(lockFile)).toBe(false);
    } finally {
      rmSync(lockFile, { force: true });
    }
  }, 30_000);

  it("takes over a lock whose holder is dead", () => {
    const n = realLintRepo()["lib/x.ts"][RULE].count;
    removeOneComment("lib/x.ts");
    const lockFile = `${stateFile()}.baseline.lock`;
    writeFileSync(lockFile, "999999 dead 60000");
    try {
      expect(editFile("lib/x.ts").code).toBe(0);
      expect(allowed("lib/x.ts")).toBe(n - 1);
    } finally {
      rmSync(lockFile, { force: true });
    }
  }, 30_000);

  it("two edits started together both lower their file's count and leave valid JSON", async () => {
    const original = realLintRepo();
    removeOneComment("lib/x.ts");
    removeOneComment("lib/w.ts");
    const both = await Promise.all(["lib/x.ts", "lib/w.ts"].map((f) => verifyAsync("edit", { tool_input: { file_path: path.join(repo, f) } })));
    expect(both.map((r) => r.code)).toEqual([0, 0]);
    const now = readBaseline();
    expect(now["lib/x.ts"][RULE].count).toBe(original["lib/x.ts"][RULE].count - 1);
    expect(now["lib/w.ts"][RULE].count).toBe(original["lib/w.ts"][RULE].count - 1);
  }, 60_000);
});

describe("verify.mjs edit in a worker's worktree", () => {
  const worktree = () => path.join(repo, ".claude/worktrees/w");

  it("lints the file by its own worktree's config and baseline, not the project directory's", () => {
    const n = realLintRepo()["lib/x.ts"][RULE].count;
    gitIn("worktree", "add", "-q", "--detach", worktree());
    linkedNodeModules(worktree());
    const file = path.join(worktree(), "lib/x.ts");
    writeFileSync(file, `${PRODUCT}// one more\n`);
    const r = verify("edit", { tool_input: { file_path: file } });
    expect(r.code).toBe(2);
    expect(r.err).toContain(`the baseline allows ${n} of ${RULE} in this file and it now has ${n + 1}`);
  }, 60_000);

  it("tells a worktree with no node_modules to install", () => {
    realLintRepo();
    gitIn("worktree", "add", "-q", "--detach", worktree());
    const r = verify("edit", { tool_input: { file_path: path.join(worktree(), "lib/x.ts") } });
    expect(r.code).toBe(2);
    expect(r.err).toContain("pnpm install --frozen-lockfile");
  }, 60_000);

  it("leaves a file in another repository alone", () => {
    const other = realpathSync(mkdtempSync(path.join(tmpdir(), "verify-other-")));
    try {
      execFileSync("git", ["-C", other, "init", "-q"]);
      writeFileSync(path.join(other, "a.ts"), "// x\n");
      const r = verify("edit", { tool_input: { file_path: path.join(other, "a.ts") } });
      expect(r.code).toBe(0);
      expect(r.err).toBe("");
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });
});

// The allowance rule (verify.mjs header): a file with no working entry gets
// what HEAD's baseline holds for the file git says it was at HEAD; a file new
// since HEAD gets nothing. Scenarios 1 to 7 run twice: with the merge base at
// HEAD (which holds the baseline), and with a merge base that has no baseline
// at all (scenario 12), since the rule no longer reads the merge base.
const stopPasses = () => {
  const r = verify("stop");
  expect(r.err).toBe("");
  expect(r.code).toBe(0);
};
const headBaseline = () => gitIn("show", "HEAD:eslint-suppressions.json");
const commentErrors = (err: string) => err.split("\n").filter((l) => l.includes(COMMENT)).length;
const NEW_X = "// one\n// two\n// three\nexport function shim(): number {\n  return 42;\n}\n";
const NO_COMMENTS = PRODUCT.replace(/\/\/ .*\n/g, "");

describe.each([
  { label: "merge base holds the baseline", noBaseBaseline: false },
  { label: "merge base has no baseline", noBaseBaseline: true },
])("verify.mjs keeps every file's allowance ($label)", ({ noBaseBaseline }) => {
  function fixture() {
    const original = realLintRepo();
    if (noBaseBaseline) gitIn("update-ref", "refs/remotes/origin/main", "HEAD~1");
    return original;
  }

  it("1. git mv: the entry moves to the new path with the same counts", () => {
    const original = fixture();
    gitIn("mv", "lib/x.ts", "lib/y.ts");
    stopPasses();
    expect(readBaseline()["lib/y.ts"]).toEqual(original["lib/x.ts"]);
    expect(readBaseline()["lib/x.ts"]).toBeUndefined();
  }, 60_000);

  it("1. plain mv: the entry moves too, and the real index is not touched", () => {
    const original = fixture();
    renameSync(path.join(repo, "lib/x.ts"), path.join(repo, "lib/y.ts"));
    const status = () =>
      gitIn("status", "--porcelain")
        .split("\n")
        .filter((l) => !l.endsWith("eslint-suppressions.json"))
        .join("\n");
    const statusBefore = status();
    expect(statusBefore).toContain(" D lib/x.ts");
    expect(statusBefore).toContain("?? lib/y.ts");
    stopPasses();
    expect(readBaseline()["lib/y.ts"]).toEqual(original["lib/x.ts"]);
    expect(readBaseline()["lib/x.ts"]).toBeUndefined();
    expect(status()).toBe(statusBefore);
  }, 60_000);

  it("1. a bracketed path, by git mv and by plain mv", () => {
    const original = fixture();
    gitIn("mv", BRACKETED, "app/[lang]/q.tsx");
    stopPasses();
    expect(readBaseline()["app/[lang]/q.tsx"]).toEqual(original[BRACKETED]);
    renameSync(path.join(repo, "app/[lang]/q.tsx"), path.join(repo, "app/[lang]/r.tsx"));
    stopPasses();
    expect(readBaseline()["app/[lang]/r.tsx"]).toEqual(original[BRACKETED]);
    expect(readBaseline()["app/[lang]/q.tsx"]).toBeUndefined();
  }, 60_000);

  it("2. a second move: x to y, a hook run, then y to z", () => {
    const original = fixture();
    gitIn("mv", "lib/x.ts", "lib/y.ts");
    stopPasses();
    renameSync(path.join(repo, "lib/y.ts"), path.join(repo, "lib/z.ts"));
    stopPasses();
    expect(readBaseline()["lib/z.ts"]).toEqual(original["lib/x.ts"]);
  }, 60_000);

  it("3. a move back: x to y to z, hook runs between, then z to x gives HEAD's baseline byte for byte", () => {
    fixture();
    gitIn("mv", "lib/x.ts", "lib/y.ts");
    stopPasses();
    renameSync(path.join(repo, "lib/y.ts"), path.join(repo, "lib/z.ts"));
    stopPasses();
    renameSync(path.join(repo, "lib/z.ts"), path.join(repo, "lib/x.ts"));
    stopPasses();
    expect(readFileSync(baselineFile(), "utf8")).toBe(headBaseline());
  }, 60_000);

  it("4. an edit on another file between a move and the first stop (its prune drops the old entry)", () => {
    const original = fixture();
    renameSync(path.join(repo, "lib/x.ts"), path.join(repo, "lib/y.ts"));
    expect(editFile("lib/w.ts").code).toBe(0);
    expect(readBaseline()["lib/x.ts"]).toBeUndefined();
    stopPasses();
    expect(readBaseline()["lib/y.ts"]).toEqual(original["lib/x.ts"]);
  }, 60_000);

  it("5. a move that also adds a violation fails for the excess", () => {
    const n = fixture()["lib/x.ts"][RULE].count;
    gitIn("mv", "lib/x.ts", "lib/y.ts");
    addOneComment("lib/y.ts");
    const r = verify("stop");
    expect(r.code).toBe(2);
    expect(r.err).toContain(`lib/y.ts: the baseline allows ${n} of ${RULE} in this file and it now has ${n + 1}`);
  }, 60_000);

  it("6. a new file at a moved file's old path gets nothing, even after another file's cleanup", () => {
    const original = fixture();
    gitIn("mv", "lib/x.ts", "lib/y.ts");
    stopPasses();
    writeFileSync(path.join(repo, "lib/w.ts"), NO_COMMENTS);
    expect(editFile("lib/w.ts").code).toBe(0);
    expect(readBaseline()["lib/w.ts"]).toBeUndefined();
    writeFileSync(path.join(repo, "lib/x.ts"), NEW_X);
    const r = editFile("lib/x.ts");
    expect(r.code).toBe(2);
    expect(commentErrors(r.err)).toBe(3);
    expect(readBaseline()["lib/x.ts"]).toBeUndefined();
    expect(readBaseline()["lib/y.ts"]).toEqual(original["lib/x.ts"]);
    expect(verify("stop").code).toBe(2);
    expect(readBaseline()["lib/x.ts"]).toBeUndefined();
  }, 60_000);

  it("6. a clean new file at a moved file's old path passes with no entry", () => {
    const original = fixture();
    gitIn("mv", "lib/x.ts", "lib/y.ts");
    stopPasses();
    writeFileSync(path.join(repo, "lib/x.ts"), "export function shim(): number {\n  return 42;\n}\n");
    expect(editFile("lib/x.ts").code).toBe(0);
    stopPasses();
    expect(readBaseline()["lib/x.ts"]).toBeUndefined();
    expect(readBaseline()["lib/y.ts"]).toEqual(original["lib/x.ts"]);
  }, 60_000);

  it("6. a new file at the old path similar to the moved one (its content plus a comment) gets nothing", () => {
    const original = fixture();
    gitIn("mv", "lib/x.ts", "lib/y.ts");
    stopPasses();
    writeFileSync(path.join(repo, "lib/x.ts"), `${PRODUCT}// one more\n`);
    const r = editFile("lib/x.ts");
    expect(r.code).toBe(2);
    expect(readBaseline()["lib/x.ts"]).toBeUndefined();
    expect(readBaseline()["lib/y.ts"]).toEqual(original["lib/x.ts"]);
  }, 60_000);

  it("6. the claim follows a further move, and ends with its file", () => {
    const original = fixture();
    gitIn("mv", "lib/x.ts", "lib/y.ts");
    stopPasses();
    renameSync(path.join(repo, "lib/y.ts"), path.join(repo, "lib/z.ts"));
    stopPasses();
    expect(readBaseline()["lib/z.ts"]).toEqual(original["lib/x.ts"]);
    writeFileSync(path.join(repo, "lib/x.ts"), NEW_X);
    expect(editFile("lib/x.ts").code).toBe(2);
    expect(readBaseline()["lib/x.ts"]).toBeUndefined();
    rmSync(path.join(repo, "lib/z.ts"));
    writeFileSync(path.join(repo, "lib/x.ts"), gitIn("show", "HEAD:lib/x.ts"));
    const back = editFile("lib/x.ts");
    expect(back.err).toBe("");
    expect(back.code).toBe(0);
    expect(readBaseline()["lib/x.ts"]).toEqual(original["lib/x.ts"]);
  }, 60_000);

  it("6. after a refused new x, mv y z: z keeps the allowance and x is still refused", () => {
    const original = fixture();
    gitIn("mv", "lib/x.ts", "lib/y.ts");
    stopPasses();
    writeFileSync(path.join(repo, "lib/x.ts"), NEW_X);
    expect(editFile("lib/x.ts").code).toBe(2);
    renameSync(path.join(repo, "lib/y.ts"), path.join(repo, "lib/z.ts"));
    const r = verify("stop");
    expect(r.code).toBe(2);
    expect(r.err).toContain("lib/x.ts");
    expect(r.err).not.toContain("lib/z.ts");
    expect(readBaseline()["lib/z.ts"]).toEqual(original["lib/x.ts"]);
    expect(readBaseline()["lib/x.ts"]).toBeUndefined();
    expect(readBaseline()["lib/y.ts"]).toBeUndefined();
  }, 60_000);

  it("the claims never show in git status", () => {
    fixture();
    gitIn("mv", "lib/x.ts", "lib/y.ts");
    stopPasses();
    const claims = gitIn("rev-parse", "--git-path", "mp-claude-verify/claims.json").trim();
    expect(existsSync(path.resolve(repo, claims))).toBe(true);
    expect(gitIn("status", "--porcelain", "--ignored")).not.toContain("claims");
  }, 60_000);

  it("7. every comment removed (not committed), then two added back: the entry is 2", () => {
    fixture();
    writeFileSync(path.join(repo, "lib/x.ts"), NO_COMMENTS);
    expect(editFile("lib/x.ts").code).toBe(0);
    expect(readBaseline()["lib/x.ts"]).toBeUndefined();
    writeFileSync(path.join(repo, "lib/x.ts"), `${NO_COMMENTS}// back one\nexport const d = 4;\n// back two\n`);
    const r = editFile("lib/x.ts");
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(allowed("lib/x.ts")).toBe(2);
  }, 60_000);
});

describe("verify.mjs allowances follow HEAD, with the real rules", () => {
  const commitAll = (msg: string) => {
    gitIn("add", "-A");
    gitIn("commit", "-q", "-m", msg);
  };

  it("8. a cleanup committed with the baseline is final: one comment back fails edit and stop", () => {
    realLintRepo();
    // The branch starts here; its merge base still holds x's entry.
    gitIn("update-ref", "refs/remotes/origin/main", "HEAD");
    writeFileSync(path.join(repo, "lib/x.ts"), NO_COMMENTS);
    expect(editFile("lib/x.ts").code).toBe(0);
    commitAll("clean x");
    expect(headBaseline()).not.toContain('"lib/x.ts"');
    addOneComment("lib/x.ts");
    expect(editFile("lib/x.ts").code).toBe(2);
    expect(verify("stop").code).toBe(2);
    expect(readBaseline()["lib/x.ts"]).toBeUndefined();
  }, 60_000);

  it("9. a move committed with the baseline, then an uncommitted move on", () => {
    const original = realLintRepo();
    gitIn("mv", "lib/x.ts", "lib/y.ts");
    stopPasses();
    commitAll("move x to y");
    renameSync(path.join(repo, "lib/y.ts"), path.join(repo, "lib/z.ts"));
    stopPasses();
    expect(readBaseline()["lib/z.ts"]).toEqual(original["lib/x.ts"]);
    expect(readBaseline()["lib/y.ts"]).toBeUndefined();
  }, 60_000);

  it("10. a move committed with the baseline, then an uncommitted move back", () => {
    const original = realLintRepo();
    gitIn("mv", "lib/x.ts", "lib/y.ts");
    stopPasses();
    commitAll("move x to y");
    renameSync(path.join(repo, "lib/y.ts"), path.join(repo, "lib/x.ts"));
    stopPasses();
    expect(readBaseline()["lib/x.ts"]).toEqual(original["lib/x.ts"]);
    expect(readBaseline()["lib/y.ts"]).toBeUndefined();
  }, 60_000);

  it("11. a file whose own entry HEAD's baseline holds (the owner's raise) gets it back", () => {
    realLintRepo();
    writeFileSync(path.join(repo, "lib/n.ts"), "// one\nexport const n = 1;\n// two\n");
    const raised = spawnSync(path.join(repo, "node_modules/.bin/eslint"), ["--suppress-rule", RULE, "lib/n.ts"], { cwd: repo, encoding: "utf8" });
    expect(raised.status, raised.stdout + raised.stderr).toBe(0);
    commitAll("owner raises the baseline for n");
    const atHead = JSON.parse(headBaseline())["lib/n.ts"];
    expect(atHead).toBeDefined();
    const working = readBaseline();
    delete working["lib/n.ts"];
    writeFileSync(baselineFile(), format(working));
    const r = editFile("lib/n.ts");
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(readBaseline()["lib/n.ts"]).toEqual(atHead);
  }, 60_000);

  it("a file that does not parse keeps its entry, and fails", () => {
    const original = realLintRepo();
    writeFileSync(path.join(repo, "lib/x.ts"), `${PRODUCT}export const broken = {\n`);
    const r = verify("stop");
    expect(r.code).toBe(2);
    expect(r.err).toContain("lib/x.ts does not parse");
    expect(readBaseline()).toEqual(original);
  }, 60_000);

  it("git rm: the entry is pruned", () => {
    const original = realLintRepo();
    gitIn("rm", "-q", "lib/x.ts");
    stopPasses();
    const rest = { ...original };
    delete rest["lib/x.ts"];
    expect(readBaseline()).toEqual(rest);
  }, 60_000);

  it("a lint failure fails task and stop at once, before the tests run", () => {
    realLintRepo();
    addOneComment("lib/x.ts");
    for (const mode of ["task", "stop"]) {
      const r = verify(mode);
      expect(r.code).toBe(2);
      expect(r.err).toContain("the tests have not run yet");
      expect(r.err).toContain(COMMENT);
    }
    expect(existsSync(path.join(repo, "vitest.args"))).toBe(false);
  }, 60_000);

  it("a file added while the run waits for its lock is linted by that run", async () => {
    realLintRepo();
    writeFileSync(path.join(repo, "lib/x.ts"), PRODUCT.replace("export const c = 3;\n", "export const c = 4;\n"));
    const lockFile = `${stateFile()}.lock`;
    writeFileSync(lockFile, String(process.pid));
    const run = verifyAsync("stop");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    writeFileSync(path.join(repo, "lib/new.ts"), "// added while waiting\nexport const n = 1;\n");
    rmSync(lockFile, { force: true });
    const r = await run;
    expect(r.code).toBe(2);
    expect(r.err).toContain("lib/new.ts");
    expect(verify("stop").code).toBe(2);
  }, 60_000);
});

// Files of 400 bytes or more, which git's -B can break: `tag` keeps each
// file's lines its own, and each comment is one mp/no-comment violation.
function big(tag: string, comments: number) {
  let s = "";
  for (let i = 0; i < 12; i++) s += `export const ${tag}Value${i} = "${tag} value number ${i}, padded to make it long";\n`;
  for (let i = 0; i < comments; i++) s += `// ${tag} note ${i}\nexport const ${tag}Extra${i} = ${i};\n`;
  return s;
}

describe("verify.mjs claims and moves, review round 4", () => {
  const commitAll = (msg: string) => {
    gitIn("add", "-A");
    gitIn("commit", "-q", "-m", msg);
  };
  /** The real-rules fixture plus `files`, each committed with the entry ESLint makes for it. */
  function withBig(files: Record<string, string>) {
    realLintRepo();
    for (const [f, text] of Object.entries(files)) writeFileSync(path.join(repo, f), text);
    const made = spawnSync(path.join(repo, "node_modules/.bin/eslint"), ["--suppress-all", ...Object.keys(files)], { cwd: repo, encoding: "utf8" });
    expect(made.status, made.stdout + made.stderr).toBe(0);
    commitAll("big files");
    return readBaseline();
  }
  const claimsFile = () => path.resolve(repo, gitIn("rev-parse", "--git-path", "mp-claude-verify/claims.json").trim());

  it("1. a claim survives when the new path had its own entry at HEAD", () => {
    const at = withBig({ "lib/bx.ts": big("x", 5), "lib/by.ts": big("y", 3) });
    expect(at["lib/bx.ts"][RULE].count).toBe(5);
    expect(at["lib/by.ts"][RULE].count).toBe(3);
    writeFileSync(path.join(repo, "lib/by.ts"), big("y", 0));
    expect(editFile("lib/by.ts").code).toBe(0);
    renameSync(path.join(repo, "lib/bx.ts"), path.join(repo, "lib/by.ts"));
    stopPasses();
    expect(allowed("lib/by.ts")).toBe(5);
    stopPasses();
    writeFileSync(path.join(repo, "lib/bx.ts"), big("x", 5));
    const r = editFile("lib/bx.ts");
    expect(r.code).toBe(2);
    expect(readBaseline()["lib/bx.ts"]).toBeUndefined();
    expect(allowed("lib/by.ts")).toBe(5);
  }, 60_000);

  it("2. an eslint that does not finish leaves the baseline and the claims as they were; the next run moves both", () => {
    const original = realLintRepo();
    gitIn("mv", "lib/x.ts", "lib/y.ts");
    stopPasses();
    renameSync(path.join(repo, "lib/y.ts"), path.join(repo, "lib/z.ts"));
    const baselineBefore = readFileSync(baselineFile(), "utf8");
    const claimsBefore = readFileSync(claimsFile(), "utf8");
    const wrapper = path.join(repo, "node_modules/.bin/eslint");
    const real = readFileSync(wrapper, "utf8");
    writeFileSync(wrapper, "#!/bin/sh\nexit 3\n");
    const r = verify("stop");
    expect(r.code).toBe(2);
    expect(r.err).toContain("eslint failed");
    expect(readFileSync(baselineFile(), "utf8")).toBe(baselineBefore);
    expect(readFileSync(claimsFile(), "utf8")).toBe(claimsBefore);
    writeFileSync(wrapper, real);
    stopPasses();
    expect(readBaseline()["lib/z.ts"]).toEqual(original["lib/x.ts"]);
    expect(Object.keys(JSON.parse(readFileSync(claimsFile(), "utf8")))).toEqual(["lib/z.ts"]);
  }, 60_000);

  it("3. a moved file gets HEAD's amount when a new file at the old path already pruned that path's entry", () => {
    withBig({ "lib/bx.ts": big("x", 5) });
    gitIn("mv", "lib/bx.ts", "lib/by.ts");
    writeFileSync(path.join(repo, "lib/bx.ts"), big("n", 1));
    expect(editFile("lib/bx.ts").code).toBe(0);
    expect(allowed("lib/bx.ts")).toBe(1);
    const r = verify("stop");
    expect(r.code).toBe(2);
    expect(r.err).toContain("lib/bx.ts");
    expect(r.err).not.toContain("lib/by.ts");
    expect(allowed("lib/by.ts")).toBe(5);
    expect(readBaseline()["lib/bx.ts"]).toBeUndefined();
  }, 60_000);

  it("3. one shot, large files: mv x y and a new dissimilar x before any hook run", () => {
    withBig({ "lib/bx.ts": big("x", 5) });
    renameSync(path.join(repo, "lib/bx.ts"), path.join(repo, "lib/by.ts"));
    writeFileSync(path.join(repo, "lib/bx.ts"), big("n", 0));
    stopPasses();
    expect(allowed("lib/by.ts")).toBe(5);
    expect(readBaseline()["lib/bx.ts"]).toBeUndefined();
  }, 60_000);

  it("4. git mv p F && git mv q p: both F and p keep their allowances", () => {
    withBig({ "lib/bp.ts": big("p", 5), "lib/bq.ts": big("q", 3) });
    gitIn("mv", "lib/bp.ts", "lib/bf.ts");
    gitIn("mv", "lib/bq.ts", "lib/bp.ts");
    stopPasses();
    expect(allowed("lib/bf.ts")).toBe(5);
    expect(allowed("lib/bp.ts")).toBe(3);
    expect(readBaseline()["lib/bq.ts"]).toBeUndefined();
  }, 60_000);

  it("5. git mv -f q p over a clean p: p gets q's allowance", () => {
    withBig({ "lib/bp.ts": big("p", 0), "lib/bq.ts": big("q", 5) });
    expect(readBaseline()["lib/bp.ts"]).toBeUndefined();
    gitIn("mv", "-f", "lib/bq.ts", "lib/bp.ts");
    stopPasses();
    expect(allowed("lib/bp.ts")).toBe(5);
    expect(readBaseline()["lib/bq.ts"]).toBeUndefined();
  }, 60_000);

  it("6. a file with a non-ASCII name is linted by stop", () => {
    realLintRepo();
    writeFileSync(path.join(repo, "lib/café.ts"), "// new comment\nexport const cafe = 1;\n");
    const r = verify("stop");
    expect(r.code).toBe(2);
    expect(r.err).toContain("lib/café.ts");
  }, 60_000);
});

describe("verify.mjs claims and moves, review round 5", () => {
  const commitAll = (msg: string) => {
    gitIn("add", "-A");
    gitIn("commit", "-q", "-m", msg);
  };
  function withBig(files: Record<string, string>) {
    realLintRepo();
    for (const [f, text] of Object.entries(files)) writeFileSync(path.join(repo, f), text);
    const made = spawnSync(path.join(repo, "node_modules/.bin/eslint"), ["--suppress-all", ...Object.keys(files)], { cwd: repo, encoding: "utf8" });
    expect(made.status, made.stdout + made.stderr).toBe(0);
    commitAll("big files");
  }
  const claimsFile = () => path.resolve(repo, gitIn("rev-parse", "--git-path", "mp-claude-verify/claims.json").trim());

  it("V1. an entry that changes path gets HEAD's amount, not one pruned against another file at the old path", () => {
    const n = realLintRepo()["lib/x.ts"][RULE].count;
    gitIn("mv", "lib/x.ts", "lib/y.ts");
    writeFileSync(path.join(repo, "lib/x.ts"), "// one\nexport const other = 1;\n");
    expect(editFile("lib/x.ts").code).toBe(0);
    expect(allowed("lib/x.ts")).toBe(1);
    rmSync(path.join(repo, "lib/x.ts"));
    stopPasses();
    expect(allowed("lib/y.ts")).toBe(n);
  }, 60_000);

  it("V2. three moves in a chain keep every allowance in one run", () => {
    withBig({ "lib/bp.ts": big("p", 5), "lib/bq.ts": big("q", 3), "lib/br.ts": big("r", 2) });
    gitIn("mv", "lib/bp.ts", "lib/bf.ts");
    gitIn("mv", "lib/bq.ts", "lib/bp.ts");
    gitIn("mv", "lib/br.ts", "lib/bq.ts");
    stopPasses();
    expect(allowed("lib/bf.ts")).toBe(5);
    expect(allowed("lib/bp.ts")).toBe(3);
    expect(allowed("lib/bq.ts")).toBe(2);
    expect(readBaseline()["lib/br.ts"]).toBeUndefined();
  }, 60_000);

  it("V3. a hook killed during eslint leaves the claim with the moved entry, so the old path stays refused", () => {
    realLintRepo();
    gitIn("mv", "lib/x.ts", "lib/y.ts");
    const wrapper = path.join(repo, "node_modules/.bin/eslint");
    const real = readFileSync(wrapper, "utf8");
    writeFileSync(wrapper, "#!/bin/sh\nkill -9 $PPID\nsleep 5\n");
    const killed = verify("stop");
    expect(killed.code).toBeNull();
    writeFileSync(wrapper, real);
    expect(readBaseline()["lib/y.ts"]).toBeDefined();
    expect(Object.keys(JSON.parse(readFileSync(claimsFile(), "utf8")))).toEqual(["lib/y.ts"]);
    writeFileSync(path.join(repo, "lib/x.ts"), NEW_X);
    expect(editFile("lib/x.ts").code).toBe(2);
    expect(readBaseline()["lib/x.ts"]).toBeUndefined();
  }, 60_000);

  it("V4. stop lints a file in HEAD's baseline that gets nothing because its allowance is claimed", () => {
    realLintRepo();
    renameSync(path.join(repo, "lib/x.ts"), path.join(repo, "lib/y.ts"));
    stopPasses();
    writeFileSync(path.join(repo, "lib/x.ts"), gitIn("show", "HEAD:lib/x.ts"));
    const r = verify("stop");
    expect(r.code).toBe(2);
    expect(r.err).toContain("lib/x.ts");
    expect(editFile("lib/x.ts").code).toBe(2);
  }, 60_000);
});

// An eslint stub with a given body; vitest passes.
function eslintStub(body: string) {
  const bin = path.join(repo, "node_modules/.bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(bin, "eslint"), `#!/bin/sh\n${body}\n`);
  writeFileSync(path.join(bin, "vitest"), "#!/bin/sh\nexit 0\n");
  for (const name of ["eslint", "vitest"]) chmodSync(path.join(bin, name), 0o755);
}

describe("verify.mjs puts the baseline back as it was before the run", () => {
  const snapshot = { "lib/x.ts": { [RULE]: { count: 2 } }, "lib/z.ts": { [RULE]: { count: 1 } } };
  function committed() {
    mkdirSync(path.join(repo, "lib"));
    writeFileSync(path.join(repo, "lib/x.ts"), PRODUCT);
    writeFileSync(path.join(repo, "lib/z.ts"), "export const z = 1;\n");
    writeFileSync(baselineFile(), format(snapshot));
    gitIn("add", "lib", "eslint-suppressions.json");
    gitIn("commit", "-q", "-m", "baseline");
  }

  it("when eslint does not finish, after it half-wrote the file, no entry the run moved survives", () => {
    committed();
    eslintStub(`printf '{"lib/y.ts": {' > "${baselineFile()}"\nexit 2`);
    gitIn("mv", "lib/x.ts", "lib/y.ts");
    const r = verify("stop");
    expect(r.code).toBe(2);
    expect(r.err).toContain("eslint failed");
    expect(readFileSync(baselineFile(), "utf8")).toBe(format(snapshot));
  });

  it("when a file does not parse and the baseline cannot be re-read, the snapshot is written back", () => {
    committed();
    const report = JSON.stringify([{ filePath: path.join(repo, "lib/y.ts"), messages: [{ ruleId: null, fatal: true, severity: 2, message: "Parsing error", line: 1, column: 1 }], fatalErrorCount: 1 }]);
    eslintStub(`echo 'not json' > "${baselineFile()}"\necho '${report}'\nexit 1`);
    gitIn("mv", "lib/x.ts", "lib/y.ts");
    const r = verify("stop");
    expect(r.code).toBe(2);
    expect(r.err).toContain("lib/y.ts does not parse");
    expect(readFileSync(baselineFile(), "utf8")).toBe(format(snapshot));
  });
});

describe("verify.mjs with merge conflict markers in the baseline", () => {
  it("edit, task and stop say to run lint-baseline --resolve", () => {
    stubs();
    writeFileSync(path.join(repo, "a.ts"), "export const a = 1;\n");
    writeFileSync(baselineFile(), '<<<<<<< HEAD\n{"a.ts": {"r": {"count": 1}}}\n=======\n{}\n>>>>>>> main\n');
    for (const r of [verify("edit", { tool_input: { file_path: path.join(repo, "a.ts") } }), verify("task"), verify("stop")]) {
      expect(r.code).toBe(2);
      expect(r.err).toContain("node scripts/lint-baseline.mjs --resolve");
    }
  });
});

describe("verify.mjs records nothing when the tree changed during the run", () => {
  // The vitest stub changes an untracked code file on every run, after the
  // fingerprint is taken.
  function changingVitest(exit: number) {
    stubs();
    writeFileSync(
      path.join(repo, "node_modules/.bin/vitest"),
      `#!/bin/sh\necho "$@" >> "${repo}/.git/vitest.args"\ndate +%s%N >> "${repo}/late.ts"\nexit ${exit}\n`,
    );
    writeFileSync(path.join(repo, "a.ts"), "export const a = 1;\n");
  }

  it("a pass is not recorded, so the next run looks again", () => {
    changingVitest(0);
    for (let i = 0; i < 3; i++) expect(verify("stop").code).toBe(0);
    expect(ranTimes("vitest")).toBe(3);
  });

  it("a failure during which the tree changed is not counted: the attempts start again after it", () => {
    stubs();
    // Changes the tree on the first run only, then fails like any failure.
    writeFileSync(
      path.join(repo, "node_modules/.bin/vitest"),
      `#!/bin/sh\n[ -f "${repo}/.git/changed-once" ] || { touch "${repo}/.git/changed-once"; echo "export const late = 1;" > "${repo}/late.ts"; }\nexit 1\n`,
    );
    writeFileSync(path.join(repo, "a.ts"), "export const a = 1;\n");
    // Run 1 changed the tree: not counted. Runs 2 to 4 are attempts 1 to 3,
    // all still blocking; only run 5 gives up.
    for (let i = 0; i < 4; i++) expect(verify("stop").code, `run ${i + 1}`).toBe(2);
    expect(verify("stop").code).toBe(0);
  });
});

function verifyAsync(mode: string, input: object = {}): Promise<{ code: number | null; err: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [VERIFY, mode], { env: { ...process.env, CLAUDE_PROJECT_DIR: repo } });
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => resolve({ code, err }));
    child.stdin.end(JSON.stringify({ cwd: repo, session_id: "s1", ...input }));
  });
}
