import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const GATES =
  /await\s+(requireAdmin|requireAnyAdmin|requireAdminContext|requireResultAccess|authorizeResultAccess)\s*\(/;

const CONTEXT_GATE = /await\s+getAdminContext\s*\(/;
const REFUSES = /status:\s*(401|403)/;

function isGated(body: string): boolean {
  return GATES.test(body) || (CONTEXT_GATE.test(body) && REFUSES.test(body));
}

const OPEN_BY_DESIGN: Record<string, { verb: string; requires: RegExp }[]> = {
  "responses/route.ts": [{ verb: "POST", requires: /rateLimitExceeded\s*\(/ }],
};

const ROOT = join(process.cwd(), "app", "api", "mp-config");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

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
        expect(exempt.requires.test(body), `${rel} ${verb} must stay rate limited`).toBe(true);
      } else {
        expect(isGated(body), `${rel} ${verb} has no auth gate`).toBe(true);
      }
    }
  });
});
