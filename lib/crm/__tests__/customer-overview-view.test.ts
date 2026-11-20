import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CUSTOMER_OVERVIEW_COLUMNS } from "@/lib/crm/customer-overview";

const dir = new URL("../../../supabase/migrations/", import.meta.url);
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => ({ name: f, sql: readFileSync(new URL(f, dir), "utf8").replace(/--.*$/gm, "") }));

function dropsBefore(sql: string, view: string, index: number): boolean {
  const drop = new RegExp(`drop view (?:if exists )?(?:public\\.)?${view}\\b`, "i").exec(sql);
  return drop !== null && drop.index < index;
}

function renamesBefore(sql: string, view: string, index: number): Map<string, string> {
  const re = new RegExp(`alter view (?:if exists )?(?:public\\.)?${view} rename column ([a-z_0-9]+) to ([a-z_0-9]+)`, "gi");
  return new Map([...sql.matchAll(re)].filter((m) => m.index < index).map((m) => [m[1]!, m[2]!] as const));
}

function definitions(view: string) {
  const re = new RegExp(`create (?:or replace )?view (?:public\\.)?${view}\\b([^;]*?)\\bas\\s+select\\s+([^;]*);`, "gi");
  return files.flatMap(({ name, sql }) =>
    [...sql.matchAll(re)].map((m) => {
      const [, options, body] = m;
      return {
        name,
        sql,
        options,
        list: selectList(body),
        rebuilt: dropsBefore(sql, view, m.index),
        renames: renamesBefore(sql, view, m.index),
      };
    }),
  );
}

function selectList(body: string): string {
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "(") depth++;
    else if (body[i] === ")") depth--;
    else if (depth === 0 && /^\sfrom\s/i.test(body.slice(i, i + 6))) return body.slice(0, i);
  }
  throw new Error("no top-level from");
}

function columnNames(list: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of list) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      items.push(current);
      current = "";
    } else current += ch;
  }
  items.push(current);
  return items.map((item) => {
    const t = item.trim().replace(/\s+/g, " ");
    const alias = t.match(/\bas ([a-z_0-9]+)$/i);
    if (alias) return alias[1];
    const plain = t.match(/^(?:[a-z_0-9]+\.)?([a-z_0-9*]+)$/i);
    if (!plain) throw new Error(`Name this column with "as": ${t}`);
    return plain[1];
  });
}

const VIEWS = [
  { view: "admin_customer_overview", columns: CUSTOMER_OVERVIEW_COLUMNS },
];

describe.each(VIEWS)("$view", ({ view, columns }) => {
  const defs = definitions(view);
  const latest = defs.at(-1)!;

  it("is defined by a migration", () => {
    expect(defs.length).toBeGreaterThan(0);
  });

  it("has exactly the columns the TypeScript read model lists, in order", () => {
    expect(columnNames(latest.list)).toEqual([...columns]);
  });

  it("only ever adds columns at the end, unless the same migration renames one or drops the view first", () => {
    for (let i = 1; i < defs.length; i++) {
      if (defs[i].rebuilt) continue;
      const before = columnNames(defs[i - 1].list).map((c) => defs[i].renames.get(c) ?? c);
      expect(columnNames(defs[i].list).slice(0, before.length), defs[i].name).toEqual(before);
    }
  });

  it("renames a column only for a migration that restates the view after it", () => {
    for (const { name, sql } of files) {
      const re = new RegExp(`alter view (?:if exists )?(?:public\\.)?${view} rename column`, "gi");
      for (const m of sql.matchAll(re)) {
        expect(defs.some((d) => d.name === name && d.renames.size > 0), `${name} at ${m.index}`).toBe(true);
      }
    }
  });

  it("is rebuilt with `create view`, never `create or replace`, after its drop", () => {
    for (const d of defs.filter((x) => x.rebuilt)) {
      expect(d.sql, d.name).toMatch(new RegExp(`create view (?:public\\.)?${view}\\b`));
    }
  });

  it.each(defs.map((d) => [d.name, d] as const))("lists its columns and runs as the invoker (%s)", (_name, d) => {
    expect(columnNames(d.list)).not.toContain("*");
    expect(d.options.replace(/\s+/g, "")).toContain("security_invoker=true");
  });

  it.each(defs.map((d) => [d.name, d] as const))("is revoked from anon and authenticated (%s)", (_name, d) => {
    expect(d.sql).toMatch(new RegExp(`revoke all on (?:public\\.)?${view} from anon, authenticated;`));
  });

  it("is granted to the service role wherever it is rebuilt", () => {
    for (const d of defs.filter((x) => x.rebuilt)) {
      expect(d.sql, d.name).toMatch(new RegExp(`grant select on (?:public\\.)?${view} to service_role;`));
    }
  });

  it("is never granted to anon or authenticated", () => {
    for (const { name, sql } of files) {
      expect(sql, name).not.toMatch(
        new RegExp(`grant [a-z, ]+ on (?:table )?(?:public\\.)?${view} to [a-z_, ]*\\b(anon|authenticated)\\b`),
      );
    }
  });
});

describe("a rebuild of the Customer overview", () => {
  const SUMMARY = "admin_customer_migration_summary";
  const summaryGone = files.find(
    ({ sql }) =>
      new RegExp(`drop view (?:if exists )?(?:public\\.)?${SUMMARY}\\b`, "i").test(sql) &&
      !new RegExp(`create (?:or replace )?view (?:public\\.)?${SUMMARY}\\b`, "i").test(sql),
  )!;
  const all = definitions("admin_customer_overview").filter((d) => d.rebuilt);
  const rebuilds = all.filter((d) => d.name < summaryGone.name);

  it("no longer has the summary to recreate, and nothing brings it back", () => {
    expect(summaryGone.name).toMatch(/^20261101023540_/);
    for (const { name, sql } of files.filter((f) => f.name > summaryGone.name)) {
      expect(sql, name).not.toMatch(new RegExp(`create (?:or replace )?view (?:public\\.)?${SUMMARY}\\b`, "i"));
    }
  });

  it("has happened (PRD-loyalty-points slice 06)", () => {
    expect(rebuilds.map((d) => d.name)).toContainEqual(expect.stringMatching(/^20261021160000_/));
  });

  it.each(rebuilds.map((d) => [d.name, d] as const))("recreates the summary that reads it, after it (%s)", (_name, d) => {
    const summaryDrop = d.sql.search(/drop view (?:if exists )?(?:public\.)?admin_customer_migration_summary\b/i);
    const overviewDrop = d.sql.search(/drop view (?:if exists )?(?:public\.)?admin_customer_overview\b/i);
    const overviewCreate = d.sql.search(/create view (?:public\.)?admin_customer_overview\b/i);
    const summaryCreate = d.sql.search(/create view (?:public\.)?admin_customer_migration_summary\b/i);
    expect(summaryDrop).toBeGreaterThanOrEqual(0);
    expect(summaryDrop).toBeLessThan(overviewDrop);
    expect(overviewCreate).toBeGreaterThan(overviewDrop);
    expect(summaryCreate).toBeGreaterThan(overviewCreate);
    expect(d.sql).not.toMatch(/drop view [^;]*\bcascade\b/i);
  });

  it.each(all.map((d) => [d.name, d] as const))("never drops with cascade (%s)", (_name, d) => {
    expect(d.sql).not.toMatch(/drop view [^;]*\bcascade\b/i);
  });
});
