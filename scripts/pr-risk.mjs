#!/usr/bin/env node
// Whether a pull request may merge itself, for .github/workflows/auto-merge.yml.
//
// The repository variable AUTO_MERGE_CODE is the owner's switch: `on` lets a
// pull request that passes its checks merge without the owner, unless it
// touches a path that always waits for the owner (classify). Anything else,
// including unset, is off, and off is how the repo has always worked.
//
// The decision is pure functions over facts the workflow read from the API,
// so it can be tested without GitHub. The failure direction is the point:
// this merges code to production unreviewed, so every fact that is missing,
// unreadable or not exactly the expected value is a reason not to merge.
//
//   node scripts/pr-risk.mjs <facts-dir> <money.md>
//
// reads the files the workflow wrote into <facts-dir> (see readFacts), writes
// the verdict to the job summary, and sets the step outputs `merge`, `head`
// and `base_tip`. Then, just before merging:
//
//   node scripts/pr-risk.mjs tip-check <base_tip> <tip now> <branch>
//
// exits 1 when main's tip has moved since the facts were read (tipReason).

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// The rails are mostly rules, not names (isRail):
// - every file at the repository root, except Markdown other than CLAUDE.md
//   and CLAUDE.local.md. The root holds configuration, and a list of names
//   loses to the tools' own lookup order: ESLint 9 tries eslint.config.js
//   before .mjs, and Next 16 tries next.config.js and .mjs before .ts, so a
//   new spelling with the checks off would otherwise merge itself;
// - every root dot-folder (.github, .githooks, .claude, ...) except the PRD
//   folders, and a CLAUDE.md or .claude/ at any depth: the checks a pull
//   request is judged by, and the instructions Claude loads.
// These are the rails that live in folders. This file and its test are among
// them, so a pull request cannot loosen the gate it is being judged by.
const RAILS = [
  "**/package.json",
  "**/tsconfig*.json",
  "**/eslint.config.*",
  "eslint-rules/**",
  "scripts/checks.mjs",
  "scripts/pr-risk.mjs",
  "scripts/pr-risk.test.ts",
  "scripts/git-identity",
];

// Root files that are not rails. Markdown is only prose (CLAUDE.md and
// CLAUDE.local.md are caught first, as instructions). eslint-suppressions.json
// is judged by its totals instead (baselineGrowth): pull requests that burn
// the baseline down shrink it, and that should not wait for the owner.
const ROOT_PROSE = /\.md$/i;
const ROOT_JUDGED_ELSEWHERE = new Set(["eslint-suppressions.json"]);

// Claude's instructions, wherever they sit.
const INSTRUCTIONS = ["**/CLAUDE.md", "**/CLAUDE.local.md", "*/**/.claude/**"];

// PRDs and their issues are plans, not rails, though they live under .claude/.
const PLANS = [".claude/PRD-*/**"];

// Sign-in, sessions, roles and permissions. Found by reading the tree in
// November 2026; a new folder of this kind belongs here too.
//   lib/auth            roles, permission matrix, admin and partner context, sign-in actions
//   lib/supabase        the clients (service role included) and the session-refresh middleware
//   lib/staff           staff profiles and the "working as" cookie
//   lib/results/access.ts                       the Staff-or-shopper gate on mp-config routes
//   lib/partner-backup-email.ts, app/api/partner/backup-email   a partner's backup sign-in email
//   app/auth            sign-in callback, email confirm, sign-out
//   components/auth     login form, sign-in tabs, account security
//   app/*/account/login, app/*/settings/login   the two sign-in pages
//   app/*/settings/users                        Users & permissions (members, roles)
//   app/api/admin       admin context, roles, users, working-as
//   app/api/staff       staff profiles
//   app/api/partner/context                     the partner's session context
const ACCESS = [
  "lib/auth/**",
  "lib/supabase/**",
  "lib/staff/**",
  "lib/results/access.ts",
  "lib/partner-backup-email.ts",
  "app/api/partner/backup-email/**",
  "app/auth/**",
  "components/auth/**",
  "app/*/account/login/**",
  "app/*/settings/login/**",
  "app/*/settings/users/**",
  "app/api/admin/**",
  "app/api/staff/**",
  "app/api/partner/context/**",
];

