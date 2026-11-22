#!/usr/bin/env node
// Whether CI pauses for the rest of the month because the account's GitHub
// Actions minutes are nearly used up, for .github/workflows/ci.yml.
//
// Private repositories get a monthly allowance of Actions compute (about
// 2,000 Linux minutes on GitHub Free, 3,000 on Pro), shared by every private
// repository on the account and reset at 00:00 UTC on the 1st. With no payment
// method, GitHub stops starting jobs once it is spent, and a pull request whose
// required check cannot start cannot merge. In November 2026 a full CI run
// took 13 to 19 minutes, most of it the test step, so CI is where the
// allowance goes.
//
// So CI reads this month's usage first. At or past the pause point it skips
// install, lint, typecheck, tests and checks, and says so: the verify job
// still reports, so the owner can merge by hand, and ci.yml's unverified job
// marks the head so auto-merge does not merge what nothing tested.
//
// Every way of not knowing the usage runs CI in full: no token, a failed
// request, an answer in a shape this does not recognise. Pausing is only ever
// the result of reading a number at or past the pause point.
//
//   BILLING_TOKEN  the ACTIONS_BILLING_TOKEN secret: a fine-grained personal
//                  access token of the account owner with the "Plan" account
//                  permission, read-only, and no repository access
//   PAUSE_AT       the CI_PAUSE_AT_MINUTES variable; unset is DEFAULT_PAUSE_AT
//   OWNER          the account whose usage is read
//
//   node scripts/actions-minutes.mjs
//
// sets the step output `pause` (true or false) and writes the count to the
// job summary.

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// 90% of GitHub Free's allowance: the rest is left for pull request guards,
// auto-merge, Claude review and the paused CI runs themselves, which still
// cost a minute each. On GitHub Pro set CI_PAUSE_AT_MINUTES to about 2700.
export const DEFAULT_PAUSE_AT = 1800;

// Minutes of Actions compute in a usage report from
// GET /users/{username}/settings/billing/usage. Storage (gigabyte-hours) and
// other products are not minutes. The report has called the product "Actions"
// and "actions", and the amount `quantity` and `grossQuantity`, so both of each
// are read. Gross, not net: net is only what is billed past the allowance, and
// the point is to stop before there is any.
export function minutesUsed(report) {
  const items = report?.usageItems;
  if (!Array.isArray(items)) throw new Error("the usage report has no usageItems list");
  let used = 0;
  for (const item of items) {
    if (String(item?.product).toLowerCase() !== "actions") continue;
    if (String(item?.unitType).toLowerCase() !== "minutes") continue;
    const quantity = Number(item.grossQuantity ?? item.quantity);
    if (!Number.isFinite(quantity)) throw new Error(`an Actions usage item has no quantity: ${JSON.stringify(item)}`);
    used += quantity;
  }
  return used;
}

export function pauseAt(value) {
  if (value === undefined || value === "") return { at: DEFAULT_PAUSE_AT };
  const at = Number(value);
  if (Number.isInteger(at) && at > 0) return { at };
  return { at: DEFAULT_PAUSE_AT, problem: `CI_PAUSE_AT_MINUTES is "${value}", not a whole number of minutes; using ${DEFAULT_PAUSE_AT}` };
}

// The whole decision, with the request passed in so it can be tested without
// GitHub. Returns whether to pause and the lines to print, which include the
// workflow commands that put warnings on the run.
export async function run({ token, owner, pauseAtValue, now, fetchImpl }) {
  if (!token) {
    return { pause: false, lines: ["No ACTIONS_BILLING_TOKEN secret, so minutes are not checked and CI runs in full."] };
  }
  const lines = [];
  const limit = pauseAt(pauseAtValue);
  if (limit.problem) lines.push(`::warning title=CI_PAUSE_AT_MINUTES ignored::${limit.problem}`);

  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const url = `https://api.github.com/users/${encodeURIComponent(owner)}/settings/billing/usage?year=${year}&month=${month}`;
  let used;
  try {
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
    used = Math.round(minutesUsed(await response.json()));
  } catch (error) {
    lines.push(`::warning title=Could not read Actions minutes::${error.message}. CI runs in full.`);
    return { pause: false, lines };
  }

  const pause = used >= limit.at;
  lines.push(`Actions minutes used in ${year}-${String(month).padStart(2, "0")}: ${used}. CI pauses at ${limit.at}.`);
  if (pause) {
    lines.push(
      `::warning title=CI paused: Actions minutes::${used} of this month's Actions minutes are used (CI pauses at ${limit.at}). ` +
        "Install, lint, typecheck, tests and checks did not run on this pull request. Merge by hand only if you accept that; auto-merge will not merge it. " +
        "CI runs in full again from the 1st (UTC), or sooner if CI_PAUSE_AT_MINUTES is raised.",
    );
  }
  return { pause, used, at: limit.at, lines };
}

async function main() {
  const result = await run({
    token: process.env.BILLING_TOKEN,
    owner: process.env.OWNER,
    pauseAtValue: process.env.PAUSE_AT,
    now: new Date(),
    fetchImpl: fetch,
  });
  for (const line of result.lines) console.log(line);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `pause=${result.pause}\n`);
  if (process.env.GITHUB_STEP_SUMMARY && result.used !== undefined) {
    const state = result.pause ? "**paused**: lint, typecheck, tests and checks skipped" : "runs in full";
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Actions minutes\n\n${result.used} used this month; CI pauses at ${result.at}. CI ${state}.\n`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
