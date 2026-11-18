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