// Schema, RLS policies and database functions.
const DATABASE = ["supabase/**"];

// Patterns every list above, and money.md's, is held to: plain path segments,
// `*` inside a segment, `**` as a whole segment. Anything else (braces, `?`,
// character classes, a comment) is a pattern the matcher would get wrong.
const SEGMENT = /^[A-Za-z0-9._@-]*(?:\*[A-Za-z0-9._@-]*)*$/;
export function isSupportedPattern(glob) {
  if (typeof glob !== "string" || !glob || glob.startsWith("/") || glob.endsWith("/")) return false;
  return glob.split("/").every((s) => s === "**" || (s !== "" && !s.includes("**") && SEGMENT.test(s)));
}
export const PATTERNS = { RAILS, INSTRUCTIONS, PLANS, ACCESS, DATABASE };

// The ci.yml job. It must have run and concluded success: without naming it,
// "every check run finished and none failed" is true of a head with no check
// runs yet, and a skipped verify is not a verified head.
const REQUIRED_CHECKS = ["verify"];

// Check-run conclusions that are not a failure, for every other check.
// Anything else, including a value GitHub adds later, counts as failed.
const PASSING = new Set(["success", "neutral", "skipped"]);

// The logins whose comment can carry the review verdict. Which one
// claude-code-action posts as is unconfirmed: the Claude GitHub App
// (claude[bot]) or the workflow's own token (github-actions[bot]). A Claude
// session on another surface may also post as claude[bot]. After the first
// real review, narrow this to the login that review used.
//
// The opener's login is not accepted, so a verdict the opener writes does not
// count. The owner's login can still edit a bot's comment; the same
// credentials can merge by hand, so that gains nothing, but this is not proof
// that no person wrote the verdict.
export const VERDICT_LOGINS = new Set(["claude[bot]", "github-actions[bot]"]);

// Statuses Vercel posts. The combined state is success whenever every context
// present is, so a head Vercel never built would pass on any other status.
const VERCEL = /^vercel/i;

// The compare API lists at most 300 files; a list that long may be cut off.
const COMPARE_FILE_LIMIT = 300;

// Many pull requests prune the baseline, and a textual conflict in it already
// blocks the merge, so main changing it is not a reason to re-run checks.
const STALE_EXEMPT = new Set(["eslint-suppressions.json"]);

// Control characters (C0, DEL, C1, which holds U+0085 NEXT LINE) and the
// Unicode line terminators. git allows them in a name; a path that holds one
// is not judged by pattern at all. By code, not a regex, which lint forbids
// for control characters.
export function hasUnsafeCharacter(file) {
  for (const ch of file) {
    const code = ch.codePointAt(0);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029) return true;
  }
  return false;
}

