import { readFileSync } from "node:fs";
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

  it("splits the suite into exactly the shards the matrix lists", () => {
    const test = job("test");
    const shards = test.match(/shard: \[([^\]]*)\]/)?.[1].split(",").map((s) => Number(s.trim()));
    const total = Number(test.match(/--shard=\$\{\{ matrix\.shard \}\}\/(\d+)/)?.[1]);
    expect(shards).toEqual(Array.from({ length: total }, (_, i) => i + 1));
    expect(test).toContain(`tests (\${{ matrix.shard }}/${total})`);
  });
});
