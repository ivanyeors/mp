import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CUSTOMER_ORDER_COLUMNS, CUSTOMER_ORDER_ITEM_COLUMNS } from "@/lib/shop/customer-orders";

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
  const alter = new RegExp(`alter table (?:public\\.)?${table}\\s([^;]*);`, "g");
  for (const [, body] of sql.matchAll(alter)) {
    for (const [, op, col] of body.matchAll(/\b(add|drop) column (?:if (?:not )?exists )?([a-z_0-9]+)/g)) {
      if (op === "add") cols.add(col);
      else cols.delete(col);
    }
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
  {
    table: "customers",
    hidden: [
      "notes",
      "tags",
      "account_linked_at",
      "account_last_seen_at",
      "account_providers",
      "marketing_email_source",
      "marketing_email_updated_at",
    ],
    roles: ["authenticated"],
  },
  { table: "orders", hidden: ["internal_notes"], roles: ["authenticated"] },
];

describe.each(cases)("$table column grants", ({ table, hidden, roles }) => {
  it("revokes the table-level SELECT from anon and authenticated", () => {
    expect(sql).toContain(`revoke select on public.${table} from anon, authenticated;`);
  });

  it.each(roles)("grants %s every column except the hidden ones", (role) => {
    const expected = [...columnsOf(table)].filter((c) => !hidden.includes(c)).sort();
    expect(expected.length).toBeGreaterThan(5);
    expect([...grantedTo(table, role)].sort()).toEqual(expected);
  });

  it("never grants a hidden column", () => {
    for (const role of ["anon", "authenticated"]) {
      for (const col of hidden) expect(grantedTo(table, role).has(col), `${role}: ${col}`).toBe(false);
    }
  });
});

describe("the customer's own order reads (lib/shop/customer-orders.ts)", () => {
  it("select only columns the authenticated role is granted", () => {
    const orders = grantedTo("orders", "authenticated");
    const items = grantedTo("order_items", "authenticated");
    expect(CUSTOMER_ORDER_COLUMNS.filter((c) => !orders.has(c))).toEqual([]);
    expect(CUSTOMER_ORDER_ITEM_COLUMNS.filter((c) => !items.has(c))).toEqual([]);
  });
});

describe("customer_notes is server-only", () => {
  it("has row security on, nothing for anon or authenticated, and no table grant", () => {
    expect(sql).toContain("alter table customer_notes enable row level security;");
    expect(sql).toContain("revoke all on public.customer_notes from anon, authenticated;");
    const policies = [...sql.matchAll(/create policy "[^"]+" on (?:public\.)?customer_notes\s+([^;]*);/g)];
    expect(policies.length).toBeGreaterThan(0);
    for (const [, body] of policies) expect(body).toMatch(/\bto service_role\b/);
    expect(sql).not.toMatch(/grant [a-z, ]+ on (?:table )?(?:public\.)?customer_notes to/);
  });
});