function escape(text) {
  return text.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

// Case-insensitive, and nothing in a name stops a wildcard: `[^/]` and
// `[\s\S]` match line terminators, which `.` does not.
function globToRegExp(glob) {
  const segments = glob.split("/");
  let re = "";
  segments.forEach((segment, i) => {
    const last = i === segments.length - 1;
    if (segment === "**") {
      re += last ? "[\\s\\S]*" : "(?:[^/]*/)*";
      return;
    }
    re += segment.split("*").map(escape).join("[^/]*") + (last ? "" : "/");
  });
  return new RegExp(`^${re}$`, "i");
}

export function matches(file, globs) {
  return globs.some((g) => globToRegExp(g).test(file));
}

export function isRail(file) {
  if (matches(file, INSTRUCTIONS)) return true;
  if (!file.includes("/")) return !ROOT_PROSE.test(file) && !ROOT_JUDGED_ELSEWHERE.has(file);
  if (file.startsWith(".") && !matches(file, PLANS)) return true;
  return matches(file, RAILS);
}

// The `paths:` list in money.md's front matter, so the money paths have one
// home. Strict: every line of the list must be one quoted or bare pattern the
// matcher supports, or the whole list is unread (null). A line skipped here
// would be a money path that merges itself.
export function parseMoneyPaths(markdown) {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown ?? "");
  if (!front) return null;
  const lines = front[1].split(/\r?\n/);
  const start = lines.findIndex((line) => /^paths:/.test(line));
  if (start === -1 || !/^paths:\s*$/.test(lines[start])) return null;
  const paths = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    if (/^\s*$/.test(line)) continue;
    const item = /^\s+-\s+(?:"([^"]*)"|'([^']*)'|([^\s"'#]+))\s*$/.exec(line);
    const pattern = item && (item[1] ?? item[2] ?? item[3]);
    if (!isSupportedPattern(pattern)) return null;
    paths.push(pattern);
  }
  return paths.length ? paths : null;
}

// path -> rule -> { count } (ESLint's bulk suppressions file), summed per
// rule. Throws on any other shape: a file it cannot read is not a zero.
export function ruleTotals(suppressions) {
  if (!suppressions || typeof suppressions !== "object" || Array.isArray(suppressions)) {
    throw new Error("eslint-suppressions.json is not an object of paths");
  }
  const totals = {};
  for (const [file, rules] of Object.entries(suppressions)) {
    if (!rules || typeof rules !== "object" || Array.isArray(rules)) {
      throw new Error(`eslint-suppressions.json: ${file} is not an object of rules`);
    }
    for (const [rule, entry] of Object.entries(rules)) {
      const count = entry?.count;
      if (!Number.isInteger(count) || count < 0) {
        throw new Error(`eslint-suppressions.json: ${file} ${rule} has no whole count`);
      }
      totals[rule] = (totals[rule] ?? 0) + count;
    }
  }
  return totals;
}

// Rules whose total is higher at the head than at the base. A side with no
// file is passed as {} and counts as zero.
export function baselineGrowth(base, head) {
  const before = ruleTotals(base);
  const after = ruleTotals(head);
  return Object.keys(after)
    .filter((rule) => after[rule] > (before[rule] ?? 0))
    .sort()
    .map((rule) => `${rule} ${before[rule] ?? 0} → ${after[rule]}`);
}

// Why this change waits for the owner, in words; empty when it need not.
// `baseline` is { base, head }, the parsed suppressions file on each side.
export function ownerReasons(files, moneyPaths, baseline = { base: {}, head: {} }) {
  const reasons = [];
  const families = [
    ["a money path", moneyPaths],
    ["the database", DATABASE],
    ["sign-in, sessions, roles or permissions", ACCESS],
  ];
  for (const file of files) {
    if (hasUnsafeCharacter(file)) {
      reasons.push(`${JSON.stringify(file)} has a control character or line break in its name`);
      continue;
    }
    for (const [what, globs] of families) {
      if (matches(file, globs)) reasons.push(`${file} is ${what}`);
    }
    if (isRail(file)) reasons.push(`${file} is one of the rails`);
  }
  for (const grew of baselineGrowth(baseline.base, baseline.head)) {
    reasons.push(`the lint baseline grew: ${grew}`);
  }
  return reasons;
}

export function classify(files, moneyPaths, baseline) {
  return ownerReasons(files, moneyPaths, baseline).length ? "owner" : "auto";
}

// The head reviewed, and the base branch it was reviewed against: a review of
// a stacked pull request saw only its own delta, so its verdict says nothing
// once the pull request is retargeted at main.
const VERDICT = /^Verdict: (clean|findings) at ([0-9a-f]{40}) against (\S+)$/;

