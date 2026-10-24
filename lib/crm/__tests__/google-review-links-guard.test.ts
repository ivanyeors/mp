import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { codeOf, importClosure } from "./import-closure";

/**
 * No code path links a Google review to a Customer without a Staff action
 * (CRM README, seventh hazard; ADR 0028 (k)). Google gives a review a display
 * name and never an email, and a name is not an identity.
 *
 *  - In SQL, the one statement that inserts into `customer_google_reviews` is
 *    `link_google_review()`, no trigger writes it, and only the service role
 *    may run it.
 *  - In the app, only lib/crm/google-review-links.ts calls it, and only the
 *    Admin Panel routes under app/api/settings/customers/google-reviews import
 *    that file. They check `customers-edit` (the Customers write guard,
 *    lib/auth/__tests__/customers-write-guard.test.ts, scans them).
 *  - Nothing the Google sync runs reaches that file: not the sync itself, the
 *    Pub/Sub webhook, either cron, the Telegram handler or the backfill script.
 */

const LINKS_MODULE = "lib/crm/google-review-links.ts";
const LINK_ROUTES = "app/api/settings/customers/google-reviews/";

function sourceFiles(dir: string): string[] {
  const full = join(process.cwd(), dir);
  if (!existsSync(full)) return [];
  return readdirSync(full).flatMap((name) => {
    if (name === "__tests__" || name === "node_modules" || name.startsWith(".")) return [];
    const child = join(dir, name);
    if (statSync(join(process.cwd(), child)).isDirectory()) return sourceFiles(child);
    return /\.(ts|tsx|mts)$/.test(name) && !/\.(test|spec|check)\.tsx?$/.test(name) ? [child] : [];
  });
}

const APP_FILES = ["app", "lib", "components", "scripts"].flatMap(sourceFiles);

describe("SQL: only link_google_review() inserts a link", () => {
  const dir = new URL("../../../supabase/migrations/", import.meta.url);
  const migrations = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({ name: f, sql: readFileSync(new URL(f, dir), "utf8").replace(/--.*$/gm, "") }));

  it("has exactly one insert into customer_google_reviews, inside link_google_review", () => {
    const inserts = migrations.flatMap(({ name, sql }) =>
      [...sql.matchAll(/insert\s+into\s+(?:public\.)?customer_google_reviews\b/gi)].map((m) => ({ name, at: m.index! })),
    );
    expect(inserts).toHaveLength(1);
    const { name, at } = inserts[0];
    const sql = migrations.find((m) => m.name === name)!.sql;
    const fn = sql.lastIndexOf("create or replace function", at);
    expect(sql.slice(fn, at)).toMatch(/function public\.link_google_review\(/);
  });

  it("never writes a link from a trigger", () => {
    for (const { name, sql } of migrations) {
      for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?trigger\s+\w+[^;]*;/gi)) {
        expect(m[0], `${name}: ${m[0]}`).not.toMatch(/link_google_review|customer_google_reviews/i);
      }
    }
  });

  it("lets only the service role run the Staff actions", () => {
    const sql = migrations.map((m) => m.sql).join("\n");
    for (const fn of ["link_google_review", "unlink_google_review", "reject_google_review_match"]) {
      expect(sql).toMatch(new RegExp(`revoke execute on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated;`));
      const grants = [...sql.matchAll(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to ([a-z_, ]+);`, "g"))];
      expect(grants.map((g) => g[1].trim())).toEqual(["service_role"]);
    }
  });
});

describe("the app: only a Staff action links", () => {
  it("calls link_google_review from one module, and writes the table nowhere else", () => {
    const callers = APP_FILES.filter((f) => /["']link_google_review["']/.test(codeOf(f)));
    expect(callers).toEqual([LINKS_MODULE]);
    const writers = APP_FILES.filter((f) =>
      /from\(\s*["']customer_google_reviews["']\s*\)\s*\.\s*(insert|upsert|update)\b/.test(codeOf(f)),
    );
    expect(writers).toEqual([]);
  });

  it("is imported only by the Admin Panel routes that check customers-edit", () => {
    const importers = APP_FILES.filter((f) => /["']@\/lib\/crm\/google-review-links["']/.test(codeOf(f))).sort();
    expect(importers.length).toBeGreaterThan(0);
    for (const f of importers) expect(f.startsWith(LINK_ROUTES) && /\/route\.ts$/.test(f), f).toBe(true);
    for (const f of importers) {
      const src = codeOf(f);
      expect(src, f).toMatch(/requireAdmin\("customers-edit"\)/);
      expect(src, f).not.toMatch(/export async function GET/);
    }
  });

  it("is never reached from the Google sync, its webhook, the crons, the Telegram handler or the backfill", () => {
    const entries = [
      "lib/reviews/google-sync.ts",
      "lib/reviews/telegram-handler.ts",
      "app/api/webhooks/google-reviews/route.ts",
      "app/api/cron/google-reviews-sync/route.ts",
      "app/api/cron/results-sla/route.ts",
      "scripts/google-reviews-backfill.ts",
    ];
    const reached = importClosure(entries);
    // The sync does read suggestions, for the card's *Possible customer match* line.
    expect(reached).toContain("lib/crm/google-review-match-server.ts");
    expect(reached).not.toContain(LINKS_MODULE);
    for (const f of reached) {
      expect(codeOf(f), f).not.toMatch(/["'](link|unlink)_google_review["']/);
    }
  });
});
