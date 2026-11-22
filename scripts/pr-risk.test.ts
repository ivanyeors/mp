import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  classify,
  decide,
  isSupportedPattern,
  matches,
  ownerReasons,
  parseMoneyPaths,
  PATTERNS,
  readFacts,
  tipReason,
  // @ts-expect-error -- plain .mjs script, no type declarations
} from "./pr-risk.mjs";

const moneyMd = readFileSync(join(__dirname, "../.claude/rules/money.md"), "utf8");
const money = parseMoneyPaths(moneyMd) as string[];

const none = { base: {}, head: {} };
const auto = (files: string[], baseline = none) => classify(files, money, baseline);

describe("money paths", () => {
  it("reads every list line of the real money.md as a pattern", () => {
    const front = moneyMd.split("---")[1];
    const listLines = front.split("\n").filter((line) => /^\s+-/.test(line));
    expect(money).toHaveLength(listLines.length);
    expect(money).toContain("lib/stripe/**");
    expect(money).toContain("app/*/shop/checkout/**");
  });

  it("is null when there is no list, never an empty list", () => {
    expect(parseMoneyPaths("# Money\n")).toBeNull();
    expect(parseMoneyPaths("---\ntitle: x\n---\n")).toBeNull();
    expect(parseMoneyPaths('---\npaths: ["lib/x/**"]\n---\n')).toBeNull();
  });

  it.each([
    ['  - "lib/x/**"  # a note'],
    ['  - "lib/x/*.{ts,tsx}"'],
    ['  - "lib/x/file?.ts"'],
    ['  - "app/[lang]/x/**"'],
    ['  - "lib/x**/y"'],
    ['  - "/lib/x/**"'],
    ['  - ""'],
    ["  # a comment line"],
    ["  lib/x/**"],
  ])("one unreadable line (%s) makes the whole list unread", (line) => {
    expect(parseMoneyPaths(`---\npaths:\n  - "lib/stripe/**"\n${line}\n  - "lib/rma/**"\n---\n`)).toBeNull();
  });

  it("reads quoted, single-quoted and bare items, and stops at the next key", () => {
    expect(parseMoneyPaths("---\npaths:\n  - \"a/**\"\n  - 'b/*.ts'\n  - c/**/d.ts\nother: 1\n---\n")).toEqual([
      "a/**",
      "b/*.ts",
      "c/**/d.ts",
    ]);
  });

  it("every built-in pattern is one the matcher supports", () => {
    for (const list of Object.values(PATTERNS) as string[][]) {
      for (const pattern of list) expect(isSupportedPattern(pattern), pattern).toBe(true);
    }
  });

  it("a wildcard matches across line terminators, behind the control-character rule", () => {
    expect(matches("lib/stripe/a\nb.ts", ["lib/stripe/**"])).toBe(true);
    expect(matches("lib/stripe/a b.ts", ["lib/stripe/**"])).toBe(true);
    expect(matches("lib/a\nb/x.ts", ["lib/*/x.ts"])).toBe(true);
  });

  it("a ** in the middle of a pattern matches zero or more folders", () => {
    const parsed = parseMoneyPaths('---\npaths:\n  - "lib/**/refund.ts"\n---\n');
    expect(classify(["lib/refund.ts"], parsed, none)).toBe("owner");
    expect(classify(["lib/a/b/refund.ts"], parsed, none)).toBe("owner");
    expect(classify(["lib/a/b/refunds.ts"], parsed, none)).toBe("auto");
  });
});

