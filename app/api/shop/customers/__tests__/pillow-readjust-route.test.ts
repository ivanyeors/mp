import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * ADR 0042 l: Re-adjust. At a Re-adjustment visit Staff change the fillings in
 * the pillow a Customer already has; what they leave in it is saved on the
 * Staff link and drawn from then on, on the Customer page and the Profile. It
 * moves no stock and reaches no order or price. A view-only role changes
 * nothing. Every name and id here is made up; the template names follow the
 * catalog's.
 */

const h = vi.hoisted(() => ({
  db: {} as FakeDb,
  identity: null as { id: string; email: string } | null,
  audit: vi.fn(),
}));

vi.mock("@/lib/auth/user", () => ({
  getAuthUser: () => Promise.resolve(h.identity),
  getAuthIdentity: () => Promise.resolve(h.identity),
}));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return {
    supabaseAdmin: () => {
      const fake = fakeSupabaseAdmin(h.db);
      return {
        from: (table: string) => {
          const q = fake.from(table) as ReturnType<typeof fake.from> & { upsert?: unknown; or?: unknown };
          // The shared fake has no upsert; customer_pillows is keyed by `customer_id`.
          q.upsert = async (row: Record<string, unknown>) => {
            const list = (h.db[table] ??= []);
            const at = list.findIndex((r) => r.customer_id === row.customer_id);
            if (at >= 0) list[at] = { ...list[at], ...row };
            else list.push({ ...row });
            return { error: null };
          };
          // Nor PostgREST's `or`: the placeable-Items filter is the shared PLACEABLE_ITEMS_OR, so every row here is one.
          q.or = () => q;
          return q;
        },
      };
    },
  };
});
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: h.audit }));
vi.mock("@/lib/staff/working-as", () => ({
  getWorkingAs: () => Promise.resolve({ id: "p-mei", name: "Mei" }),
  actingProfile: () => Promise.resolve({ id: "p-mei", name: "Mei" }),
}));

const readjust = await import("../[id]/pillow/readjust/route");
const link = await import("../[id]/pillow/route");

const CUSTOMER = "aaaaaaaa-0000-4000-8000-000000000001";

const role = (id: string, permissions: string[], grantsAll = false) => ({
  id,
  key: id,
  name: id,
  grants_all: grantsAll,
  permissions,
});

const signIn = (roleId: string) => {
  h.identity = { id: `auth-${roleId}`, email: `${roleId}@x.test` };
  h.db.admin_users = [
    { id: `m-${roleId}`, email: `${roleId}@x.test`, role_id: roleId, is_active: true, auth_user_id: `auth-${roleId}` },
  ];
};

const ctx = { params: Promise.resolve({ id: CUSTOMER }) };
const url = `https://x.test/api/shop/customers/${CUSTOMER}/pillow/readjust`;
const post = (body: unknown) =>
  readjust.POST(new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), ctx);

const piece = (section: string, subSection: string, slot: number, itemId: number, row: number | null = null) => ({
  section,
  sub_section: subSection,
  slot,
  item_id: itemId,
  row_index: row,
  insert_order: null,
  offset_x_mm: null,
  offset_y_mm: null,
});
const template = (id: number, name: string, key: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  key,
  kind: "pillow",
  role: "filling",
  is_active: true,
  ...over,
});

/** Type-12's two pieces with the 6D M swapped for two 3D S, one under the other. */
const MIX = [piece("center", "middle", 1, 67), piece("left", "front", 1, 69, 0), piece("left", "front", 2, 69, 1)];

beforeEach(() => {
  h.audit.mockReset();
  h.db = {
    admin_roles: [
      role("owner", [], true),
      role("crm-editor", ["customers", "customers-edit"]),
      role("crm-viewer", ["customers"]),
    ],
    admin_users: [],
    mp_staff: [{ id: "p-mei", name: "Mei" }],
    customers: [{ id: CUSTOMER, email: "mei@example.test" }],
    customer_fittings: [
      {
        id: "f-2",
        customer_id: CUSTOMER,
        fitted_at: "2025-06-01T02:00:00.000Z",
        recommended_size: "L",
        configuration_type: "T12",
        profile_side: "L-LN",
        drive_files: [],
        other_answers: {},
        sleep_symptoms: [],
      },
    ],
    bom_templates: [
      template(57, "Type-12", "L"),
      template(40, "Natural White", "S", { role: "warehouse" }),
      template(80, "Type-10A", "L", { is_active: false }),
    ],
    bom_template_keys: [{ template_id: 57, key: "L" }],
    filling_template_placements: [
      { template_id: 57, ...piece("center", "middle", 1, 67) },
      { template_id: 57, ...piece("center", "middle", 2, 68) },
    ],
    items: [
      { id: 67, name: "6D S", subtype: "6D", size: "S", category: "filling", is_active: true },
      { id: 68, name: "6D M", subtype: "6D", size: "M", category: "filling", is_active: true },
      { id: 69, name: "3D S", subtype: "3D", size: "S", category: "filling", is_active: true },
      { id: 70, name: "3D M", subtype: "3D", size: "M", category: "filling", is_active: false },
      { id: 90, name: "Cervical Neck Support", subtype: null, size: "M", category: "accessories", is_active: true },
      { id: 91, name: "Cotton Case", subtype: null, size: "M", category: "case", is_active: true },
    ],
    customer_pillows: [],
    inventory_transactions: [],
    orders: [],
    order_items: [],
  };
});

