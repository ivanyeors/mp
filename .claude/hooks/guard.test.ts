import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs hook, no type declarations
import { commandsIn, destructiveSql, verdict } from "./guard.mjs";

type Sys = {
  dirty: (dir: string, paths?: string[]) => boolean;
  untracked: (dir: string) => boolean;
  branch: (dir: string) => string;
  newMigrations: (dir: string) => string[];
  read: (file: string) => string;
};

function sys(over: Partial<Sys> = {}): Sys {
  return {
    dirty: () => false,
    untracked: () => false,
    branch: () => "claude/feature",
    newMigrations: () => [],
    read: () => "",
    ...over,
  };
}

const bash = (command: string, s: Sys = sys()) =>
  verdict({ tool_name: "Bash", tool_input: { command }, cwd: "/repo" }, s) as string | null;
const mcp = (tool: string, query: string) =>
  verdict({ tool_name: tool, tool_input: { query }, cwd: "/repo" }, sys()) as string | null;

describe("shell parsing", () => {
  it("finds commands after separators, inside $( ) and sh -c", () => {
    const progs = commandsIn("cd x && echo \"$(git status)\"; bash -c 'git push --force'").map((w: string[]) => w[0]);
    expect(progs.sort()).toEqual(["bash", "cd", "echo", "git", "git"]);
  });

  it("does not read a heredoc commit message as commands", () => {
    const cmd = `git commit -m "$(cat <<'EOF'\nBlock git push --force and it can't slip (1) through\nEOF\n)"`;
    expect(bash(cmd)).toBeNull();
  });
});

describe("git", () => {
  it("blocks force pushes but allows --force-with-lease", () => {
    expect(bash("git push --force origin feature")).toMatch(/force push/);
    expect(bash("git push -fu origin feature")).toMatch(/force push/);
    expect(bash("git push origin +feature")).toMatch(/force push/);
    expect(bash("git -C /repo push -f")).toMatch(/force push/);
    expect(bash("git push --force-with-lease origin feature")).toBeNull();
    expect(bash("git push -u origin claude/feature")).toBeNull();
  });

  it("blocks pushes to main, however they are spelled", () => {
    expect(bash("git push origin main")).toMatch(/main/);
    expect(bash("git push origin HEAD:refs/heads/main")).toMatch(/main/);
    expect(bash("git push", sys({ branch: () => "main" }))).toMatch(/main/);
    expect(bash("git push origin HEAD", sys({ branch: () => "main" }))).toMatch(/main/);
    expect(bash("git push origin HEAD")).toBeNull();
  });

  it("blocks --no-verify, including commit -n, but not push -n (dry run)", () => {
    expect(bash("git push --no-verify")).toMatch(/no-verify/);
    expect(bash("git commit -nm 'x'")).toMatch(/no-verify/);
    expect(bash("git commit -mn")).toBeNull(); // the message is "n"
    expect(bash("git push -n origin feature")).toBeNull();
  });

  it("blocks discarding uncommitted work only when there is some", () => {
    const dirty = sys({ dirty: () => true, untracked: () => true });
    expect(bash("git reset --hard origin/main", dirty)).toMatch(/uncommitted/);
    expect(bash("git reset --hard origin/main")).toBeNull();
    expect(bash("git checkout -- lib/a.ts", dirty)).toMatch(/uncommitted/);
    expect(bash("git checkout .", dirty)).toMatch(/uncommitted/);
    expect(bash("git restore lib/a.ts", dirty)).toMatch(/uncommitted/);
    expect(bash("git restore --staged lib/a.ts", dirty)).toBeNull();
    expect(bash("git clean -fd", dirty)).toMatch(/uncommitted/);
    expect(bash("git clean -nd", dirty)).toBeNull();
    expect(bash("git clean -fdx")).toMatch(/ignored files/);
    expect(bash("git stash drop")).toMatch(/stash drop/);
    expect(bash("git checkout -b next", dirty)).toBeNull();
  });

  // The parser fixes that closed the eslint holes close the same ones here.
  it("finds a force push inside a loop, an if, or bash -lc", () => {
    expect(bash("for b in a b; do git push --force origin $b; done")).toMatch(/force push/);
    expect(bash("if ! git push -f origin x; then echo no; fi")).toMatch(/force push/);
    expect(bash("bash -lc 'git push --force origin x'")).toMatch(/force push/);
    expect(bash("for b in a b; do git push origin $b; done")).toBeNull();
  });

  it("joins a backslash-newline and reads past xargs options, for the other guards too", () => {
    expect(bash("git push origin x \\\n--force")).toMatch(/force push/);
    expect(bash("echo x | xargs -n 1 -I {} git push --force origin {}")).toMatch(/force push/);
    expect(bash("echo x | xargs -n 1 git push origin")).toBeNull();
  });

  it("allows taking main's graphify-out/ during a merge (the documented fix)", () => {
    const dirty = sys({ dirty: () => true });
    expect(bash("git checkout origin/main -- graphify-out/", dirty)).toBeNull();
  });
});

