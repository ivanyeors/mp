import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Supabase records each migration by the number before its first `_`, so two
 * files sharing one never both apply: `supabase db push` refuses the second.
 * Parallel slices pick their timestamps by hand, which is how a clash happens.
 */

const dir = new URL("../../../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));

describe("supabase/migrations", () => {
  it("every file is named <version>_<name>.sql", () => {
    for (const f of files) expect(f, f).toMatch(/^\d+_[a-z0-9_]+\.sql$/);
  });

  it("no two files share a version", () => {
    const byVersion = new Map<string, string[]>();
    for (const f of files) {
      const version = f.slice(0, f.indexOf("_"));
      byVersion.set(version, [...(byVersion.get(version) ?? []), f]);
    }
    const clashes = [...byVersion.values()].filter((names) => names.length > 1);
    expect(clashes).toEqual([]);
  });
});
