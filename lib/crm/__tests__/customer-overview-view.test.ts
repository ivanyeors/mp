import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CUSTOMER_OVERVIEW_COLUMNS } from "@/lib/crm/customer-overview";
import { MIGRATION_SUMMARY_COLUMNS } from "@/lib/customer-migration/overview";

/**
 * The Customer overview is one SQL view and one TypeScript column list
 * (migration slice 12; ADR 0028 (k)). Later slices extend the view with
 * `create or replace view`, adding columns at the end, and add the same column
 * to the list. This keeps the two equal, and keeps the view server-only:
 * security_invoker, no `*`, and no grant to anon or authenticated.
 */

const dir = new URL("../../../supabase/migrations/", import.meta.url);
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => ({ name: f, sql: readFileSync(new URL(f, dir), "utf8").replace(/--.*$/gm, "") }));

/** Every definition of `view`, in migration order, with the file that holds it. */
function definitions(view: string) {
  const re = new RegExp(`create (?:or replace )?view (?:public\\.)?${view}\\b([^;]*?)\\bas\\s+select\\s+([^;]*);`, "gi");
  return files.flatMap(({ name, sql }) =>
    [...sql.matchAll(re)].map(([, options, body]) => ({ name, sql, options, list: selectList(body) })),
  );
}

/** The select list: everything before the top-level `from`, not a subquery's. */
function selectList(body: string): string {
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "(") depth++;
    else if (body[i] === ")") depth--;
    else if (depth === 0 && /^\sfrom\s/i.test(body.slice(i, i + 6))) return body.slice(0, i);
  }
  throw new Error("no top-level from");
}

/** The output names of a select list: `x.col`, `expr as name`, split at top-level commas. */
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
  { view: "admin_customer_migration_summary", columns: MIGRATION_SUMMARY_COLUMNS },
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

  it("only ever adds columns at the end", () => {
    // Postgres refuses `create or replace view` that drops or reorders one.
    for (let i = 1; i < defs.length; i++) {
      const before = columnNames(defs[i - 1].list);
      expect(columnNames(defs[i].list).slice(0, before.length), defs[i].name).toEqual(before);
    }
  });

  it.each(defs.map((d) => [d.name, d] as const))("lists its columns and runs as the invoker (%s)", (_name, d) => {
    expect(columnNames(d.list)).not.toContain("*");
    expect(d.options.replace(/\s+/g, "")).toContain("security_invoker=true");
  });

  it.each(defs.map((d) => [d.name, d] as const))("is revoked from anon and authenticated (%s)", (_name, d) => {
    expect(d.sql).toMatch(new RegExp(`revoke all on (?:public\\.)?${view} from anon, authenticated;`));
  });

  it("is never granted to anon or authenticated", () => {
    for (const { name, sql } of files) {
      expect(sql, name).not.toMatch(
        new RegExp(`grant [a-z, ]+ on (?:table )?(?:public\\.)?${view} to [a-z_, ]*\\b(anon|authenticated)\\b`),
      );
    }
  });
});
