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
  const scanned = readdirSync(EMAIL_DIR)
    .filter((f) => f.endsWith(".ts"))
    .filter((f) => f !== "theme.ts")
    .map((f) => join(EMAIL_DIR, f));

  it("has modules to scan", () => {
    expect(scanned.length).toBeGreaterThan(8);
  });

  it.each(scanned.map((f) => [f.replace(process.cwd() + "/", ""), f] as const))(
    "%s hardcodes no hex colour",
    (_name, file) => {
      const src = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    },
  );
});
