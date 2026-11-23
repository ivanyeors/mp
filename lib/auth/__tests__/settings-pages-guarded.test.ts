import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SETTINGS = "app/[lang]/settings";

const OPEN_TO_ALL_STAFF: Record<string, string> = {
  [`${SETTINGS}/page.tsx`]: "the Admin Panel home, open to every staff member",
  [`${SETTINGS}/inventory/page.tsx`]:
    "a layout over inventory/ would also lock Configure-only roles (Fulfilment) out of inventory/configure, and moving this client page out of page.tsx moves its lint baseline entry. Every table it reads (items, inventory_balances, pillow_products, bom_lines, bolster_bom_lines) is open to any active staff member by RLS, so a page check would protect none of its browser reads; its server actions in actions.ts check their own permissions",
};

function pages(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    if (name === "__tests__") return [];
    const child = join(dir, name);
    if (statSync(join(ROOT, child)).isDirectory()) return pages(child);
    return name === "page.tsx" ? [child] : [];
  });
}

const read = (file: string) => readFileSync(join(ROOT, file), "utf8");
const callsPageGuard = (src: string) => /\brequireAdminPage\s*\(/.test(src);

function guardingLayout(page: string): string | null {
  for (let dir = dirname(page); dir !== SETTINGS && dir.startsWith(SETTINGS); dir = dirname(dir)) {
    const layout = join(dir, "layout.tsx");
    if (existsSync(join(ROOT, layout)) && callsPageGuard(read(layout))) return layout;
  }
  return null;
}

function isPureRedirect(src: string): boolean {
  if (/^["']use client["']/m.test(src) || !/\bredirect\s*\(/.test(src)) return false;
  if (/\bimport\s*\(|\brequire\s*\(/.test(src)) return false;
  const sources = [
    ...[...src.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((m) => m[1]),
    ...[...src.matchAll(/^\s*import\s+["']([^"']+)["']/gm)].map((m) => m[1]),
  ];
  return sources.every((s) => s === "next/navigation" || s.startsWith("@/lib/i18n/"));
}

describe("isPureRedirect", () => {
  it("sees every import in a file without semicolons", () => {
    const src = `import { supabaseAdmin } from '@/lib/supabase/server'\nimport { redirect } from 'next/navigation'\nexport default async function P() { if (x) redirect('/a'); return supabaseAdmin() }`;
    expect(isPureRedirect(src)).toBe(false);
  });

  it("rejects side-effect and dynamic imports", () => {
    expect(isPureRedirect(`import "server-only";\nimport { redirect } from "next/navigation";\nredirect("/a");`)).toBe(false);
    expect(isPureRedirect(`import { redirect } from "next/navigation";\nconst m = await import("@/lib/x");\nredirect("/a");`)).toBe(false);
  });

  it("accepts a plain localized redirect", () => {
    expect(isPureRedirect(`import { redirect } from "next/navigation";\nimport { withLocale } from "@/lib/i18n/routing";\nexport default async function P() { redirect(withLocale("/a", "en-US")); }`)).toBe(true);
  });
});

describe("cost prices stay Costings-only in the database", () => {
  const migrations = readdirSync(join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  const lastTouching = (pattern: RegExp) => {
    const hits = migrations.filter((f) => pattern.test(read(`supabase/migrations/${f}`)));
    return hits.length ? read(`supabase/migrations/${hits[hits.length - 1]}`) : "";
  };

  it('the latest migration to set "Staff read item_prices" requires the costings permission', () => {
    const sql = lastTouching(/policy\s+"Staff read item_prices"/i);
    expect(sql).toMatch(/"Staff read item_prices"[\s\S]*?admin_has_permission\('costings'\)/i);
  });

  it("admin_has_permission mirrors permissionsForRoleRow: active member, grants_all or the key in permissions", () => {
    const sql = lastTouching(/function\s+public\.admin_has_permission/i);
    expect(sql).toMatch(/auth_user_id\s*=\s*auth\.uid\(\)/);
    expect(sql).toMatch(/coalesce\(a\.is_active,\s*false\)/);
    expect(sql).toMatch(/r\.grants_all\s+or\s+perm\s*=\s*any/);
  });
});

describe("every Admin Panel page checks permission on the server", () => {
  const all = pages(SETTINGS);

  it("finds the settings pages", () => {
    expect(all.length).toBeGreaterThan(30);
  });

  it.each(all.map((p) => [relative(ROOT, join(ROOT, p))]))("%s", (page) => {
    if (OPEN_TO_ALL_STAFF[page]) return;
    const src = read(page);
    const guarded = callsPageGuard(src) || guardingLayout(page) !== null || isPureRedirect(src);
    expect(
      guarded,
      `${page} must call requireAdminPage (or sit under a layout.tsx that does). A "use client" page's browser reads otherwise run for any staff member, and the sidebar only sends them away after the page has mounted.`,
    ).toBe(true);
  });
});
