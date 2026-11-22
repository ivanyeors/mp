import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatBaseline, lowerEntry, mergeBaselines, parseAgainst, totalsByRule } from "./lint-baseline.mjs";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "lint-baseline.mjs");
const repo = path.resolve(path.dirname(script), "..");
const run = (args: string[], cwd = repo) => execFileSync("node", [script, ...args], { cwd, encoding: "utf8" });

describe("totalsByRule", () => {
  it("sums each rule's count across files", () => {
    expect(
      totalsByRule({
        "app/a.tsx": { "mp/no-comment": { count: 3 }, "mp/no-effect": { count: 2 } },
        "lib/b.ts": { "mp/no-comment": { count: 4 } },
        "lib/c.ts": { "no-restricted-imports": { count: 1 } },
      }),
    ).toEqual({ "mp/no-comment": 7, "mp/no-effect": 2, "no-restricted-imports": 1 });
  });

  it("counts an empty or missing baseline as zero rules", () => {
    expect(totalsByRule({})).toEqual({});
    expect(totalsByRule(undefined)).toEqual({});
  });
});

describe("parseAgainst", () => {
  it("reads every spelling of --against", () => {
    expect(parseAgainst([])).toBeNull();
    expect(parseAgainst(["--against"])).toBe("origin/main");
    expect(parseAgainst(["--against", "HEAD~1"])).toBe("HEAD~1");
    expect(parseAgainst(["--against=HEAD~1"])).toBe("HEAD~1");
    expect(parseAgainst(["--against", "--other"])).toBe("origin/main");
  });
});

describe("mergeBaselines", () => {
  const c = (count: number) => ({ count });
  const base = {
    "lib/both.ts": { r: c(5) },
    "lib/ours-fixed.ts": { r: c(3) },
    "lib/theirs-moved.ts": { r: c(4) },
    "lib/theirs-raised.ts": { r: c(5) },
    "lib/ours-lowered.ts": { r: c(5) },
    "lib/raised-and-removed.ts": { r: c(5) },
  };
  const ours = {
    "lib/both.ts": { r: c(4) },
    "lib/theirs-moved.ts": { r: c(4) },
    "lib/theirs-raised.ts": { r: c(5) },
    "lib/ours-lowered.ts": { r: c(3) },
    "lib/ours-new.ts": { r: c(2) },
    "lib/new-both.ts": { r: c(6) },
  };
  const theirs = {
    "lib/both.ts": { r: c(2) },
    "lib/ours-fixed.ts": { r: c(3) },
    "lib/theirs-raised.ts": { r: c(7) },
    "lib/ours-lowered.ts": { r: c(5) },
    "lib/raised-and-removed.ts": { r: c(8) },
    "lib/moved-here.ts": { r: c(4) },
    "lib/new-both.ts": { r: c(1) },
  };

  it("is a three-way merge: an unchanged side yields, both changed take the lower, a removal on a changed side wins", () => {
    expect(mergeBaselines(base, ours, theirs)).toEqual({
      "lib/both.ts": { r: c(2) },
      "lib/theirs-raised.ts": { r: c(7) },
      "lib/ours-lowered.ts": { r: c(3) },
      "lib/ours-new.ts": { r: c(2) },
      "lib/moved-here.ts": { r: c(4) },
      "lib/new-both.ts": { r: c(1) },
    });
  });

  it("keeps the owner's raise on one side when the other side left the entry alone", () => {
    expect(mergeBaselines({ x: { r: c(5) } }, { x: { r: c(5) } }, { x: { r: c(7) } })).toEqual({ x: { r: c(7) } });
  });

  it("never yields a count above the higher side", () => {
    const merged = mergeBaselines(base, ours, theirs);
    for (const [file, rules] of Object.entries(merged))
      for (const [rule, { count }] of Object.entries(rules)) {
        const sides = [ours, theirs].map((s) => (s as Record<string, Record<string, { count: number }>>)[file]?.[rule]?.count).filter((n) => n !== undefined);
        expect(count).toBeLessThanOrEqual(Math.max(...(sides as number[])));
      }
  });

  it("is symmetric", () => {
    expect(mergeBaselines(base, ours, theirs)).toEqual(mergeBaselines(base, theirs, ours));
  });
});