describe("database", () => {
  it("flags SQL that destroys data and nothing else", () => {
    expect(destructiveSql("drop table customers")).toMatch(/drops/);
    expect(destructiveSql("TRUNCATE orders")).toMatch(/empties/);
    expect(destructiveSql("alter table items drop column msrp")).toMatch(/column/);
    expect(destructiveSql("alter table items drop msrp")).toMatch(/column/);
    expect(destructiveSql("delete from orders")).toMatch(/every row/);
    expect(destructiveSql("update items set msrp = 0")).toMatch(/every row/);

    expect(destructiveSql("delete from orders where id = 1")).toBeNull();
    expect(destructiveSql("update items set msrp = 0 where id = 1")).toBeNull();
    expect(destructiveSql("insert into t values (1) on conflict (id) do update set v = excluded.v")).toBeNull();
    expect(destructiveSql("alter table items drop constraint items_pk")).toBeNull();
    expect(destructiveSql("drop policy p on items; drop index i; drop function f()")).toBeNull();
    expect(destructiveSql("-- drop table customers\nselect 1")).toBeNull();
  });

  it("checks Supabase MCP SQL, and lets other SQL through", () => {
    expect(mcp("mcp__supabase__execute_sql", "drop table customers")).toMatch(/can't be brought back/);
    expect(mcp("mcp__Supabase__apply_migration", "truncate orders")).toMatch(/can't be brought back/);
    expect(mcp("mcp__supabase__execute_sql", "select * from orders")).toBeNull();
    expect(mcp("mcp__supabase__apply_migration", "alter table items add column x int")).toBeNull();
    expect(mcp("mcp__supabase__delete_branch", "")).toMatch(/branch/);
  });

  it("blocks db push only when a new migration destroys data", () => {
    const withDrop = sys({ newMigrations: () => ["supabase/migrations/1_x.sql"], read: () => "drop table old_orders;" });
    const withAdd = sys({ newMigrations: () => ["supabase/migrations/1_x.sql"], read: () => "alter table t add column c int;" });
    expect(bash("supabase db push", withDrop)).toMatch(/1_x\.sql/);
    expect(bash("pnpm db:push", withDrop)).toMatch(/1_x\.sql/);
    expect(bash("supabase db push", withAdd)).toBeNull();
    expect(bash("supabase db reset --linked")).toMatch(/wipes/);
    expect(bash("supabase db reset")).toBeNull();
  });

  it("checks psql input, including heredocs", () => {
    expect(bash(`psql "$DB" -c "drop table x"`)).toMatch(/psql/);
    expect(bash(`psql "$DB" <<SQL\ntruncate orders;\nSQL`)).toMatch(/psql/);
    expect(bash(`psql "$DB" -c "select 1"`)).toBeNull();
  });
});

describe("the lint baseline is the owner's", () => {
  it("blocks adding to it, however eslint is run", () => {
    for (const cmd of [
      "eslint --suppress-all",
      "eslint --suppress-rule mp/no-comment app/page.tsx",
      "eslint --suppress-rule=mp/no-comment .",
      "pnpm lint --suppress-all",
      "pnpm lint -- --suppress-all",
      "pnpm run lint --suppress-rule mp/no-effect",
      "npm run lint -- --suppress-all",
      "pnpm exec eslint --suppress-all lib",
      "pnpm eslint --suppress-all",
      "npx eslint --suppress-all",
      "yarn eslint --suppress-rule react-hooks/refs",
      "bunx eslint --suppress-all",
      "node_modules/.bin/eslint --suppress-all",
      "./node_modules/.bin/eslint --suppress-rule mp/no-comment",
      "node node_modules/eslint/bin/eslint.js --suppress-all",
      "FOO=1 pnpm exec eslint --suppress-all",
      "cd /repo && npx eslint --suppress-all",
      "cd some/dir && pnpm exec eslint --suppress-all",
      "cd some/dir; pnpm exec eslint --suppress-all",
      "echo $(pnpm exec eslint --suppress-all)",
      'echo "$(pnpm exec eslint --suppress-all)"',
      "x=$(cd some/dir && pnpm exec eslint --suppress-all)",
      "echo `pnpm exec eslint --suppress-all`",
      "corepack pnpm lint --suppress-all",
      "corepack pnpm exec eslint --suppress-rule mp/no-comment",
      "pnpx eslint --suppress-all",
      'for f in *.ts; do pnpm exec eslint --suppress-all "$f"; done',
      "if ! pnpm lint --suppress-all; then echo no; fi",
      "while true; do npx eslint --suppress-all; break; done",
      "bash -lc 'pnpm exec eslint --suppress-all'",
      "sh -ec 'npx eslint --suppress-all'",
      "pnpm exec eslint lib \\\n--suppress-all",
      "pnpm exec eslint lib \\\n  --suppress-rule mp/no-comment",
      "git ls-files '*.ts' | xargs -n 50 pnpm exec eslint --suppress-all",
      "xargs -I {} -P 4 npx eslint --suppress-all {}",
      "xargs -L 1 -d x -s 100 -E end -a list.txt npx eslint --suppress-all",
      "xargs --max-args 5 --max-procs 2 npx eslint --suppress-all",
      "find . -name '*.ts' -exec npx eslint --suppress-all {} +",
      "function f { eslint --suppress-all; }",
      "pnpm exec eslint --suppress-all>/dev/null",
      "npx -c 'eslint --suppress-all'",
      "npm exec -c 'eslint --suppress-rule mp/no-comment'",
      "bash -c 'pnpm exec eslint --suppress-all'",
      "timeout 600 node_modules/.bin/eslint --suppress-all",
    ]) {
      expect(bash(cmd), cmd).toMatch(/owner's call/);
    }
  });

  it("allows pruning, a plain lint, and the words in a string", () => {
    expect(bash("pnpm lint")).toBeNull();
    expect(bash("pnpm exec eslint --prune-suppressions lib/a.ts")).toBeNull();
    expect(bash("node_modules/.bin/eslint --prune-suppressions --max-warnings 0 lib/a.ts")).toBeNull();
    expect(bash('echo "eslint --suppress-all"')).toBeNull();
    expect(bash("grep -rn -- --suppress-all docs")).toBeNull();
    expect(bash(`git commit -m "block eslint --suppress-all"`)).toBeNull();
    expect(bash(`git commit -m "blocked eslint --suppress-all"`)).toBeNull();
    expect(bash('grep -rn -- "--suppress-all" .claude')).toBeNull();
    expect(bash("pnpm exec eslint --prune-suppressions")).toBeNull();
    expect(bash("git ls-files '*.ts' | xargs -n 50 pnpm exec eslint")).toBeNull();
    expect(bash("pnpm exec eslint lib \\\n--prune-suppressions")).toBeNull();
  });
});

describe("the auto-merge switch and its gates are the owner's", () => {
  it("blocks setting or deleting repository variables", () => {
    expect(bash("gh variable set AUTO_MERGE_CODE --body true")).toMatch(/AUTO_MERGE_CODE/);
    expect(bash("gh variable set AUTO_MERGE_CODE -b true -R ivanyeors/mp")).toMatch(/AUTO_MERGE_CODE/);
    expect(bash("gh variable delete AUTO_MERGE_CODE")).toMatch(/AUTO_MERGE_CODE/);
    expect(bash("GH_TOKEN=x gh variable set X")).toMatch(/AUTO_MERGE_CODE/);
    expect(bash("gh variable -R ivanyeors/mp set AUTO_MERGE_CODE --body true")).toMatch(/AUTO_MERGE_CODE/);
    expect(bash("gh variable --repo ivanyeors/mp delete AUTO_MERGE_CODE")).toMatch(/AUTO_MERGE_CODE/);
    expect(bash("for r in a b; do gh variable set X --body 1; done")).toMatch(/AUTO_MERGE_CODE/);
    expect(bash("gh variable -R ivanyeors/mp list")).toBeNull();
  });

  it("blocks gh api writes to Actions variables, in each spelling of the method", () => {
    const vars = "repos/ivanyeors/mp/actions/variables";
    expect(bash(`gh api ${vars} -f name=AUTO_MERGE_CODE -f value=true`)).toMatch(/owner's/);
    expect(bash(`gh api -X PATCH ${vars}/AUTO_MERGE_CODE -f value=true`)).toMatch(/owner's/);
    expect(bash(`gh api --method DELETE ${vars}/AUTO_MERGE_CODE`)).toMatch(/owner's/);
    expect(bash(`gh api --method=PATCH /${vars}/AUTO_MERGE_CODE --input body.json`)).toMatch(/owner's/);
    expect(bash(`gh api -XPOST ${vars} -F value=true`)).toMatch(/owner's/);
    expect(bash(`gh api ${vars} --raw-field=name=AUTO_MERGE_CODE`)).toMatch(/owner's/);
  });

  it("blocks posting a commit status", () => {
    expect(bash("gh api repos/ivanyeors/mp/statuses/abc123 -f state=success -f context=ci")).toMatch(/owner's/);
    expect(bash("gh api -X POST /repos/ivanyeors/mp/statuses/abc123 -f state=success")).toMatch(/owner's/);
    expect(bash("gh api repos/{owner}/{repo}/statuses/$(git rev-parse HEAD) -f state=success")).toMatch(/owner's/);
  });

  it("allows reading them", () => {
    expect(bash("gh variable list")).toBeNull();
    expect(bash("gh variable get AUTO_MERGE_CODE")).toBeNull();
    expect(bash("gh api repos/ivanyeors/mp/actions/variables")).toBeNull();
    expect(bash("gh api repos/ivanyeors/mp/actions/variables/AUTO_MERGE_CODE --jq .value")).toBeNull();
    expect(bash("gh api repos/ivanyeors/mp/commits/abc123/status")).toBeNull();
    expect(bash("gh api repos/ivanyeors/mp/commits/abc123/statuses")).toBeNull();
    expect(bash("gh api -X GET repos/ivanyeors/mp/statuses/abc123")).toBeNull();
    expect(bash("gh pr create --title x --body 'gh variable set AUTO_MERGE_CODE'")).toBeNull();
  });
});

describe("scripts that reach real people or live money", () => {
  it("blocks running them, not reading them", () => {
    expect(bash("npx tsx --env-file=.env.local scripts/customer-migration-send.ts --wave w1")).toMatch(/real customers/);
    expect(bash("npx tsx scripts/whatsapp-test.ts")).toMatch(/WhatsApp/);
    expect(bash("pnpm costings:sync -- --apply --live")).toMatch(/live Stripe/);
    expect(bash("npx tsx scripts/stripe-sync-all.ts --live")).toMatch(/live Stripe/);
    expect(bash("stripe products list --live")).toMatch(/live Stripe/);

    expect(bash("pnpm costings:sync -- --apply")).toBeNull();
    expect(bash("npx tsx scripts/whatsapp-templates.ts")).toBeNull();
    expect(bash("cat scripts/customer-migration-send.ts")).toBeNull();
    expect(bash("grep -n wave scripts/customer-migration-send.ts")).toBeNull();
  });
});
