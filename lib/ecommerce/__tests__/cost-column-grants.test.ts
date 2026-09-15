import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * product_variants and order_items are readable by anon / authenticated through
 * RLS policies, so their cost columns are hidden with column-level grants
 * (20260915170000_hide_variant_cost_price.sql). Postgres only honours that if
 * the table-level SELECT grant is revoked, and then every other column has to be
 * granted one by one — so a column added later is silently unreadable until
 * someone decides. This test makes that decision explicit: every column the
 * migrations create is either granted or on the hidden list.
 */

const dir = new URL("../../../supabase/migrations/", import.meta.url);
const sql = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(new URL(f, dir), "utf8").replace(/--.*$/gm, ""))
  .join("\n");

function columnsOf(table: string): Set<string> {
  const create = sql.match(new RegExp(`create table if not exists ${table} \\(([\\s\\S]*?)\\n\\);`));
  const cols = new Set(
    (create?.[1] ?? "")
      .split("\n")
      .map((l) => l.trim().match(/^([a-z_0-9]+)\s/)?.[1])
      .filter((c): c is string => !!c && !["primary", "unique", "constraint", "foreign", "check"].includes(c)),
  );
  const alter = new RegExp(`alter table (?:public\\.)?${table}\\s+(add|drop) column (?:if (?:not )?exists )?([a-z_0-9]+)`, "g");
  for (const [, op, col] of sql.matchAll(alter)) {
    if (op === "add") cols.add(col);
    else cols.delete(col);
  }
  return cols;
}

function grantedTo(table: string, role: string): Set<string> {
  const grant = new RegExp(`grant select \\(([^)]*)\\) on public\\.${table} to ([a-z_, ]+);`, "g");
  const out = new Set<string>();
  for (const [, cols, roles] of sql.matchAll(grant)) {
    if (roles.split(",").map((r) => r.trim()).includes(role)) {
      for (const c of cols.split(",")) out.add(c.trim());
    }
  }
  return out;
}

const cases = [
  { table: "product_variants", hidden: ["cost_price"], roles: ["anon", "authenticated"] },
  { table: "order_items", hidden: ["unit_cost", "total_cost"], roles: ["authenticated"] },
];

describe.each(cases)("$table column grants", ({ table, hidden, roles }) => {
  it("revokes the table-level SELECT from anon and authenticated", () => {
    expect(sql).toContain(`revoke select on public.${table} from anon, authenticated;`);
  });

  it.each(roles)("grants %s every column except the cost ones", (role) => {
    const expected = [...columnsOf(table)].filter((c) => !hidden.includes(c)).sort();
    expect(expected.length).toBeGreaterThan(5);
    expect([...grantedTo(table, role)].sort()).toEqual(expected);
  });
});