describe("lowerEntry (the pre-commit step's prune)", () => {
  const c = (count: number) => ({ count });
  it("lowers a count to the cap, drops a rule the cap lacks, and never raises", () => {
    const b = { "lib/a.ts": { fell: c(3), same: c(2), rose: c(1), gone: c(4) }, "lib/b.ts": { r: c(1) } };
    lowerEntry(b, "lib/a.ts", { fell: c(1), same: c(2), rose: c(9) });
    expect(b).toEqual({ "lib/a.ts": { fell: c(1), same: c(2), rose: c(1) }, "lib/b.ts": { r: c(1) } });
  });

  it("drops an entry left empty, and leaves a file with no entry alone", () => {
    const b = { "lib/a.ts": { r: c(2) } };
    lowerEntry(b, "lib/a.ts", undefined);
    lowerEntry(b, "lib/none.ts", { r: c(5) });
    expect(b).toEqual({});
  });
});

describe("--resolve", () => {
  const gitIn = (dir: string, ...args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const resolveIn = (dir: string) => spawnSync("node", [script, "--resolve"], { cwd: dir, encoding: "utf8" });
  const write = (dir: string, b: object) => writeFileSync(path.join(dir, "eslint-suppressions.json"), formatBaseline(b));

  it("settles a real merge conflict in ESLint's format, without staging it", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lint-baseline-merge-"));
    gitIn(dir, "init", "-q", "-b", "main");
    gitIn(dir, "config", "user.email", "t@example.com");
    gitIn(dir, "config", "user.name", "t");
    write(dir, { "lib/a.ts": { r: { count: 5 } }, "lib/b.ts": { r: { count: 3 } } });
    gitIn(dir, "add", ".");
    gitIn(dir, "commit", "-q", "-m", "base");
    gitIn(dir, "checkout", "-q", "-b", "side");
    write(dir, { "lib/a.ts": { r: { count: 2 } }, "lib/b.ts": { r: { count: 3 } } });
    gitIn(dir, "commit", "-q", "-am", "side lowers a");
    gitIn(dir, "checkout", "-q", "main");
    write(dir, { "lib/a.ts": { r: { count: 4 } }, "lib/c.ts": { r: { count: 1 } } });
    gitIn(dir, "commit", "-q", "-am", "main lowers a, fixes b, adds c");
    expect(() => gitIn(dir, "merge", "-q", "side")).toThrow();
    expect(readFileSync(path.join(dir, "eslint-suppressions.json"), "utf8")).toContain("<<<<<<<");

    const r = resolveIn(dir);
    expect(r.status).toBe(0);
    expect(readFileSync(path.join(dir, "eslint-suppressions.json"), "utf8")).toBe(
      formatBaseline({ "lib/a.ts": { r: { count: 2 } }, "lib/c.ts": { r: { count: 1 } } }),
    );
    expect(gitIn(dir, "ls-files", "-u")).not.toBe("");
  });

  it("outside a conflict says so, changes nothing and exits 1", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lint-baseline-merge-"));
    gitIn(dir, "init", "-q");
    write(dir, { "lib/a.ts": { r: { count: 5 } } });
    const before = readFileSync(path.join(dir, "eslint-suppressions.json"), "utf8");
    const r = resolveIn(dir);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("not in a merge conflict");
    expect(readFileSync(path.join(dir, "eslint-suppressions.json"), "utf8")).toBe(before);
  });
});