describe("a view-only role (customers, no customers-edit)", () => {
  beforeEach(() => signIn("crm-viewer"));

  it("cannot read the editor's fillings or save a re-adjustment, and nothing is written", async () => {
    expect((await readjust.GET()).status).toBe(403);
    expect((await post({ size: "L", fillingTemplateId: 57, placements: MIX })).status).toBe(403);
    expect(h.db.customer_pillows).toHaveLength(0);
    expect(h.audit).not.toHaveBeenCalled();
  });
});

describe.each(["crm-editor", "owner"])("a role with customers-edit (%s)", (roleId) => {
  beforeEach(() => signIn(roleId));

  it("reads the active Items the editor may place", async () => {
    const res = await readjust.GET();
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.map((i: { id: number }) => i.id)).not.toContain(70);
    expect(items.find((i: { id: number }) => i.id === 90)).toEqual({
      id: 90,
      name: "Cervical Neck Support",
      subtype: null,
      size: "M",
      category: "accessories",
    });
  });

  it("saves the fillings left in the pillow, drawn from then on instead of the template", async () => {
    const res = await post({ size: "L", fillingTemplateId: 57, placements: MIX });
    expect(res.status).toBe(200);
    const { pillow } = await res.json();
    expect(pillow).toMatchObject({
      source: "linked",
      size: "L",
      template: { id: 57, name: "Type-12" },
      link: { linkedBy: "Mei", readjusted: true },
      placements: MIX,
      onProfile: true,
    });
    expect(pillow.items.map((i: { id: number }) => i.id).sort()).toEqual([67, 69]);

    expect(h.db.customer_pillows).toEqual([
      expect.objectContaining({
        customer_id: CUSTOMER,
        pillow_size: "L",
        filling_template_id: 57,
        filling_placements: MIX,
        linked_by_user_id: `auth-${roleId}`,
        linked_by_profile_id: "p-mei",
      }),
    ]);
    // A Service: no stock moves, no order is touched.
    expect(h.db.inventory_transactions).toHaveLength(0);
    expect(h.db.orders).toHaveLength(0);
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "customer_pillow.readjust",
        entityType: "customer",
        entityId: CUSTOMER,
        before: null,
        after: expect.objectContaining({ pillow_size: "L", filling_template_id: 57, pieces: 3, filling_placements: MIX }),
      }),
    );
  });

  it("re-adjusts again over the last one, keeping the mix it replaced in the audit log", async () => {
    await post({ size: "L", fillingTemplateId: 57, placements: MIX });
    const next = [piece("center", "middle", 1, 69)];
    await post({ size: "L", fillingTemplateId: 57, placements: next });
    expect(h.db.customer_pillows).toHaveLength(1);
    expect(h.db.customer_pillows[0]).toMatchObject({ filling_placements: next });
    expect(h.audit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        before: { pillow_size: "L", filling_template_id: 57, filling_placements: MIX },
        after: expect.objectContaining({ filling_placements: next }),
      }),
    );
  });

  it("keeps where it came from only while that names a pillow filling template, retired or not", async () => {
    await post({ size: "L", fillingTemplateId: 80, placements: MIX });
    expect(h.db.customer_pillows[0]).toMatchObject({ filling_template_id: 80 });
    for (const id of [40, 999]) {
      expect((await post({ size: "L", fillingTemplateId: id, placements: MIX })).status).toBe(200);
      expect(h.db.customer_pillows[0]).toMatchObject({ filling_template_id: null, filling_placements: MIX });
    }
  });

  it("refuses an empty pillow, an unknown Item, an Item that is not placeable, and a full Layer", async () => {
    expect((await post({ size: "L", fillingTemplateId: 57, placements: [] })).status).toBe(400);
    expect((await post({ size: "L", fillingTemplateId: 57, placements: [piece("left", "front", 1, 999)] })).status).toBe(400);
    expect((await post({ size: "L", fillingTemplateId: 57, placements: [piece("left", "front", 1, 91)] })).status).toBe(400);
    expect((await post({ size: "L", fillingTemplateId: 57, placements: [piece("top", "front", 1, 67)] })).status).toBe(400);
    const crowded = [1, 2, 3, 4, 5, 6].map((slot) => piece("left", "front", slot, 67));
    expect((await post({ size: "L", fillingTemplateId: 57, placements: crowded })).status).toBe(400);
    expect((await post({ size: "XXL", fillingTemplateId: 57, placements: MIX })).status).toBe(400);
    expect(h.db.customer_pillows).toHaveLength(0);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("is replaced by Change pillow, which draws the template as it is now", async () => {
    await post({ size: "L", fillingTemplateId: 57, placements: MIX });
    const res = await link.PUT(
      new Request(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ size: "L", fillingTemplateId: 57 }),
      }),
      ctx,
    );
    const { pillow } = await res.json();
    expect(h.db.customer_pillows[0]).toMatchObject({ filling_placements: null });
    expect(pillow).toMatchObject({ link: { readjusted: false }, placements: [{ item_id: 67 }, { item_id: 68 }] });
  });

  it("answers 404 for a Customer that does not exist", async () => {
    const other = { params: Promise.resolve({ id: "bbbbbbbb-0000-4000-8000-000000000009" }) };
    expect((await readjust.POST(new Request(url, { method: "POST", body: "{}" }), other)).status).toBe(404);
  });
});
