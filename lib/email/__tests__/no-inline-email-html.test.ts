/**
 * Structural guard: email HTML belongs in lib/email/, not in route handlers or
 * server actions.
 *
 * Six route files used to build their own <!doctype html> documents or bare <p>
 * fragments, which is how the branding drifted and how unescaped interpolation
 * got in. This test fails the build if that pattern returns.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const APP_DIR = join(process.cwd(), "app");
const EMAIL_DIR = join(process.cwd(), "lib", "email");

function walk(dir: string, match: (file: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full, match));
    } else if (match(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("no inline email HTML in app/", () => {
  const files = walk(
    APP_DIR,
    (f) => f === "route.ts" || f === "actions.ts",
  );

  it("finds the route/action files to scan", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("never builds a full HTML document outside lib/email", () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      return /<!doctype html>/i.test(src) || /<html[\s>]/i.test(src);
    });
    expect(offenders.map((f) => f.replace(process.cwd() + "/", ""))).toEqual([]);
  });

  it("never re-implements escapeHtml", () => {
    const offenders = files.filter((f) =>
      /function\s+escapeHtml\b/.test(readFileSync(f, "utf8")),
    );
    expect(offenders.map((f) => f.replace(process.cwd() + "/", ""))).toEqual([]);
  });
});

describe("email colours come from the theme", () => {
  const templateFiles = readdirSync(EMAIL_DIR)
    .filter((f) => f.endsWith(".ts"))
    .filter((f) => !["theme.ts", "components.ts", "base.ts"].includes(f))
    .map((f) => join(EMAIL_DIR, f));

  it("has template modules to scan", () => {
    expect(templateFiles.length).toBeGreaterThan(4);
  });

  it("never hardcodes a hex colour in a template module", () => {
    // Colours live in theme.ts and are applied by components.ts. A hex literal
    // in a template is the exact drift this system replaced.
    const offenders: string[] = [];
    for (const file of templateFiles) {
      const src = readFileSync(file, "utf8");
      const hits = src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      if (hits.length > 0) {
        offenders.push(`${file.replace(process.cwd() + "/", "")}: ${hits.join(", ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