// The review's verdict on `head` against `base`: the first line of a comment
// by a verdict login, exactly. Returns a reason not to merge, or null when the
// head passed against that base.
export function reviewReason(comments, head, base) {
  const verdicts = comments
    .filter((c) => VERDICT_LOGINS.has(c?.login))
    .map((c) => VERDICT.exec(String(c.body ?? "").split(/\r?\n/)[0].trim()))
    .filter(Boolean)
    .map(([, kind, sha, against]) => ({ kind, sha, against }));
  const mine = verdicts.filter((v) => v.sha === head);
  if (mine.some((v) => v.kind === "findings")) return `Claude review found problems at ${head}`;
  if (base && mine.some((v) => v.kind === "clean" && v.against === base)) return null;
  const last = verdicts.at(-1);
  const others = last ? ` (its last verdict was ${last.kind} at ${last.sha} against ${last.against})` : "";
  return `Claude review has not passed this head ${head} against ${base ?? "the default branch"}${others}. It posts a verdict only when the CLAUDE_CODE_OAUTH_TOKEN repository secret is set`;
}

// Immediately before the merge: main's tip must still be the one the facts
// were read against, or what main changed (the overlap rule) is out of date.
export function tipReason(judged, now, branch = "main") {
  if (!/^[0-9a-f]{40}$/.test(now ?? "")) return `could not read ${branch}'s tip again before merging; run this again`;
  if (now !== judged) {
    return `${branch} moved from ${judged} to ${now} while this was judged, so what ${branch} changed was read too early; run this again`;
  }
  return null;
}

