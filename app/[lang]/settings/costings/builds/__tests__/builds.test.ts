import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Costings build costs: the route hands the page every active Filling Template with
 * its Size membership and its Derived pack list, read from the placement tables the
 * browser cannot see. Placements win over legacy flat lines (ADR 0008).
 */

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  ranges: [] as Array<{ table: string; from: number; to: number }>,
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({ requireAdmin: h.requireAdmin }));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let range: [number, number] | null = null;
      const q = {
        select: () => q,
        order: () => q,
        eq(col: string, value: unknown) {
          filters.push((row) => row[col] === value);
          return q;
        },
        in(col: string, values: unknown[]) {
          filters.push((row) => values.includes(row[col]));
          return q;
        },
        range(from: number, to: number) {
          range = [from, to];
          h.ranges.push({ table, from, to });
          return q;
        },
        then(resolve: (v: unknown) => void) {
          let data = (h.tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
          if (range) data = data.slice(range[0], range[1] + 1);
          resolve({ data, error: null });
        },
      };
      return q;
    },
  }),
}));

const { GET } = await import("@/app/[lang]/settings/costings/builds/route");

beforeEach(() => {
  h.requireAdmin.mockReset().mockResolvedValue(null);
  h.ranges = [];
  h.tables = {
    bom_templates: [
      { id: 1, kind: "pillow", name: "Type-2", role: "filling", is_active: true },
      { id: 2, kind: "pillow", name: "Legacy", role: "filling", is_active: true },
      { id: 3, kind: "bolster", name: "short - default", role: "filling", is_active: true },
      { id: 4, kind: "pillow", name: "Retired", role: "filling", is_active: false },
      { id: 5, kind: "pillow", name: "Natural White", role: "warehouse", is_active: true },
    ],
    bom_template_keys: [
      { template_id: 1, key: "XS" },
      { template_id: 1, key: "S" },
      { template_id: 2, key: "M" },
      { template_id: 3, key: "short" },
    ],
    bom_template_lines: [
      // Stale flat lines on a placed template: ignored, placements are the truth.
      { template_id: 1, item_id: 99, quantity: 7 },
      { template_id: 2, item_id: 55, quantity: 4 },
    ],
    filling_template_placements: [
      { template_id: 1, item_id: 67 },
      { template_id: 1, item_id: 67 },
      { template_id: 1, item_id: 66 },
    ],
    bolster_template_placements: [
      { template_id: 3, item_id: 67 },
      { template_id: 3, item_id: 67 },
    ],
  };
});

describe("GET /settings/costings/builds", () => {
  it("refuses without the costings permission", async () => {
    h.requireAdmin.mockResolvedValue(new Response(null, { status: 403 }));
    const res = await GET();
    expect(res.status).toBe(403);
    expect(h.requireAdmin).toHaveBeenCalledWith("costings");
  });

  it("returns active Filling Templates with membership and the Derived pack list", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    const byId = new Map(body.templates.map((t: { id: number }) => [t.id, t]));
    expect([...byId.keys()].sort()).toEqual([1, 2, 3]);
    expect(byId.get(1)).toEqual({
      id: 1,
      kind: "pillow",
      name: "Type-2",
      keys: ["XS", "S"],
      pack: expect.arrayContaining([
        { itemId: 67, count: 2 },
        { itemId: 66, count: 1 },
      ]),
    });
    expect((byId.get(1) as { pack: unknown[] }).pack).toHaveLength(2);
    // No placements: the legacy flat lines are the pack list.
    expect(byId.get(2)).toMatchObject({ keys: ["M"], pack: [{ itemId: 55, count: 4 }] });
    // Bolsters read their own placement table.
    expect(byId.get(3)).toMatchObject({ kind: "bolster", pack: [{ itemId: 67, count: 2 }] });
  });

  it("reads placements past the 1,000-row page", async () => {
    h.tables.filling_template_placements = Array.from({ length: 1500 }, () => ({ template_id: 1, item_id: 67 }));
    const res = await GET();
    const body = await res.json();
    const type2 = body.templates.find((t: { id: number }) => t.id === 1);
    expect(type2.pack).toEqual([{ itemId: 67, count: 1500 }]);
    expect(h.ranges.filter((r) => r.table === "filling_template_placements")).toEqual([
      { table: "filling_template_placements", from: 0, to: 999 },
      { table: "filling_template_placements", from: 1000, to: 1999 },
    ]);
  });
});
