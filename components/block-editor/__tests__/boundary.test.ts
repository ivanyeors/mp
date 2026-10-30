import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The shared block editor knows nothing about email (PRD-campaign-email-editor
 * decision 1, ADR 0036): nothing in components/block-editor/ imports
 * lib/email* or lib/email-campaigns/*, by alias or by a relative path, so
 * Email templates, Blogs and Page Builder can use it as it is. A page hands
 * it its block types and Variables instead.
 */

const ROOT = process.cwd();
const DIR = join(ROOT, "components/block-editor");

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (/\.(tsx?|mts|cts|jsx?)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Every module specifier a file names: static and type imports, re-exports, `import()` and `require()`. */
function specifiers(code: string): string[] {
  const found: string[] = [];
  const patterns = [
    /\b(?:import|export)\s[^'"`;]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bvi\.mock\s*\(\s*["']([^"']+)["']/g,
  ];
  for (const re of patterns) for (const m of code.matchAll(re)) found.push(m[1]);
  return found;
}

/** Where a specifier points inside the repo, as a repo path; null for a package. */
function target(file: string, spec: string): string | null {
  if (spec.startsWith("@/")) return spec.slice(2);
  if (spec.startsWith(".")) return relative(ROOT, resolve(dirname(file), spec));
  return null;
}

const EMAIL = /^lib\/email(?:[-/]|$)|^lib\/email-campaigns(?:\/|$)/;

describe("components/block-editor/", () => {
  // This file names email paths on purpose, to check the check.
  const files = sources(DIR).filter((f) => !f.endsWith("boundary.test.ts"));

  it("has its parts", () => {
    const names = files.map((f) => relative(DIR, f));
    for (const part of ["block-editor.tsx", "block-palette.tsx", "use-editor-history.ts", "rich-text.tsx", "use-unsaved-guard.ts", "ai-button.tsx"]) {
      expect(names).toContain(part);
    }
  });

  it("imports no email code, by alias or by a relative path", () => {
    const offending = files.flatMap((file) =>
      specifiers(readFileSync(file, "utf8"))
        .map((spec) => ({ spec, to: target(file, spec) }))
        .filter((s) => s.to && EMAIL.test(s.to))
        .map((s) => `${relative(ROOT, file)} imports ${s.spec}`),
    );
    expect(offending).toEqual([]);
  });

  it("reads every kind of import (the check itself)", () => {
    const code = [
      'import { a } from "@/lib/email/base";',
      'import type { B } from "@/lib/email-campaigns/content";',
      'export { c } from "../../lib/email-campaigns/rules";',
      'const d = await import("@/lib/email/campaign-blocks");',
      'import "@/lib/email/theme";',
      'import { fine } from "@/lib/utils";',
    ].join("\n");
    const file = join(DIR, "x.ts");
    const hits = specifiers(code).filter((s) => EMAIL.test(target(file, s) ?? ""));
    expect(hits.sort()).toEqual(
      ["@/lib/email/base", "@/lib/email-campaigns/content", "../../lib/email-campaigns/rules", "@/lib/email/campaign-blocks", "@/lib/email/theme"].sort(),
    );
  });
});
