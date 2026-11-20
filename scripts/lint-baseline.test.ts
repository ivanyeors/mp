import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseAgainst, totalsByRule } from "./lint-baseline.mjs";

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
