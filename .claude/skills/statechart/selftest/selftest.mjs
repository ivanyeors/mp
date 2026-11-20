// Runs the statechart command on the toy checkout and checks that it finds
// the bug and then passes the fix. Run it after changing scripts/:
//
//   node .claude/skills/statechart/selftest/selftest.mjs
//
// The first run downloads TLC (and, with mise, Java), so it needs the network.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const command = join(here, "..", "scripts", "statechart");
const scratch = mkdtempSync(join(tmpdir(), "statechart-selftest-"));

function run(config, out) {
  const r = spawnSync(
    command,
    [join(here, "Checkout.tla"), "--config", join(here, config), "--view", join(here, "view.mjs"), "--out", join(scratch, out)],
    { encoding: "utf8" },
  );
  const report = existsSync(join(scratch, out, "report.md")) ? readFileSync(join(scratch, out, "report.md"), "utf8") : "";
  const chart = existsSync(join(scratch, out, "chart.mmd")) ? readFileSync(join(scratch, out, "chart.mmd"), "utf8") : "";
  return { status: r.status, stderr: r.stderr, report, chart };
}

try {
  const buggy = run("Checkout.cfg", "buggy");
  assert.equal(buggy.status, 1, `the buggy checkout should break a rule (exit 1):\n${buggy.stderr}`);
  assert.match(buggy.report, /## PaidOrderHasItsPillow breaks/);
  assert.match(buggy.report, /Paid, no pillow set aside/);
  assert.match(buggy.chart, /breaks/);
  console.log("ok  buggy checkout: PaidOrderHasItsPillow breaks, with a path to it");

  const fixed = run("CheckoutFixed.cfg", "fixed");
  assert.equal(fixed.status, 0, `the fixed checkout should hold (exit 0):\n${fixed.stderr}\n${fixed.report}`);
  assert.doesNotMatch(fixed.report, /## \w+ breaks/);
  assert.match(fixed.chart, /Refunded/);
  console.log("ok  fixed checkout: every rule holds");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