describe("classify", () => {
  it.each([
    ["money", "lib/stripe/webhook.ts"],
    ["money behind the locale segment", "app/[lang]/shop/checkout/page.tsx"],
    ["money", "lib/costings/sell-price.ts"],
    ["money: staff refund", "app/api/shop/orders/[id]/refund/route.ts"],
    ["money: admin refund", "lib/ecommerce/admin-refund.ts"],
    ["money: ledger", "lib/ecommerce/money-ledger.ts"],
    ["money: discounts", "lib/ecommerce/discounts.ts"],
    ["money: order stock", "lib/ecommerce/order-stock.ts"],
    ["money: partner payment details", "app/api/partner/payment-details/route.ts"],
    ["money: points", "lib/points/spend.ts"],
    ["money: commissions", "lib/commissions/ledger.ts"],
    ["money: payouts", "app/[lang]/settings/partner-commissions/payout-actions.ts"],
    ["money: commission choice", "components/partner/commission-choice-form.tsx"],
    ["database", "supabase/migrations/20261120_x.sql"],
    ["rails: workflows", ".github/workflows/auto-merge.yml"],
    ["rails: git hooks", ".githooks/pre-push"],
    ["rails: claude hooks", ".claude/hooks/guard.mjs"],
    ["rails: claude rules", ".claude/rules/money.md"],
    ["rails: claude settings", ".claude/settings.json"],
    ["rails: gitleaks ignore", ".gitleaksignore"],
    ["rails: gitleaks config", ".gitleaks.toml"],
    ["rails: npmrc", ".npmrc"],
    ["rails: pnpmfile", ".pnpmfile.cjs"],
    ["rails: mcp", ".mcp.json"],
    ["rails: gitattributes", ".gitattributes"],
    ["rails: any root dotfile", ".nvmrc"],
    ["rails: any root dot-folder", ".husky/pre-commit"],
    ["rails", "CLAUDE.md"],
    ["rails: nested CLAUDE.md", "lib/stripe-ui/CLAUDE.md"],
    ["rails: CLAUDE.local.md", "CLAUDE.local.md"],
    ["rails: nested CLAUDE.local.md", "app/x/CLAUDE.local.md"],
    ["rails: nested .claude", "app/x/.claude/settings.json"],
    ["rails: .claude inside a PRD", ".claude/PRD-x/.claude/settings.json"],
    ["rails: CLAUDE.md inside a PRD", ".claude/PRD-x/CLAUDE.md"],
    ["rails: case", "Claude.md"],
    ["rails: case", ".Claude/settings.json"],
    ["rails: case", "Package.json"],
    ["rails", "eslint.config.mjs"],
    ["root: ESLint's first choice", "eslint.config.js"],
    ["root: another ESLint spelling", "eslint.config.cjs"],
    ["root: Next's first choice", "next.config.js"],
    ["root: another Next spelling", "next.config.mjs"],
    ["root: any new file", "foo.ts"],
    ["root: a file with no extension", "Makefile"],
    ["root: an existing config", "components.json"],
    ["root: Markdown-looking but not Markdown", "README.md.ts"],
    ["nested package.json", "packages/x/package.json"],
    ["nested tsconfig", "app/x/tsconfig.json"],
    ["nested tsconfig variant", "scripts/tsconfig.build.json"],
    ["nested ESLint config", "lib/x/eslint.config.js"],
    ["rails", "eslint-rules/no-comments.mjs"],
    ["rails", "scripts/checks.mjs"],
    ["rails", "scripts/pr-risk.mjs"],
    ["rails", "scripts/git-identity"],
    ["rails", "vitest.config.ts"],
    ["rails", "tsconfig.json"],
    ["rails", "tsconfig.ci.json"],
    ["rails", "package.json"],
    ["rails", "pnpm-lock.yaml"],
    ["rails", "pnpm-workspace.yaml"],
    ["rails", "next.config.ts"],
    ["rails", "vercel.json"],
    ["rails", "proxy.ts"],
    ["access", "lib/auth/permissions.ts"],
    ["access", "lib/supabase/server.ts"],
    ["access", "lib/staff/working-as.ts"],
    ["access", "lib/results/access.ts"],
    ["access", "lib/partner-backup-email.ts"],
    ["access", "app/api/partner/backup-email/verify/route.ts"],
    ["access", "app/auth/callback/route.ts"],
    ["access", "components/auth/login-form.tsx"],
    ["access", "app/[lang]/account/login/page.tsx"],
    ["access", "app/[lang]/settings/login/page.tsx"],
    ["access", "app/[lang]/settings/users/roles-tab.tsx"],
    ["access", "app/api/admin/roles/route.ts"],
    ["access", "app/api/staff/route.ts"],
    ["access", "app/api/partner/context/route.ts"],
    ["access: case", "LIB/Auth/permissions.ts"],
    ["a line feed in a rail", ".claude/rules/x\n.md"],
    ["a line feed anywhere", "components/a\n.tsx"],
    ["a carriage return", "components/a\r.tsx"],
    ["U+2028", "components/a .tsx"],
    ["U+2029", "components/a .tsx"],
    ["U+0085", "components/a\u0085.tsx"],
    ["a control character", "components/a\u0001.tsx"],
    ["DEL", "components/a\u007f.tsx"],
  ])("%s: %j waits for the owner", (_family, file) => {
    expect(auto([file])).toBe("owner");
  });

  it("one guarded file among ordinary ones is enough", () => {
    expect(auto(["components/shop/card.tsx", "lib/pricing/round.ts", "README.md"])).toBe("owner");
  });

  it.each(["README.md", "CONTEXT.md", "readme.MD", "docs/x.md"])("root or folder Markdown (%s) merges itself", (file) => {
    expect(auto([file])).toBe("auto");
  });

  it("a docs-only change merges itself", () => {
    expect(auto(["docs/adr/0040-x.md", "CONTEXT.md", ".claude/PRD-agent-rails/issues/07-x.md"])).toBe("auto");
  });

  it("a plain code change merges itself", () => {
    expect(auto(["components/shop/card.tsx", "lib/shipping/rates.ts", "app/[lang]/shop/page.tsx"])).toBe("auto");
  });

  it("does not mistake a neighbour for a guarded folder", () => {
    expect(auto(["lib/stripe-ui/x.ts", "lib/authorization-hold-copy/x.ts", "app/[lang]/account/orders/page.tsx"])).toBe("auto");
    expect(auto(["scripts/pr-risk-notes.txt", "docs/CLAUDE.md.txt", "lib/results/accessor.ts"])).toBe("auto");
  });

  const file = (counts: Record<string, number>) =>
    Object.fromEntries(Object.entries(counts).map(([rule, count]) => [rule, { count }]));

  it("a baseline that grew waits for the owner, and says which rule", () => {
    const base = { "app/a.tsx": file({ "no-comments": 3 }) };
    const head = { "app/a.tsx": file({ "no-comments": 3 }), "app/b.tsx": file({ "no-comments": 1 }) };
    expect(auto(["app/b.tsx"], { base, head })).toBe("owner");
    expect(ownerReasons(["app/b.tsx"], money, { base, head })).toEqual(["the lint baseline grew: no-comments 3 → 4"]);
  });

  it("a baseline that shrank, or moved between files, merges itself", () => {
    const base = { "app/a.tsx": file({ "no-comments": 3, "no-use-effect": 2 }) };
    const shrank = { "app/a.tsx": file({ "no-comments": 1, "no-use-effect": 2 }) };
    const moved = { "app/a.tsx": file({ "no-comments": 1 }), "app/b.tsx": file({ "no-comments": 2, "no-use-effect": 2 }) };
    expect(auto(["app/a.tsx"], { base, head: shrank })).toBe("auto");
    expect(auto(["app/a.tsx", "app/b.tsx"], { base, head: moved })).toBe("auto");
  });

  it("a baseline that appeared counts from zero", () => {
    expect(auto(["app/a.tsx"], { base: {}, head: { "app/a.tsx": file({ "no-comments": 1 }) } })).toBe("owner");
    expect(auto(["app/a.tsx"], { base: {}, head: {} })).toBe("auto");
  });

  it("a baseline it cannot read is an error, not a zero", () => {
    expect(() => auto(["app/a.tsx"], { base: {}, head: { "app/a.tsx": { "no-comments": 1 } } })).toThrow();
  });
});

