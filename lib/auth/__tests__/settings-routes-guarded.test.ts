import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every API route under /settings must call requireAdmin (or a sibling
 * requireAdminContext) inside each exported handler — the settings layout has
 * no blanket gate, so the route handlers are the trust boundary.
 */

function settingsRouteFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return settingsRouteFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

const ROOT = join(process.cwd(), "app", "[lang]", "settings");

describe("settings API routes are admin-guarded", () => {
  const files = settingsRouteFiles(ROOT);

  it("finds the settings route files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [f.slice(ROOT.length + 1), f]))(
    "%s guards every exported handler",
    (_rel, file) => {
      const src = readFileSync(file, "utf8");
      const handlers = src.match(/^export async function (GET|POST|PUT|PATCH|DELETE)\b/gm) ?? [];
      expect(handlers.length).toBeGreaterThan(0);
      const guards = src.match(/await requireAdmin(Context)?\(/g) ?? [];
      expect(guards.length).toBeGreaterThanOrEqual(handlers.length);
    },
  );
});
