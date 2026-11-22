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
  {
    table: "shipping_methods",
    hidden: ["markup_percent", "markup_fixed", "rate_rounding"],
    roles: ["anon", "authenticated"],
  },
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

const COST_COLUMN = /cost|cogs|margin|markup/;

function costColumnsInSchema(): string[] {
  const found = new Set<string>();
  for (const [, table, body] of sql.matchAll(/create table (?:if not exists )?(?:public\.)?([a-z_0-9]+)\s*\(([\s\S]*?)\n\);/g)) {
    for (const line of body.split("\n")) {
      const col = line.trim().match(/^([a-z_0-9]+)\s/)?.[1];
      if (col && COST_COLUMN.test(col)) found.add(`${table}.${col}`);
    }
  }
  for (const [, table, body] of sql.matchAll(/alter table (?:if exists )?(?:public\.)?([a-z_0-9]+)\s([^;]*);/g)) {
    for (const [, col] of body.matchAll(/\badd column (?:if not exists )?([a-z_0-9]+)/g)) {
      if (COST_COLUMN.test(col)) found.add(`${table}.${col}`);
    }
  }
  return [...found].sort();
}

const COST_COLUMNS_CLOSED_BY: Record<string, "column grants" | "no grants" | "staff-only rows"> = {
  "item_prices.cost_price": "staff-only rows",
  "order_items.total_cost": "column grants",
  "order_items.unit_cost": "column grants",
  "order_shipments.carrier_cost": "no grants",
  "order_shipments.quoted_carrier_cost": "no grants",
  "product_variants.cost_price": "column grants",
  "service_prices.cost_price": "staff-only rows",
  "shipping_methods.markup_fixed": "column grants",
  "shipping_methods.markup_percent": "column grants",
  "shopify_order_lines.total_cost": "staff-only rows",
  "shopify_order_lines.unit_cost": "staff-only rows",
};
const closedBy = (how: string) =>
  Object.entries(COST_COLUMNS_CLOSED_BY)
    .filter(([, h]) => h === how)
    .map(([c]) => c.split("."));

const loops = [...sql.matchAll(/foreach [a-z]+ in array array\[([^\]]*)\] loop([\s\S]*?)end loop;/g)].map(
  ([, list, body]) => ({ tables: list.split(",").map((t) => t.trim().replace(/'/g, "")), body }),
);

describe("customers never see a cost column (owner, 2026-11-22)", () => {
  it("every cost column in the schema is listed with how customers are kept out", () => {
    expect(costColumnsInSchema()).toEqual(Object.keys(COST_COLUMNS_CLOSED_BY).sort());
  });

  it.each(closedBy("column grants"))("%s.%s: table SELECT revoked, column never granted", (table, col) => {
    expect(sql).toContain(`revoke select on public.${table} from anon, authenticated;`);
    for (const role of ["anon", "authenticated"]) expect(grantedTo(table, role).has(col), role).toBe(false);
  });

  it.each([...closedBy("no grants"), ["shipping_rate_quotes", "rates"]])(
    "%s.%s: nothing granted to anon or authenticated",
    (table) => {
      expect(sql).toContain(`revoke all on public.${table} from anon, authenticated;`);
      expect(sql).not.toMatch(new RegExp(`grant [^;]* on (?:table )?(?:public\\.)?${table} to [^;]*(anon|authenticated)`));
      expect(sql).not.toMatch(new RegExp(`create policy "[^"]+" on (?:public\\.)?${table}\\s[^;]*to (anon|authenticated|public)`));
    },
  );

  it.each(closedBy("staff-only rows"))("%s.%s: row security on, no row for a customer", (table) => {
    const direct = new RegExp(`alter table (?:public\\.)?${table} enable row level security;`).test(sql);
    const looped = loops.some((l) => l.tables.includes(table) && l.body.includes("enable row level security"));
    expect(direct || looped).toBe(true);
    const policies = [...sql.matchAll(new RegExp(`create policy "[^"]+" on (?:public\\.)?${table}\\s([^;]*);`, "g"))];
    for (const [, body] of policies) expect(body).toMatch(/to service_role|is_admin_user\(\)/);
    const openedToAnon = loops.some((l) => l.tables.includes(table) && /to anon using \(true\)/.test(l.body));
    const closedAgain = loops.some(
      (l) => l.tables.includes(table) && /drop policy if exists %I on public\.%I', 'tmp_anon_read '/.test(l.body),
    );
    expect(openedToAnon && !closedAgain).toBe(false);
  });

  it("order_margins (COGS per order) is revoked from anon and authenticated", () => {
    const anonLoop = loops.some(
      (l) => l.tables.includes("order_margins") && l.body.includes("revoke all on public.%I from anon"),
    );
    expect(anonLoop).toBe(true);
    expect(sql).toContain("revoke all on public.order_margins from authenticated");
    expect(sql).not.toMatch(/grant [^;]* on (?:table )?(?:public\.)?order_margins to/);
  });
});