const HEAD = "a".repeat(40);
const TIP = "c".repeat(40);

function facts(over: Record<string, unknown> = {}) {
  return {
    switch: "on",
    repository: "ivanyeors/mp",
    owner: "ivanyeors",
    defaultBranch: "main",
    pr: {
      number: 7,
      state: "open",
      draft: false,
      mergeable: true,
      user: { login: "ivanyeors" },
      head: { sha: HEAD, repo: { full_name: "ivanyeors/mp" } },
      base: { ref: "main" },
    },
    files: ["components/shop/card.tsx", "eslint-suppressions.json"],
    moneyPaths: money,
    baseline: none,
    mainChanged: ["lib/shipping/rates.ts", "eslint-suppressions.json"],
    baseTip: { sha: TIP, login: "ivanyeors" },
    checkRuns: [
      { name: "verify", status: "completed", conclusion: "success" },
      { name: "guard", status: "completed", conclusion: "success" },
      { name: "review", status: "completed", conclusion: "skipped" },
      { name: "Vercel Preview Comments", status: "completed", conclusion: "success" },
    ],
    statuses: [{ context: "Vercel", state: "success" }],
    comments: [
      { login: "ivanyeors", body: "Ready." },
      { login: "claude[bot]", body: `Verdict: clean at ${HEAD} against main\n\nNothing found.` },
    ],
    unresolvedThreads: 0,
    headNow: HEAD,
    ...over,
  };
}

