import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AT_RISK_AFTER_MONTHS,
  LAPSED_AFTER_MONTHS,
  LIFECYCLE_DELIVERIES,
  LIFECYCLE_STAGES,
  LOYAL_FROM_PURCHASES,
  SETTLED_AFTER_DAYS,
} from "@/lib/crm/lifecycle-stage";
import { NOT_A_PURCHASE } from "@/lib/readjustment/purchases";

/**
 * PRD-crm-retention-loop slice 03: the Lifecycle stage is computed in SQL
 * (`customer_lifecycle_stage`, `customer_lifecycle_delivery`, called by
 * `admin_customer_overview`) and mirrored in lib/crm/lifecycle-stage.ts. This
 * holds the latest migration's numbers and words to the TypeScript's, so a
 * threshold changed on one side fails here; lib/crm/lifecycle-stage.check.ts
 * runs both on a database.
 */

const dir = new URL("../../../supabase/migrations/", import.meta.url);
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => ({ name: f, sql: readFileSync(new URL(f, dir), "utf8").replace(/--.*$/gm, "") }));

/** The body of the latest `create or replace function public.<name>`. */
function latestFunction(name: string): string {
  const re = new RegExp(`create (?:or replace )?function public\\.${name}\\s*\\(([\\s\\S]*?)\\$\\$([\\s\\S]*?)\\$\\$`, "gi");
  const bodies = files.flatMap(({ sql }) => [...sql.matchAll(re)].map((m) => m[0]));
  expect(bodies.length, `no definition of ${name}`).toBeGreaterThan(0);
  return bodies.at(-1)!.replace(/\s+/g, " ");
}

/** The latest definition of the Customer overview, whitespace folded. */
function latestOverview(): string {
  const re = /create (?:or replace )?view (?:public\.)?admin_customer_overview\b[\s\S]*?;/gi;
  const defs = files.flatMap(({ sql }) => [...sql.matchAll(re)].map((m) => m[0]));
  return defs.at(-1)!.replace(/\s+/g, " ");
}

describe("customer_lifecycle_stage", () => {
  const fn = latestFunction("customer_lifecycle_stage");

  it("cuts at the TypeScript's months, strictly, Lapsed before At risk", () => {
    const lapsed = fn.indexOf(`p_last_purchase_at < p_now - interval '${LAPSED_AFTER_MONTHS} months' then 'lapsed'`);
    const atRisk = fn.indexOf(`p_last_purchase_at < p_now - interval '${AT_RISK_AFTER_MONTHS} months' then 'at_risk'`);
    expect(lapsed).toBeGreaterThan(-1);
    expect(atRisk).toBeGreaterThan(lapsed);
  });

  it("counts Loyal and Repeat as the TypeScript does, after recency", () => {
    const loyal = fn.indexOf(`p_purchases >= ${LOYAL_FROM_PURCHASES} then 'loyal'`);
    expect(loyal).toBeGreaterThan(fn.indexOf("'at_risk'"));
    expect(fn).toContain("p_purchases = 2 then 'repeat'");
    expect(fn).toContain("coalesce(p_purchases, 0) <= 0 then 'lead'");
  });

  it("returns only the TypeScript's stages", () => {
    const words = [...fn.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).filter((w) => !/^\d/.test(w!));
    for (const w of words) expect(LIFECYCLE_STAGES as readonly string[]).toContain(w);
    for (const s of LIFECYCLE_STAGES) expect(words).toContain(s);
  });
});

describe("customer_lifecycle_delivery", () => {
  const fn = latestFunction("customer_lifecycle_delivery");

  it("settles at the TypeScript's days, for a dated New only", () => {
    expect(fn).toContain(`p_delivered_at > p_now - interval '${SETTLED_AFTER_DAYS} days' then 'delivered'`);
    expect(fn).toContain("p_last_purchase_at is null or public.customer_lifecycle_stage(p_purchases, p_last_purchase_at, p_now) <> 'new' then null");
    for (const d of LIFECYCLE_DELIVERIES) expect(fn).toContain(`'${d}'`);
  });
});

describe("admin_customer_overview", () => {
  const view = latestOverview();

  it("reads the stage with now(), from purchases and the Shopify-era count", () => {
    expect(view).toContain(
      "public.customer_lifecycle_stage( coalesce(pu.purchases, 0) + coalesce(m.shopify_orders_count, 0), pu.last_purchase_at, now()) as lifecycle_stage",
    );
    expect(view).toContain("coalesce(m.shopify_orders_count, 0) > 0 and pu.last_purchase_at is null as lifecycle_undated");
  });

  it("counts a purchase as a counted Order with a goods line", () => {
    const pu = view.slice(view.indexOf("as last_purchase_delivered_at"));
    const statuses = pu.match(/o\.status not in \(([^)]*)\)/)![1]!.split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(new Set(statuses)).toEqual(new Set(NOT_A_PURCHASE));
    expect(pu).toContain("o.paid_at is not null");
    expect(pu).toContain("i.kind = 'goods'");
    expect(pu).toContain(") pu on pu.customer_id = c.id");
  });
});
