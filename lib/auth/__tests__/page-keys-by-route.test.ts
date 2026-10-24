import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import type { Permission } from "@/lib/auth/permissions";

/**
 * One key per page (ADR 0023): the routes, pages and server actions behind a
 * sidebar page are guarded by that page's key, so unticking a page on a role
 * closes its APIs too. Each row names a directory and the only keys its guards
 * may name; a key from a neighbouring page fails here.
 */

const GUARD = /(requireAdmin|requireAnyAdmin|requireAdminContext|requireAdminPage|assertAdmin|assertAnyAdmin|requireBearerOrAdmin)\s*\(([^;{]*?)\)/g;
const PERM_CONST = /const PERM\s*=\s*["']([a-z.-]+)["']/g;

function files(path: string): string[] {
  const full = join(process.cwd(), path);
  if (!statSync(full).isDirectory()) return [full];
  return readdirSync(full).flatMap((name) => {
    if (name === "__tests__") return [];
    const child = join(path, name);
    if (statSync(join(process.cwd(), child)).isDirectory()) return files(child);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith(".check.ts") ? [join(process.cwd(), child)] : [];
  });
}

function guardKeys(src: string): string[] {
  const keys: string[] = [];
  for (const m of src.matchAll(GUARD)) {
    for (const k of m[2].matchAll(/["']([a-z.-]+)["']/g)) keys.push(k[1]);
  }
  for (const m of src.matchAll(PERM_CONST)) keys.push(m[1]);
  return keys.filter((k) => !k.startsWith("SHOPIFY_"));
}

const S = "app/[lang]/settings";

const PAGES: [string[], Permission[]][] = [
  [[`${S}/faq`, "app/api/faq", "app/api/page-faq"], ["faq"]],
  [[`${S}/forms`, "app/api/settings/forms"], ["forms"]],
  [[`${S}/partners`, "app/api/partners", "app/api/partners-page"], ["partners"]],
  [[`${S}/partner-applications`], ["partner-applications"]],
  [[`${S}/partner-commissions`, "components/partner/milestone-rungs-actions.ts"], ["partner-commissions"]],
  [[`${S}/product-builder/rules-engine`, "app/api/settings/rules-engine"], ["rules-engine"]],
  [
    [
      `${S}/product-builder/mappings`,
      `${S}/product-builder/dimensions`,
      `${S}/product-builder/soft-body`,
      `${S}/product-builder/filling-visuals`,
      `${S}/inventory/configure`,
    ],
    ["configure"],
  ],
  [[`${S}/products`], ["products"]],
  [[`${S}/page-builder`, "app/api/landing-sections"], ["page-builder"]],
  [["app/api/site-settings"], ["media"]],
  [[`${S}/integrations/shopify`, "app/api/shopify", "lib/shopify/route-auth.ts"], ["shopify-link"]],
  [[`${S}/appointments`, "app/api/settings/appointments"], ["appointments"]],
  [[`${S}/rma`], ["returns"]],
  [[`${S}/docs`], ["docs"]],
  [[`${S}/users`, "app/api/admin/users", "app/api/admin/roles", "app/api/staff/telegram-operators", "app/api/staff/[id]"], ["users"]],
  // Shared by Inventory, Shopify Link and Costings; each action names the pages that call it.
  [[`${S}/inventory/actions.ts`], ["inventory", "shopify-link", "costings"]],
];

describe("each page's routes are guarded by that page's key", () => {
  it.each(PAGES.flatMap(([paths, keys]) => paths.map((p) => [p, keys] as const)))(
    "%s → %j",
    (path, keys) => {
      const found = files(path).flatMap((f) =>
        guardKeys(readFileSync(f, "utf8")).map((k) => [relative(process.cwd(), f), k] as const),
      );
      expect(found.length, `${path} has no guard`).toBeGreaterThan(0);
      for (const [file, key] of found) {
        expect(keys as readonly string[], `${file} guards on "${key}"`).toContain(key);
      }
    },
  );
});