// Merge, or every reason not to. `facts` is what readFacts returns; any fact
// that is null could not be read, and that alone stops the merge.
export function decide(facts) {
  const no = [];
  const unread = (what) => no.push(`could not read ${what}`);

  if (facts.switch !== "on") {
    no.push(`the AUTO_MERGE_CODE switch is ${facts.switch ? `"${facts.switch}"` : "unset"}, not "on"`);
  }

  const pr = facts.pr;
  const head = pr?.head?.sha;
  if (!pr) {
    unread("the pull request");
  } else {
    if (pr.state !== "open") no.push(`the pull request is ${pr.state ?? "in an unknown state"}, not open`);
    if (pr.draft !== false) no.push("the pull request is a draft");
    if (!facts.repository || pr.head?.repo?.full_name !== facts.repository) {
      no.push(`the pull request comes from ${pr.head?.repo?.full_name ?? "an unknown repository"}, not this one`);
    }
    if (!facts.owner || pr.user?.login !== facts.owner) {
      no.push(`the pull request was opened by ${pr.user?.login ?? "an unknown login"}, not the repository owner`);
    }
    if (!facts.defaultBranch || pr.base?.ref !== facts.defaultBranch) {
      no.push(`the pull request targets ${pr.base?.ref ?? "an unknown branch"}, not ${facts.defaultBranch ?? "the default branch"}`);
    }
    if (pr.mergeable !== true) {
      no.push(
        pr.mergeable === false
          ? "GitHub says the pull request does not merge cleanly"
          : "GitHub has not worked out whether the pull request merges cleanly",
      );
    }
  }

  if (!facts.baseTip) {
    unread(`the tip of ${facts.defaultBranch ?? "the default branch"}`);
  } else if (!facts.owner || facts.baseTip.login !== facts.owner) {
    no.push(
      `${facts.defaultBranch}'s tip ${facts.baseTip.sha} is authored by ${facts.baseTip.login || "no GitHub user"}, not ${facts.owner}. ` +
        `Vercel builds only commits authored by ${facts.owner}, so production may be behind ${facts.defaultBranch}. ` +
        `Nothing merges itself until a commit authored by ${facts.owner} reaches ${facts.defaultBranch}: any merge ${facts.owner} makes by hand`,
    );
  }

  if (!facts.files) unread("the complete list of changed files");
  else if (facts.files.length === 0) no.push("the pull request changes no files");
  if (!facts.moneyPaths) unread("the money paths in .claude/rules/money.md");
  if (!facts.baseline) unread("eslint-suppressions.json on both sides");
  if (facts.files?.length && facts.moneyPaths && facts.baseline) {
    try {
      for (const why of ownerReasons(facts.files, facts.moneyPaths, facts.baseline)) {
        no.push(`it waits for the owner: ${why}`);
      }
    } catch (err) {
      unread(`the lint baseline (${err.message})`);
    }
  }

  if (!facts.mainChanged) {
    unread(`what changed on ${facts.defaultBranch ?? "the default branch"} since the branch left it`);
  } else if (facts.files) {
    const theirs = new Set(facts.mainChanged.map((f) => f.toLowerCase()));
    const both = [...new Set(facts.files)].filter((f) => !STALE_EXEMPT.has(f) && theirs.has(f.toLowerCase()));
    if (both.length) {
      no.push(
        `${facts.defaultBranch} has changed ${both.join(", ")} since this branch left it, so its checks never ran against the code it would merge into. Merge ${facts.defaultBranch} into the branch and push`,
      );
    }
  }

  if (!facts.checkRuns) {
    unread("the check runs on the head commit");
  } else {
    for (const name of REQUIRED_CHECKS) {
      const runs = facts.checkRuns.filter((run) => run.name === name);
      if (!runs.length) no.push(`the ${name} check has not started on the head commit`);
      else if (runs.some((run) => run.status === "completed" && run.conclusion !== "success")) {
        no.push(`the ${name} check must succeed, and it ended ${runs.map((r) => r.conclusion ?? "with no conclusion").join(", ")}`);
      }
    }
    for (const run of facts.checkRuns) {
      if (run.status !== "completed") no.push(`the ${run.name} check is ${run.status ?? "in an unknown state"}`);
      else if (!PASSING.has(run.conclusion) && !REQUIRED_CHECKS.includes(run.name)) {
        no.push(`the ${run.name} check ended ${run.conclusion ?? "with no conclusion"}`);
      }
    }
  }

  if (!facts.statuses) {
    unread("the commit statuses (Vercel's build)");
  } else {
    const seen = facts.statuses.length
      ? `; statuses seen: ${facts.statuses.map((s) => `${s.context}=${s.state}`).join(", ")}`
      : "; no statuses at all";
    const vercel = facts.statuses.some((s) => VERCEL.test(s.context ?? "") && s.state === "success");
    const bad = facts.statuses.filter((s) => s.state !== "success");
    if (!vercel) no.push(`no Vercel status is success on the head${seen}`);
    else if (bad.length) no.push(`a commit status is not success${seen}`);
  }

  if (facts.unresolvedThreads == null) unread("the review threads");
  else if (facts.unresolvedThreads > 0) no.push(`${facts.unresolvedThreads} review thread(s) are unresolved`);

  if (!facts.comments) unread("every comment on the pull request");
  else if (head) {
    const why = reviewReason(facts.comments, head, facts.defaultBranch);
    if (why) no.push(why);
  }

  if (!facts.headNow) unread("the pull request's head after reading the facts");
  else if (head !== facts.headNow) no.push(`the head moved from ${head ?? "unknown"} to ${facts.headNow} while the facts were read`);

  return no.length ? { merge: false, reasons: no } : { merge: true, reasons: [] };
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function readLines(path) {
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8").split("\n").filter(Boolean);
}

function readNdjson(path) {
  const lines = readLines(path);
  if (!lines) return null;
  try {
    return lines.map((line) => JSON.parse(line));
  } catch {
    return null;
  }
}

const renamed = (entries) =>
  entries.flatMap((e) => [e?.filename, e?.previous_filename]).filter((f) => typeof f === "string");

// The files the workflow wrote. A step that failed leaves its file out, and a
// missing or unparseable file becomes null here, which decide refuses.
//
//   pr.json                    GET /pulls/{n}
//   files.ndjson               one {filename, previous_filename} per changed file
//   suppressions-base.json     eslint-suppressions.json at the merge base,
//   suppressions-head.json     and at the head; or a .absent marker for a 404
//   main-changed.json          {files: [{filename, previous_filename}]}, merge base to the base's tip
//   base-tip.txt               "<sha> <author login>" of the base's tip, "(none)" for no GitHub user
//   check-runs.ndjson          one {name, status, conclusion} per check run
//   statuses.ndjson            one {context, state} per commit status context
//   comments.ndjson            one {login, body} per comment on the pull request
//   unresolved-threads.txt     a count, written only when every thread was read
//   head-now.txt               the head sha read again after everything else
export function readFacts(dir, moneyMarkdown, env) {
  const pr = readJson(join(dir, "pr.json"));

  let files = null;
  const entries = readNdjson(join(dir, "files.ndjson"));
  // The files endpoint stops at 3000; a short list would hide the rest.
  if (entries && pr && Number.isInteger(pr.changed_files) && entries.length === pr.changed_files) {
    // A rename out of a guarded folder changes that folder too.
    files = renamed(entries);
  }

  const side = (name) => {
    if (existsSync(join(dir, `suppressions-${name}.absent`))) return {};
    return readJson(join(dir, `suppressions-${name}.json`));
  };
  const base = side("base");
  const head = side("head");

  const compare = readJson(join(dir, "main-changed.json"));
  const mainChanged =
    Array.isArray(compare?.files) && compare.files.length < COMPARE_FILE_LIMIT ? renamed(compare.files) : null;

  const text = (name) => {
    const lines = readLines(join(dir, name));
    return lines?.length === 1 ? lines[0].trim() : null;
  };
  const tip = /^([0-9a-f]{40}) (\S+)$/.exec(text("base-tip.txt") ?? "");
  const threads = text("unresolved-threads.txt");

  return {
    switch: env.AUTO_MERGE_CODE ?? "",
    repository: env.REPOSITORY || null,
    owner: env.REPOSITORY_OWNER || null,
    defaultBranch: env.DEFAULT_BRANCH || null,
    pr,
    files,
    moneyPaths: moneyMarkdown == null ? null : parseMoneyPaths(moneyMarkdown),
    baseline: base && head ? { base, head } : null,
    mainChanged,
    baseTip: tip ? { sha: tip[1], login: tip[2] } : null,
    checkRuns: readNdjson(join(dir, "check-runs.ndjson")),
    statuses: readNdjson(join(dir, "statuses.ndjson")),
    comments: readNdjson(join(dir, "comments.ndjson")),
    unresolvedThreads: threads != null && /^\d+$/.test(threads) ? Number(threads) : null,
    headNow: text("head-now.txt"),
  };
}

// `tip-check <judged> <now> <branch>`: the Merge step's last look at main.
// Exits 1 with the reason in the summary when the merge must not go ahead.
function tipCheck([judged, now, branch]) {
  const why = tipReason(judged, now, branch);
  if (!why) return;
  const summary = `### #${process.env.PR_NUMBER ?? "?"}: not merging\n\n- ${why}\n`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  process.exitCode = 1;
}

function main([dir, moneyFile]) {
  const money = moneyFile && existsSync(moneyFile) ? readFileSync(moneyFile, "utf8") : null;
  const facts = readFacts(dir, money, process.env);
  const verdict = decide(facts);
  const number = facts.pr?.number ?? process.env.PR_NUMBER ?? "?";

  const summary = verdict.merge
    ? `### #${number}: merging\n\nEvery condition holds; squash-merging ${facts.pr.head.sha}.\n`
    : `### #${number}: not merging\n\n${verdict.reasons.map((r) => `- ${r}`).join("\n")}\n`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `merge=${verdict.merge}\nhead=${verdict.merge ? facts.pr.head.sha : ""}\nbase_tip=${verdict.merge ? facts.baseTip.sha : ""}\n`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "tip-check") tipCheck(rest);
  else main([command, ...rest]);
}
