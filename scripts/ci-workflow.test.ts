import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ci.yml runs its parts as parallel jobs, and only `verify` is the required
// check (branch protection, and REQUIRED_CHECKS in pr-risk.mjs). A job that
// verify does not wait on, or a test file that no job runs, would let a pull
// request through untested without anything going red.

const yml = readFileSync(join(__dirname, "../.github/workflows/ci.yml"), "utf8");
const jobsText = yml.slice(yml.indexOf("\njobs:\n") + 1);
const JOB = /^ {2}([a-z][\w-]*):$/gm;
const jobs = [...jobsText.matchAll(JOB)].map((m) => m[1]);

function job(name: string): string {
  const start = jobsText.indexOf(`\n  ${name}:\n`);
  expect(start, `ci.yml has no ${name} job`).toBeGreaterThan(-1);
  const rest = jobsText.slice(start + 1);
  const next = rest.slice(1).search(/^ {2}[a-z][\w-]*:$/m);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

describe("ci.yml", () => {
  it("verify waits on every other job, reads each one's result, and runs even when one failed", () => {
    const verify = job("verify");
    const needs = verify.match(/needs: \[([^\]]*)\]/)?.[1].split(",").map((s) => s.trim());
    const others = jobs.filter((j) => j !== "verify");
    expect(others.length).toBeGreaterThan(1);
    expect(needs?.sort()).toEqual(others.sort());
    for (const name of others) expect(verify).toContain(`needs.${name}.result`);
    expect(verify).toContain("if: always()");
  });

  it("the suite leaves out only the hook tests, which their own job runs", () => {
    const excluded = [...job("test").matchAll(/--exclude (\S+)/g)].map((m) => m[1]);
    expect(excluded).toEqual([".claude/hooks/verify.test.ts"]);
    expect(job("hooks")).toContain(`vitest run ${excluded[0]}`);
  });

  // The hook tests run only when Scope sees a file they exercise change, and
  // the shards leave them out, so a file they copy or run from this checkout
  // that Scope does not list would change with no test running. node_modules
  // stands for the packages, which package.json and the lockfile cover.
  it("Scope lists every file the hook tests read from this checkout", () => {
    const line = job("scope").split("\n").find((l) => l.includes(".claude/hooks/*|"));
    const globs = line!.trim().replace(/\)$/, "").split("|");
    const covered = (file: string) =>
      globs.some((g) => new RegExp(`^${g.replace(/[.+?^${}()[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`).test(file));
    const hookTest = readFileSync(join(__dirname, "../.claude/hooks/verify.test.ts"), "utf8");
    const read = [...hookTest.matchAll(/path\.join\(HERE, "([^"]+)"/g)].map((m) => m[1]);
    const files = [...new Set(read)].filter((p) => p !== "node_modules");
    expect(files.length).toBeGreaterThan(2);
    for (const p of [".claude/hooks/verify.mjs", ".claude/hooks/verify.test.ts", "package.json", "pnpm-lock.yaml", ...files]) {
      const file = statSync(join(__dirname, "..", p)).isDirectory() ? `${p}/any.mjs` : p;
      expect(covered(file), `${p} is read by the hook tests but Scope does not list it`).toBe(true);
    }
  });

  it("splits the suite into exactly the shards the matrix lists", () => {
    const test = job("test");
    const shards = test.match(/shard: \[([^\]]*)\]/)?.[1].split(",").map((s) => Number(s.trim()));
    const total = Number(test.match(/--shard=\$\{\{ matrix\.shard \}\}\/(\d+)/)?.[1]);
    expect(shards).toEqual(Array.from({ length: total }, (_, i) => i + 1));
    expect(test).toContain(`tests (\${{ matrix.shard }}/${total})`);
  });
});
