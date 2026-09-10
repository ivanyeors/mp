import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every handler under /api/mp-config must gate its caller.
 *
 * Deliberately per HTTP verb, not per file — which is the whole point. A
 * per-file scan is what let `GET /api/shop/orders/[id]/mp-config-link` sit
 * unguarded for months: the file *did* contain requireAdmin, just not on the verb
 * that needed it. Sibling of lib/auth/__tests__/settings-routes-guarded.test.ts.
 */

const GATES =
  /await\s+(requireAdmin|requireAnyAdmin|requireAdminContext|requireResultAccess|authorizeResultAccess)\s*\(/;

/**
 * getAdminContext returns null rather than a refusal, so it is only a gate when
 * the handler acts on it. mp-config/page.tsx calls the same function purely to
 * decide whether to show Staff assist mode — counting the call alone would let
 * that pattern pass for a gate.
 */
const CONTEXT_GATE = /await\s+getAdminContext\s*\(/;
const REFUSES = /status:\s*(401|403)/;

function isGated(body: string): boolean {
  return GATES.test(body) || (CONTEXT_GATE.test(body) && REFUSES.test(body));
}

/**
 * Handlers that are open by design. Listed by name so adding a second one is a
 * visible diff and not a silent drift.
 *
 * POST /api/mp-config/responses creates a Draft Result. There is no row to own
 * yet and the configurator saves from the first keystroke, so it cannot require a
 * credential; it is rate limited instead, which this list asserts.
 */
const OPEN_BY_DESIGN: Record<string, { verb: string; requires: RegExp }[]> = {
  "responses/route.ts": [{ verb: "POST", requires: /isRateLimited\s*\(/ }],
};

const ROOT = join(process.cwd(), "app", "api", "mp-config");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

/** Source of each exported handler, from its signature to the next one. */
function handlerBodies(src: string): { verb: string; body: string }[] {
  const parts = src.split(/^export async function (GET|POST|PUT|PATCH|DELETE)\b/m);
  const out: { verb: string; body: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    out.push({ verb: parts[i], body: parts[i + 1] });
  }
  return out;
}

describe("mp-config API handlers are guarded", () => {
  const files = routeFiles(ROOT);

  it("finds the route files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [relative(ROOT, f), f]))("%s", (rel, file) => {
    const handlers = handlerBodies(readFileSync(file, "utf8"));
    expect(handlers.length).toBeGreaterThan(0);

    for (const { verb, body } of handlers) {
      const exempt = OPEN_BY_DESIGN[rel]?.find((e) => e.verb === verb);
      if (exempt) {
        // Open by design, but not unprotected.
        expect(exempt.requires.test(body), `${rel} ${verb} must stay rate limited`).toBe(true);
      } else {
        expect(isGated(body), `${rel} ${verb} has no auth gate`).toBe(true);
      }
    }
  });
});
