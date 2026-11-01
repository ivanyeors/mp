import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CUSTOMER_OVERVIEW_COLUMNS } from "@/lib/crm/customer-overview";

/**
 * `admin_customer_lifecycle_counts` (20261101020836) counts the Customer
 * lifecycle chart from the Customer overview. A function, so a rebuild of the
 * overview need not drop it; this holds the columns it reads to the
 * overview's, and keeps it server-only.
 */

const dir = new URL("../../../supabase/migrations/", import.meta.url);
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => ({ name: f, sql: readFileSync(new URL(f, dir), "utf8").replace(/--.*$/gm, "") }));

const defs = files.filter(({ sql }) => /create (?:or replace )?function public\.admin_customer_lifecycle_counts\s*\(/i.test(sql));
const latest = defs.at(-1)!;
const body = /\$\$([\s\S]*?)\$\$/.exec(latest.sql.slice(latest.sql.search(/function public\.admin_customer_lifecycle_counts/i)))![1]!;

describe("admin_customer_lifecycle_counts", () => {
  it("is defined by a migration", () => {
    expect(defs.length).toBeGreaterThan(0);
  });

  it("groups the Customer overview by stage, sub-status and no dates yet, all columns it has", () => {
    expect(body).toMatch(/from public\.admin_customer_overview\b/);
    const read = [...body.matchAll(/\bov\.([a-z_]+)/g)].map((m) => m[1]!);
    expect(new Set(read)).toEqual(new Set(["lifecycle_stage", "lifecycle_detail", "lifecycle_undated"]));
    for (const column of read) expect(CUSTOMER_OVERVIEW_COLUMNS).toContain(column);
    expect(body).toMatch(/group by ov\.lifecycle_stage, ov\.lifecycle_detail, ov\.lifecycle_undated/);
  });

  it("returns the columns the chart reads", () => {
    expect(latest.sql).toMatch(/returns table \(stage text, detail text, undated boolean, customers int\)/);
  });

  it("is executable by the service role alone", () => {
    expect(latest.sql).toMatch(/revoke execute on function public\.admin_customer_lifecycle_counts\(\) from public, anon, authenticated;/);
    expect(latest.sql).toMatch(/grant execute on function public\.admin_customer_lifecycle_counts\(\) to service_role;/);
    expect(latest.sql).not.toMatch(/security definer/i);
  });
});
