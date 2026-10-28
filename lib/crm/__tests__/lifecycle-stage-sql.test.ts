import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AT_RISK_AFTER_MONTHS,
  LAPSED_AFTER_MONTHS,
  LIFECYCLE_DETAILS,
  LIFECYCLE_STAGES,
  LOYAL_FROM_PURCHASES,
  SETTLED_AFTER_DAYS,
} from "@/lib/crm/lifecycle-stage";
import { NOT_A_PURCHASE } from "@/lib/readjustment/purchases";

/**
 * PRD-crm-retention-loop slice 03: the Lifecycle stage is computed in SQL
 * (`customer_lifecycle_stage`, `customer_lifecycle_detail`, called by
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

/** Every quoted word in a function body, numbers aside. */
const wordsOf = (fn: string) => [...fn.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!).filter((w) => w !== "UTC");

// In UTC whatever the session's TimeZone, as monthsBefore counts.
const before = (interval: string) => `((p_now at time zone 'UTC') - interval '${interval}') at time zone 'UTC'`;
const lastActivity = "greatest(p_last_purchase_at, p_last_booking_at)";

describe("customer_lifecycle_stage", () => {
  const fn = latestFunction("customer_lifecycle_stage");

  it("checks Lost, Lead, At risk, Loyal, then New", () => {
    const at = (s: string) => fn.indexOf(`then '${s}'`);
    expect(at("lost")).toBeGreaterThan(-1);
    expect(at("lead")).toBeGreaterThan(at("lost"));
    expect(at("at_risk")).toBeGreaterThan(at("lead"));
    expect(at("loyal")).toBeGreaterThan(at("at_risk"));
    expect(fn).toContain("else 'new' end");
  });

  it("is Lost when unsubscribed with no purchase or attended booking after it", () => {
    expect(fn).toContain(
      `when p_unsubscribed_at is not null and not coalesce(${lastActivity} > p_unsubscribed_at, false) then 'lost'`,
    );
    expect(fn).toContain("when coalesce(p_purchases, 0) <= 0 and coalesce(p_bookings, 0) <= 0 then 'lead'");
  });

  it("cuts At risk at the TypeScript's months, strictly and in UTC, never for a buyer without dates", () => {
    expect(fn).toContain(
      `when not (coalesce(p_purchases, 0) > 0 and p_last_purchase_at is null) and ${lastActivity} < ${before(`${AT_RISK_AFTER_MONTHS} months`)} then 'at_risk'`,
    );
  });

  it("makes Loyal from the TypeScript's purchases, or one attended booking", () => {
    expect(fn).toContain(`when coalesce(p_purchases, 0) >= ${LOYAL_FROM_PURCHASES} or coalesce(p_bookings, 0) >= 1 then 'loyal'`);
  });

  it("returns only the TypeScript's stages, and every one", () => {
    const words = wordsOf(fn);
    for (const w of words) expect(LIFECYCLE_STAGES as readonly string[]).toContain(w);
    for (const s of LIFECYCLE_STAGES) expect(words).toContain(s);
  });
});

describe("customer_lifecycle_detail", () => {
  const fn = latestFunction("customer_lifecycle_detail");

  it("reads the stage from the stage function, with the same facts", () => {
    expect(fn).toContain(
      "select case public.customer_lifecycle_stage( p_purchases, p_last_purchase_at, p_bookings, p_last_booking_at, p_unsubscribed_at, p_now)",
    );
  });

  it("settles a dated New at the TypeScript's days", () => {
    expect(fn).toContain("when 'new' then case when p_last_purchase_at is null then null when p_last_purchase_delivered_at is null then 'awaiting_delivery'");
    expect(fn).toContain(`when p_last_purchase_delivered_at > ${before(`${SETTLED_AFTER_DAYS} days`)} then 'delivered' else 'settled' end`);
  });

  it("names Loyal's reason and Lapsed as the TypeScript does", () => {
    expect(fn).toContain(`when 'loyal' then case when coalesce(p_purchases, 0) >= ${LOYAL_FROM_PURCHASES} then 'repeat_purchases' else 'bookings' end`);
    expect(fn).toContain(`when 'at_risk' then case when ${lastActivity} < ${before(`${LAPSED_AFTER_MONTHS} months`)} then 'lapsed' end`);
  });

  it("returns only the TypeScript's sub-statuses, and every one", () => {
    const words = wordsOf(fn).filter((w) => !(LIFECYCLE_STAGES as readonly string[]).includes(w));
    for (const w of words) expect(LIFECYCLE_DETAILS as readonly string[]).toContain(w);
    for (const d of LIFECYCLE_DETAILS) expect(words).toContain(d);
  });
});

describe("admin_customer_overview", () => {
  const view = latestOverview();
  const facts =
    "coalesce(pu.purchases, 0) + coalesce(m.shopify_orders_count, 0), pu.last_purchase_at, " +
    "coalesce(rb.attended_bookings, 0), rb.last_readjusted_at, " +
    "case when c.marketing_email = 'unsubscribed' then c.marketing_email_updated_at end, now())";

  it("reads the stage with now(), from purchases, attended bookings and the unsubscribe", () => {
    expect(view).toContain(`public.customer_lifecycle_stage( ${facts} as lifecycle_stage`);
    expect(view).toContain(
      `public.customer_lifecycle_detail( ${facts.replace("pu.last_purchase_at, ", "pu.last_purchase_at, pu.last_purchase_delivered_at, ")} as lifecycle_detail`,
    );
    expect(view).toContain("coalesce(m.shopify_orders_count, 0) > 0 and pu.last_purchase_at is null as lifecycle_undated");
    expect(view).toContain("coalesce(rb.attended_bookings, 0) as attended_bookings");
  });

  it("counts attended Re-adjustment bookings only", () => {
    expect(view).toContain(
      "select b.customer_id, max(b.start_at) as last_readjusted_at, count(*)::int as attended_bookings " +
        "from public.readjustment_bookings b where b.status = 'attended' group by b.customer_id ) rb on rb.customer_id = c.id",
    );
  });

  it("counts a purchase as a counted Order with a goods line", () => {
    const pu = view.slice(view.indexOf("as last_purchase_delivered_at"));
    const statuses = pu.match(/o\.status not in \(([^)]*)\)/)![1]!.split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(new Set(statuses)).toEqual(new Set(NOT_A_PURCHASE));
    // The whole where clause, so a loosened or negated rule fails here and not only on a database.
    expect(pu).toContain(
      "where o.customer_id is not null and o.paid_at is not null " +
        "and o.status not in ('pending', 'cancelled', 'refunded', 'payment_failed') " +
        "and exists (select 1 from public.order_items i where i.order_id = o.id and i.kind = 'goods') " +
        "group by o.customer_id ) pu on pu.customer_id = c.id",
    );
  });
});
