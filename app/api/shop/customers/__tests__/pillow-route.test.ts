import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

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
          const q = fake.from(table) as ReturnType<typeof fake.from> & { upsert?: unknown };
          q.upsert = async (row: Record<string, unknown>) => {
            const list = (h.db[table] ??= []);
            const at = list.findIndex((r) => r.customer_id === row.customer_id);
            if (at >= 0) list[at] = { ...list[at], ...row };
            else list.push({ ...row });
            return { error: null };
          };
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

const route = await import("../[id]/pillow/route");

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
const url = `https://x.test/api/shop/customers/${CUSTOMER}/pillow`;
const put = (body: unknown) =>
  route.PUT(new Request(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), ctx);
const del = () => route.DELETE(new Request(url, { method: "DELETE" }), ctx);

const template = (id: number, name: string, key: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  key,
  kind: "pillow",
  role: "filling",
  is_active: true,
  ...over,
});
const placement = (templateId: number, itemId: number, slot: number) => ({
  template_id: templateId,
  section: "center",
  sub_section: "middle",
  slot,
  item_id: itemId,
  row_index: null,
  insert_order: null,
  offset_x_mm: null,
  offset_y_mm: null,
});

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
        recommended_size: "S",
        configuration_type: "T12",
        profile_side: "S-LN",
        drive_files: [],
        other_answers: {},
        sleep_symptoms: [],
      },
    ],
    bom_templates: [
      template(57, "Type-12", "L"),
      template(74, "Type-8a", "S"),
      template(40, "Natural White", "S", { role: "warehouse" }),
      template(80, "Type-10A", "L", { is_active: false }),
    ],
    bom_template_keys: [
      { template_id: 57, key: "L" },
      { template_id: 74, key: "S" },
    ],
    filling_template_placements: [placement(57, 67, 1), placement(57, 68, 2), placement(74, 69, 1)],
    items: [
      { id: 67, name: "6D S", subtype: "6D", size: "S", category: "filling" },
      { id: 68, name: "6D M", subtype: "6D", size: "M", category: "filling" },
      { id: 69, name: "3D S", subtype: "3D", size: "S", category: "filling" },
    ],
    customer_pillows: [],
  };
});

describe("a view-only role (customers, no customers-edit)", () => {
  beforeEach(() => signIn("crm-viewer"));

  it("cannot link or unlink, and nothing is written", async () => {
    expect((await put({ size: "S", fillingTemplateId: 74 })).status).toBe(403);
    h.db.customer_pillows = [{ customer_id: CUSTOMER, pillow_size: "M", filling_template_id: 74, linked_at: "2026-11-01T00:00:00Z" }];
    expect((await del()).status).toBe(403);
    expect(h.db.customer_pillows).toHaveLength(1);
    expect(h.audit).not.toHaveBeenCalled();
  });
});

describe.each(["crm-editor", "owner"])("a role with customers-edit (%s)", (roleId) => {
  beforeEach(() => signIn(roleId));

  it("links a size and template, which then wins over the fitting's match", async () => {
    const res = await put({ size: "S", fillingTemplateId: 74 });
    expect(res.status).toBe(200);
    const { pillow } = await res.json();
    expect(pillow).toMatchObject({
      source: "linked",
      size: "S",
      template: { id: 74, name: "Type-8a", keys: ["S"] },
      link: { linkedBy: "Mei" },
      fitting: { id: "f-2", label: "Mpillow S · T12 · S-LN" },
      match: { template: { id: 57 }, otherSize: true },
    });
    expect(pillow.placements).toHaveLength(1);
    expect(pillow.items.map((i: { id: number }) => i.id)).toEqual([69]);
    expect(pillow.templates.map((t: { id: number }) => t.id).sort()).toEqual([57, 74]);

    expect(h.db.customer_pillows).toEqual([
      expect.objectContaining({
        customer_id: CUSTOMER,
        pillow_size: "S",
        filling_template_id: 74,
        linked_by_user_id: `auth-${roleId}`,
        linked_by_profile_id: "p-mei",
      }),
    ]);
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "customer_pillow.link",
        entityType: "customer",
        entityId: CUSTOMER,
        after: { pillow_size: "S", filling_template_id: 74 },
      }),
    );
  });

  it("replaces an earlier link rather than adding one", async () => {
    await put({ size: "S", fillingTemplateId: 74 });
    await put({ size: "L", fillingTemplateId: 57 });
    expect(h.db.customer_pillows).toHaveLength(1);
    expect(h.db.customer_pillows[0]).toMatchObject({ pillow_size: "L", filling_template_id: 57 });
  });

  it("links a size alone when the filling is not known", async () => {
    const { pillow } = await (await put({ size: "M", fillingTemplateId: null })).json();
    expect(pillow).toMatchObject({ source: "linked", size: "M", template: null, placements: [] });
  });

  it("refuses a template that is not an active pillow filling template", async () => {
    for (const id of [40, 80, 999]) {
      expect((await put({ size: "S", fillingTemplateId: id })).status).toBe(400);
    }
    expect((await put({ size: "XXL", fillingTemplateId: 74 })).status).toBe(400);
    expect(h.db.customer_pillows).toHaveLength(0);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("removes the link, going back to the fitting's match", async () => {
    h.db.customer_pillows = [{ customer_id: CUSTOMER, pillow_size: "M", filling_template_id: 74, linked_at: "2026-11-01T00:00:00Z" }];
    const res = await del();
    expect(res.status).toBe(200);
    const { pillow } = await res.json();
    expect(pillow).toMatchObject({ source: "fitting", size: "S", template: { id: 57, name: "Type-12" }, link: null });
    expect(pillow.placements).toHaveLength(2);
    expect(h.db.customer_pillows).toHaveLength(0);
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "customer_pillow.unlink", entityId: CUSTOMER }));
  });

  it("answers 404 for a Customer that does not exist", async () => {
    const other = { params: Promise.resolve({ id: "bbbbbbbb-0000-4000-8000-000000000009" }) };
    expect((await route.PUT(new Request(url, { method: "PUT", body: "{}" }), other)).status).toBe(404);
  });
});

describe("a Customer with nothing on record", () => {
  beforeEach(() => signIn("crm-editor"));

  it("reads as no pillow once the link is removed and there is no fitting", async () => {
    h.db.customer_fittings = [];
    const { pillow } = await (await del()).json();
    expect(pillow).toMatchObject({ source: "none", size: null, template: null, fitting: null, match: null });
  });
});