describe("--prune-staged (the pre-commit step)", () => {
  const gitIn = (dir: string, ...args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const put = (dir: string, file: string, text: string) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  };
  const debuggers = (n: number) => "debugger;\n".repeat(n);
  const staged = (dir: string) => JSON.parse(gitIn(dir, "show", ":eslint-suppressions.json"));
  const working = (dir: string) => JSON.parse(readFileSync(path.join(dir, "eslint-suppressions.json"), "utf8"));

  it("lowers only what this commit stages, drops a deleted file, keeps an unparsable one, and carries the drop to the working file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lint-baseline-prune-"));
    symlinkSync(path.join(repo, "node_modules"), path.join(dir, "node_modules"));
    put(dir, "eslint.config.mjs", 'export default [{ rules: { "no-debugger": "error" } }];\n');
    put(dir, ".gitignore", "node_modules\n");
    put(dir, "lib/lowered.js", debuggers(3));
    put(dir, "lib/unstaged.js", debuggers(2));
    put(dir, "lib/deleted.js", debuggers(1));
    put(dir, "lib/broken.js", debuggers(2));
    const rule = (count: number) => ({ "no-debugger": { count } });
    put(
      dir,
      "eslint-suppressions.json",
      formatBaseline({
        "lib/lowered.js": rule(3),
        "lib/unstaged.js": rule(2),
        "lib/deleted.js": rule(1),
        "lib/broken.js": rule(2),
      }),
    );
    gitIn(dir, "init", "-q", "-b", "main");
    gitIn(dir, "config", "user.email", "t@example.com");
    gitIn(dir, "config", "user.name", "t");
    gitIn(dir, "add", ".");
    gitIn(dir, "commit", "-q", "-m", "base");

    put(dir, "lib/lowered.js", debuggers(1));
    put(dir, "lib/unstaged.js", "");
    put(dir, "lib/broken.js", "debugger;\nconst = ;\n");
    gitIn(dir, "add", "lib/lowered.js", "lib/broken.js");
    gitIn(dir, "rm", "-q", "lib/deleted.js");

    const r = spawnSync("node", [script, "--prune-staged"], { cwd: dir, encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toContain("lowered eslint-suppressions.json in this commit for lib/lowered.js, lib/deleted.js");

    expect(staged(dir)).toEqual({
      "lib/lowered.js": rule(1),
      "lib/unstaged.js": rule(2),
      "lib/broken.js": rule(2),
    });
    expect(working(dir)).toEqual(staged(dir));
    expect(gitIn(dir, "diff", "--name-only", "--", "eslint-suppressions.json")).toBe("");
  });

  it("leaves the baseline alone when nothing staged has an entry", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lint-baseline-prune-"));
    put(dir, "eslint-suppressions.json", formatBaseline({ "lib/a.js": { "no-debugger": { count: 1 } } }));
    put(dir, "lib/other.js", "");
    gitIn(dir, "init", "-q", "-b", "main");
    gitIn(dir, "add", ".");
    const before = gitIn(dir, "show", ":eslint-suppressions.json");
    const r = spawnSync("node", [script, "--prune-staged"], { cwd: dir, encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stderr).toBe("");
    expect(gitIn(dir, "show", ":eslint-suppressions.json")).toBe(before);
  });
});

describe("the command", () => {
  it("names a ref that does not exist instead of counting it as zero", () => {
    const out = run(["--against", "orgin/main-typo"]);
    expect(out).toContain('no commit or branch named "orgin/main-typo"');
    expect(out).not.toContain("total");
  });

  it("says a ref without the file counts as zero", () => {
    const first = execFileSync("git", ["rev-list", "--max-parents=0", "HEAD"], { cwd: repo, encoding: "utf8" }).trim().split("\n")[0];
    expect(run([`--against=${first}`])).toContain(`${first} has no eslint-suppressions.json; counted as zero`);
  });

  it("reports a missing or invalid baseline in words and exits 0", () => {
    const empty = mkdtempSync(path.join(tmpdir(), "lint-baseline-"));
    expect(run([], empty)).toContain("no eslint-suppressions.json");
    writeFileSync(path.join(empty, "eslint-suppressions.json"), "{ not json");
    expect(run([], empty)).toContain("is not valid JSON");
  });
});
