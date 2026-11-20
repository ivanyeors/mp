import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { POINTS_KIND_LABEL, POINTS_LEDGER_KINDS } from "@/lib/points/kinds";

const dir = new URL("../../../supabase/migrations/", import.meta.url);
const sql = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(new URL(f, dir), "utf8").replace(/--.*$/gm, ""));

function latestKinds(): string[] {
  const re = /add constraint points_ledger_kind_check check \(kind in\s*\(([^)]*)\)\)/gi;
  const lists = sql.flatMap((s) => [...s.matchAll(re)].map((m) => m[1]!));
  expect(lists.length).toBeGreaterThan(0);
  return [...lists.at(-1)!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
}

describe("points ledger kinds", () => {
  it("are the database's", () => {
    expect(new Set(POINTS_LEDGER_KINDS)).toEqual(new Set(latestKinds()));
  });

  it("each have a label", () => {
    for (const k of POINTS_LEDGER_KINDS) expect(POINTS_KIND_LABEL[k]).toBeTruthy();
  });
});