const pr = (over: Record<string, unknown>) => ({ ...facts().pr, ...over });
const runs = (...extra: Record<string, unknown>[]) => [...facts().checkRuns, ...extra];
const comments = (...extra: Record<string, unknown>[]) => [{ login: "ivanyeors", body: "Ready." }, ...extra];

describe("decide", () => {
  it("merges when every condition holds", () => {
    expect(decide(facts())).toEqual({ merge: true, reasons: [] });
  });

  it.each<[string, Record<string, unknown>, RegExp]>([
    ["switch off", { switch: "off" }, /switch is "off"/],
    ["switch unset", { switch: "" }, /switch is unset/],
    ["switch in another case", { switch: "On" }, /switch is "On"/],
    ["switch true", { switch: "true" }, /switch is "true"/],
    ["closed", { pr: pr({ state: "closed" }) }, /closed, not open/],
    ["draft", { pr: pr({ draft: true }) }, /draft/],
    ["draft unknown", { pr: pr({ draft: undefined }) }, /draft/],
    ["a fork", { pr: pr({ head: { sha: HEAD, repo: { full_name: "someone/mp" } } }) }, /someone\/mp, not this one/],
    ["a deleted fork", { pr: pr({ head: { sha: HEAD, repo: null } }) }, /unknown repository/],
    ["another author", { pr: pr({ user: { login: "someone" } }) }, /opened by someone/],
    ["another base", { pr: pr({ base: { ref: "rails/02" } }) }, /targets rails\/02/],
    ["not mergeable", { pr: pr({ mergeable: false }) }, /does not merge cleanly/],
    ["mergeable not yet known", { pr: pr({ mergeable: null }) }, /has not worked out/],
    ["an owner path", { files: ["lib/stripe/webhook.ts"] }, /waits for the owner: lib\/stripe\/webhook.ts is a money path/],
    ["a pending check", { checkRuns: runs({ name: "Vercel Preview Comments", status: "in_progress", conclusion: null }) }, /in_progress/],
    ["a queued check", { checkRuns: runs({ name: "x", status: "queued", conclusion: null }) }, /x check is queued/],
    ["a failed check", { checkRuns: runs({ name: "x", status: "completed", conclusion: "failure" }) }, /x check ended failure/],
    ["a cancelled check", { checkRuns: runs({ name: "x", status: "completed", conclusion: "cancelled" }) }, /ended cancelled/],
    ["a timed-out check", { checkRuns: runs({ name: "x", status: "completed", conclusion: "timed_out" }) }, /ended timed_out/],
    ["an unknown conclusion", { checkRuns: runs({ name: "x", status: "completed", conclusion: "something_new" }) }, /ended something_new/],
    ["verify failed", { checkRuns: runs({ name: "verify", status: "completed", conclusion: "failure" }) }, /verify check must succeed/],
    ["verify skipped", { checkRuns: [{ name: "verify", status: "completed", conclusion: "skipped" }] }, /verify check must succeed, and it ended skipped/],
    ["verify neutral", { checkRuns: [{ name: "verify", status: "completed", conclusion: "neutral" }] }, /verify check must succeed, and it ended neutral/],
    ["ci not started", { checkRuns: facts().checkRuns.filter((r) => r.name !== "verify") }, /verify check has not started/],
    ["no check runs at all", { checkRuns: [] }, /verify check has not started/],
    ["Vercel pending", { statuses: [{ context: "Vercel", state: "pending" }] }, /no Vercel status is success.*Vercel=pending/],
    ["Vercel failed", { statuses: [{ context: "Vercel", state: "failure" }] }, /no Vercel status is success/],
    ["no Vercel status, another one success", { statuses: [{ context: "ci/other", state: "success" }] }, /no Vercel status is success.*ci\/other=success/],
    ["no statuses at all", { statuses: [] }, /no statuses at all/],
    ["Vercel success but another failed", { statuses: [{ context: "Vercel", state: "success" }, { context: "x", state: "failure" }] }, /a commit status is not success.*x=failure/],
    ["Vercel success but another errored", { statuses: [{ context: "Vercel", state: "success" }, { context: "x", state: "error" }] }, /x=error/],
    ["Vercel success but another pending", { statuses: [{ context: "Vercel", state: "success" }, { context: "x", state: "pending" }] }, /x=pending/],
    ["an unresolved thread", { unresolvedThreads: 1 }, /1 review thread\(s\) are unresolved/],
    ["no review verdict", { comments: comments() }, /has not passed this head .*CLAUDE_CODE_OAUTH_TOKEN/],
    ["findings at the head", { comments: comments({ login: "claude[bot]", body: `Verdict: findings at ${HEAD} against main` }) }, /found problems at/],
    ["findings beside a clean at the head", { comments: [...facts().comments, { login: "github-actions[bot]", body: `Verdict: findings at ${HEAD} against main` }] }, /found problems at/],
    ["findings against another base beside a clean", { comments: [...facts().comments, { login: "claude[bot]", body: `Verdict: findings at ${HEAD} against rails/01` }] }, /found problems at/],
    ["clean at another head", { comments: comments({ login: "claude[bot]", body: `Verdict: clean at ${"b".repeat(40)} against main` }) }, /its last verdict was clean at bbbb.* against main/],
    ["clean against another branch (a stacked pull request, retargeted)", { comments: comments({ login: "claude[bot]", body: `Verdict: clean at ${HEAD} against rails/01` }) }, /has not passed this head a+ against main .*last verdict was clean at a+ against rails\/01/],
    ["clean in the old form with no base", { comments: comments({ login: "claude[bot]", body: `Verdict: clean at ${HEAD}` }) }, /has not passed this head/],
    ["clean, posted by the opener", { comments: comments({ login: "ivanyeors", body: `Verdict: clean at ${HEAD} against main` }) }, /has not passed this head/],
    ["clean, not on the first line", { comments: comments({ login: "claude[bot]", body: `Review\nVerdict: clean at ${HEAD} against main` }) }, /has not passed this head/],
    ["clean with extra words", { comments: comments({ login: "claude[bot]", body: `Verdict: clean at ${HEAD} against main, mostly` }) }, /has not passed this head/],
    ["a moved head", { headNow: "b".repeat(40) }, /head moved/],
    ["no files", { files: [] }, /changes no files/],
    ["main changed a file this changes", { files: ["components/shop/card.tsx"], mainChanged: ["components/shop/card.tsx"] }, /main has changed components\/shop\/card.tsx since this branch left it.*Merge main into the branch/],
    ["main renamed a file this changes", { files: ["lib/shipping/old.ts"], mainChanged: ["lib/shipping/new.ts", "lib/shipping/old.ts"] }, /lib\/shipping\/old.ts/],
    ["main's tip not the owner's", { baseTip: { sha: TIP, login: "github-actions[bot]" } }, /tip c+ is authored by github-actions\[bot\].*production may be behind main/],
    ["main's tip a Dependabot merge", { baseTip: { sha: TIP, login: "dependabot[bot]" } }, /^main's tip c+ is authored by dependabot\[bot\], not ivanyeors\. Vercel builds only commits authored by ivanyeors, so production may be behind main\. Nothing merges itself until a commit authored by ivanyeors reaches main: any merge ivanyeors makes by hand$/],
    ["main's tip with no GitHub user", { baseTip: { sha: TIP, login: "" } }, /authored by no GitHub user/],
  ])("%s alone stops the merge", (_name, over, why) => {
    const verdict = decide(facts(over));
    expect(verdict.merge).toBe(false);
    expect(verdict.reasons).toHaveLength(1);
    expect(verdict.reasons[0]).toMatch(why);
  });

  it("main changing only the lint baseline does not stop the merge", () => {
    expect(decide(facts({ files: ["components/a.tsx", "eslint-suppressions.json"], mainChanged: ["eslint-suppressions.json"] })).merge).toBe(true);
  });

  it.each<[string, Record<string, unknown>, RegExp]>([
    ["the pull request", { pr: null }, /could not read the pull request$/],
    ["the files", { files: null }, /could not read the complete list/],
    ["money.md", { moneyPaths: null }, /could not read the money paths/],
    ["the baseline", { baseline: null }, /could not read eslint-suppressions/],
    ["what main changed", { mainChanged: null }, /could not read what changed on main/],
    ["main's tip", { baseTip: null }, /could not read the tip of main/],
    ["the check runs", { checkRuns: null }, /could not read the check runs/],
    ["the commit statuses", { statuses: null }, /could not read the commit statuses/],
    ["the comments", { comments: null }, /could not read every comment/],
    ["the review threads", { unresolvedThreads: null }, /could not read the review threads/],
    ["the head again", { headNow: null }, /could not read the pull request's head/],
  ])("a fact it could not read (%s) stops the merge, and says so", (_name, over, why) => {
    const verdict = decide(facts(over));
    expect(verdict.merge).toBe(false);
    expect(verdict.reasons).toEqual(expect.arrayContaining([expect.stringMatching(why)]));
  });

  // Each guard matters when both sides are missing: null === null would pass.
  it("an unknown repository stops the merge even when the pull request's is unknown too", () => {
    const verdict = decide(facts({ repository: null, pr: pr({ head: { sha: HEAD, repo: { full_name: null } } }) }));
    expect(verdict.merge).toBe(false);
    expect(verdict.reasons).toEqual([expect.stringMatching(/unknown repository/)]);
  });

  it("an unknown owner stops the merge even when the opener is unknown too", () => {
    const verdict = decide(facts({ owner: null, pr: pr({ user: { login: null } }), baseTip: { sha: TIP, login: "x" } }));
    expect(verdict.merge).toBe(false);
    expect(verdict.reasons).toEqual(expect.arrayContaining([expect.stringMatching(/opened by an unknown login/)]));
  });

  it("an unknown default branch stops the merge even when the base is unknown too", () => {
    const verdict = decide(facts({ defaultBranch: null, pr: pr({ base: { ref: null } }) }));
    expect(verdict.merge).toBe(false);
    expect(verdict.reasons).toEqual(expect.arrayContaining([expect.stringMatching(/targets an unknown branch/)]));
  });

  it("a baseline with the wrong shape stops the merge", () => {
    const verdict = decide(facts({ baseline: { base: {}, head: { "a.ts": { rule: 3 } } } }));
    expect(verdict.merge).toBe(false);
    expect(verdict.reasons[0]).toMatch(/could not read the lint baseline/);
  });

  it("lists every reason, not just the first", () => {
    expect(decide(facts({ switch: "", unresolvedThreads: 2, headNow: "b".repeat(40) })).reasons).toHaveLength(3);
  });
});

describe("claude-review.yml", () => {
  const yml = readFileSync(join(__dirname, "../.github/workflows/claude-review.yml"), "utf8");
  const squash = (text: string) => text.replace(/\s+/g, " ").trim();

  it("has no workflow-level concurrency, where a skipped run would cancel a review", () => {
    expect(yml).not.toMatch(/^concurrency:/m);
  });

  it("joins the shared concurrency group under exactly the job's if: condition", () => {
    const cond = squash(/^ {4}if: >-\n([\s\S]*?)\n\n/m.exec(yml)?.[1] ?? "");
    const group = squash(/claude-review-\$\{\{ github\.event\.pull_request\.number \}\}-\$\{\{\s*\(([\s\S]*?)\)\s*&& 'review' \|\| github\.run_id \}\}/.exec(yml)?.[1] ?? "");
    expect(cond).toContain("vars.AUTO_MERGE_CODE == 'on'");
    expect(group).toBe(cond);
  });

  it("signs in with the subscription token alone, since the monthly API credit does not pay for Claude Code", () => {
    expect(yml).toContain("claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}");
    expect(yml).toContain("HAS_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN != '' }}");
    expect(yml).not.toMatch(/anthropic_api_key|secrets\.ANTHROPIC_API_KEY/);
  });
});

describe("tipReason, just before the merge", () => {
  it("lets the merge go ahead when main's tip has not moved", () => {
    expect(tipReason(TIP, TIP, "main")).toBeNull();
  });

  it("refuses when main moved since the facts were read, and says to run it again", () => {
    expect(tipReason(TIP, "d".repeat(40), "main")).toMatch(/^main moved from c+ to d+ while this was judged.*run this again$/);
  });

  it.each(["", "not-a-sha", undefined])("refuses when the tip could not be read again (%j)", (now) => {
    expect(tipReason(TIP, now, "main")).toMatch(/could not read main's tip again/);
  });
});

describe("readFacts", () => {
  let dir = "";
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const env = { AUTO_MERGE_CODE: "on", REPOSITORY: "ivanyeors/mp", REPOSITORY_OWNER: "ivanyeors", DEFAULT_BRANCH: "main" };

  function write(files: Record<string, string>) {
    dir = mkdtempSync(join(tmpdir(), "pr-risk-"));
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  }

  const ndjson = (rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";

  const complete = (): Record<string, string> => ({
    "pr.json": JSON.stringify({ ...facts().pr, changed_files: 2 }),
    "files.ndjson": '{"filename":"components/a.tsx"}\n{"filename":"lib/shop/b.ts","previous_filename":null}\n',
    "suppressions-base.absent": "",
    "suppressions-head.json": "{}",
    "main-changed.json": JSON.stringify({ files: [{ filename: "lib/other.ts" }] }),
    "base-tip.txt": `${TIP} ivanyeors\n`,
    "check-runs.ndjson": ndjson(facts().checkRuns),
    "statuses.ndjson": ndjson(facts().statuses),
    "comments.ndjson": ndjson(facts().comments),
    "unresolved-threads.txt": "0\n",
    "head-now.txt": `${HEAD}\n`,
  });

  it("merges a complete, ordinary set", () => {
    write(complete());
    expect(decide(readFacts(dir, moneyMd, env))).toEqual({ merge: true, reasons: [] });
  });

  it("counts a rename's old path", () => {
    write({
      ...complete(),
      "files.ndjson": '{"filename":"components/a.tsx"}\n{"filename":"lib/shop/b.ts","previous_filename":"lib/stripe/b.ts"}\n',
    });
    const read = readFacts(dir, moneyMd, env);
    expect(read.files).toEqual(["components/a.tsx", "lib/shop/b.ts", "lib/stripe/b.ts"]);
    expect(decide(read).reasons).toEqual(["it waits for the owner: lib/stripe/b.ts is a money path"]);
  });

  it("carries a line feed in a file name through to an owner verdict", () => {
    write({ ...complete(), "files.ndjson": ndjson([{ filename: "components/a.tsx" }, { filename: ".claude/rules/x\n.md" }]) });
    expect(decide(readFacts(dir, moneyMd, env)).reasons).toEqual([
      'it waits for the owner: ".claude/rules/x\\n.md" has a control character or line break in its name',
    ]);
  });

  it.each([
    "pr.json",
    "files.ndjson",
    "suppressions-base.absent",
    "suppressions-head.json",
    "main-changed.json",
    "base-tip.txt",
    "check-runs.ndjson",
    "statuses.ndjson",
    "comments.ndjson",
    "unresolved-threads.txt",
    "head-now.txt",
  ])("a missing %s stops the merge", (name) => {
    const set = complete();
    delete set[name];
    write(set);
    expect(decide(readFacts(dir, moneyMd, env)).merge).toBe(false);
  });

  it("a file list shorter than the pull request's count stops the merge", () => {
    write({ ...complete(), "files.ndjson": '{"filename":"components/a.tsx"}\n' });
    expect(readFacts(dir, moneyMd, env).files).toBeNull();
  });

  it("main's tip with no GitHub user reads as the latch, not as unread", () => {
    write({ ...complete(), "base-tip.txt": `${TIP} (none)\n` });
    expect(decide(readFacts(dir, moneyMd, env)).reasons).toEqual([
      expect.stringMatching(/^main's tip c+ is authored by \(none\), not ivanyeors/),
    ]);
  });

  it("a compare list at the API's 300-file limit is unread", () => {
    const files = Array.from({ length: 300 }, (_, i) => ({ filename: `lib/x/${i}.ts` }));
    write({ ...complete(), "main-changed.json": JSON.stringify({ files }) });
    expect(readFacts(dir, moneyMd, env).mainChanged).toBeNull();
  });

  it("garbage in a fact file stops the merge", () => {
    write({ ...complete(), "unresolved-threads.txt": "null\n", "base-tip.txt": "ivanyeors\n", "comments.ndjson": "{not json\n" });
    const read = readFacts(dir, moneyMd, env);
    expect(read.unresolvedThreads).toBeNull();
    expect(read.baseTip).toBeNull();
    expect(read.comments).toBeNull();
  });

  it("no money.md stops the merge", () => {
    write(complete());
    expect(readFacts(dir, null, env).moneyPaths).toBeNull();
  });

  it("an unset switch reads as off", () => {
    write(complete());
    expect(decide(readFacts(dir, moneyMd, { ...env, AUTO_MERGE_CODE: undefined })).reasons).toEqual([
      'the AUTO_MERGE_CODE switch is unset, not "on"',
    ]);
  });
});
