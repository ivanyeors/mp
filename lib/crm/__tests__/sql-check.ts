import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { pgTextArray, type CustomerListQuery } from "@/lib/crm/customer-filters";

/**
 * What the CRM's database checks share (lib/crm/purchase-lines.check.ts,
 * lib/crm/lifecycle-stage.check.ts): SQL literals, one psql session whose
 * results come back by name, and `applyCustomerFilters`'s calls as a SQL
 * `where`, the way PostgREST reads them.
 */

/** A SQL literal: standard_conforming_strings is on, so only quotes are doubled. */
export const sqlLiteral = (v: string | number | boolean | null): string =>
  v === null ? "null" : typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : String(v);

export const sqlJsonLiteral = (v: unknown) => (v === null || v === undefined ? "null" : `${sqlLiteral(JSON.stringify(v))}::jsonb`);

/** Runs `sql` in one psql session on `url`; each `@@name@@<value>` output line is one result. */
export function runPsql(url: string, sql: string): Map<string, string> {
  const out = execFileSync("psql", [url, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  const results = new Map<string, string>();
  for (const line of out.split("\n")) {
    const m = line.match(/^@@([^@]+)@@(.*)$/);
    if (m) results.set(m[1]!, m[2]!);
  }
  return results;
}

export function psqlJson<T>(results: Map<string, string>, name: string): T {
  const v = results.get(name);
  assert.ok(v !== undefined, `no result named ${name}`);
  return JSON.parse(v) as T;
}

/**
 * `applyCustomerFilters`'s calls as a SQL `where`, the way PostgREST reads
 * them: like/ilike rewrite every `*` to `%`, `ov` is `&&`, `in` is `in`,
 * `is` / `not.is`.
 */
export class SqlFilter implements CustomerListQuery {
  readonly where: string[] = [];
  ilike(column: string, pattern: string) {
    this.where.push(`${column} ilike ${sqlLiteral(pattern.replaceAll("*", "%"))}`);
    return this;
  }
  overlaps(column: string, value: string) {
    this.where.push(`${column} && ${sqlLiteral(value)}::text[]`);
    return this;
  }
  contains(column: string, value: string[]) {
    this.where.push(`${column} @> ${sqlLiteral(pgTextArray(value))}::text[]`);
    return this;
  }
  eq(column: string, value: boolean | string | number) {
    this.where.push(`${column} = ${sqlLiteral(value)}`);
    return this;
  }
  in(column: string, values: readonly string[]) {
    this.where.push(`${column} in (${values.map(sqlLiteral).join(", ")})`);
    return this;
  }
  is(column: string) {
    this.where.push(`${column} is null`);
    return this;
  }
  not(column: string, operator: "is" | "cs", value: string | null) {
    this.where.push(operator === "is" ? `${column} is not null` : `not (${column} @> ${sqlLiteral(String(value))}::text[])`);
    return this;
  }
  gt(column: string, value: string | number) {
    this.where.push(`${column} > ${sqlLiteral(value)}`);
    return this;
  }
  gte(column: string, value: string | number) {
    this.where.push(`${column} >= ${sqlLiteral(value)}`);
    return this;
  }
  lt(column: string, value: string) {
    this.where.push(`${column} < ${sqlLiteral(value)}`);
    return this;
  }
  lte(column: string, value: number) {
    this.where.push(`${column} <= ${sqlLiteral(value)}`);
    return this;
  }
  order() {
    return this;
  }
}
