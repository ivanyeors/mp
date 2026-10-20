import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AftercareFakeDb } from "@/lib/aftercare/__tests__/fake-db";

/**
 * Staff's manual switch (CRM slice 13): a view-only role sees the switches and
 * their history and cannot change them; a role with customers-edit changes
 * them, each change writing the column, one event and an audit row; turning
 * WhatsApp on needs a note.
 */

const h = vi.hoisted(() => ({
  db: {} as AftercareFakeDb,
  identity: null as { id: string; email: string } | null,
  audit: vi.fn(),
  workingAs: null as { id: string; name: string } | null,
}));

vi.mock("@/lib/auth/user", () => ({
  getAuthUser: () => Promise.resolve(h.identity),
  getAuthIdentity: () => Promise.resolve(h.identity),
}));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeAftercareDb, setAftercarePreferenceRpc } = await import("@/lib/aftercare/__tests__/fake-db");
  return { supabaseAdmin: () => fakeAftercareDb(h.db, { set_aftercare_preference: setAftercarePreferenceRpc }) };
});
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: h.audit }));
vi.mock("@/lib/staff/working-as", () => ({ getWorkingAs: () => Promise.resolve(h.workingAs) }));

const route = await import("../[id]/aftercare/route");

const role = (id: string, permissions: string[], grantsAll = false) => ({
  id,
  key: id,
  name: id,
  grants_all: grantsAll,
  permissions,
});

const signIn = (roleId: string) => {
  h.identity = { id: `auth-${roleId}`, email: `${roleId}@x.test` };
  h.db.admin_users = [{ id: `m-${roleId}`, email: `${roleId}@x.test`, role_id: roleId, is_active: true, auth_user_id: `auth-${roleId}` }];
};

const ctx = { params: Promise.resolve({ id: "c1" }) };
const get = () => route.GET(new Request("https://x.test/api/shop/customers/c1/aftercare"), ctx);
const post = (body: unknown) =>
  route.POST(
    new Request("https://x.test/api/shop/customers/c1/aftercare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    ctx,
  );

beforeEach(() => {
  h.audit.mockReset();
  h.workingAs = { id: "p-mei", name: "Mei" };
  h.db = {
    admin_roles: [
      role("owner", [], true),
      role("crm-editor", ["customers", "customers-edit"]),
      role("crm-viewer", ["customers"]),
      role("orders-only", ["orders"]),
    ],
    admin_users: [],
    customers: [{ id: "c1", phone: "91234567", aftercare_email: true, aftercare_whatsapp: false }],
    customer_preference_events: [
      {
        customer_id: "c1",
        preference: "aftercare_email",
        to_value: true,
        source: "profile",
        changed_by_profile_id: null,
        note: null,
        wording: null,
        created_at: "2026-10-01T00:00:00Z",
      },
    ],
    whatsapp_inbound: [],
    customer_whatsapp: [],
    mp_staff: [{ id: "p-mei", name: "Mei" }],
  };
});

describe("a view-only role (customers, no customers-edit)", () => {
  beforeEach(() => signIn("crm-viewer"));

  it("sees the switches and their history", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const { view } = await res.json();
    expect(view.email.on).toBe(true);
    expect(view.whatsapp.on).toBe(false);
    expect(view.history).toHaveLength(1);
  });

  it("cannot change them, and nothing is written", async () => {
    expect((await post({ preference: "aftercare_email", value: false })).status).toBe(403);
    expect(h.db.customers[0].aftercare_email).toBe(true);
    expect(h.db.customer_preference_events).toHaveLength(1);
    expect(h.audit).not.toHaveBeenCalled();
  });
});

describe("a role without customers", () => {
  beforeEach(() => signIn("orders-only"));

  it("can neither see nor change them", async () => {
    expect((await get()).status).toBe(403);
    expect((await post({ preference: "aftercare_email", value: false })).status).toBe(403);
  });
});

describe.each(["crm-editor", "owner"])("a role with customers-edit (%s)", (roleId) => {
  beforeEach(() => signIn(roleId));

  it("switches email off with an optional note: the column, one event, one audit row", async () => {
    const res = await post({ preference: "aftercare_email", value: false, note: "asked by email reply" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, changed: true, view: { email: { on: false } } });

    expect(h.db.customers[0].aftercare_email).toBe(false);
    expect(h.db.customer_preference_events).toHaveLength(2);
    expect(h.db.customer_preference_events[1]).toMatchObject({
      preference: "aftercare_email",
      to_value: false,
      source: "staff",
      changed_by_profile_id: "p-mei",
      note: "asked by email reply",
    });
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "customer.aftercare_preference",
        entityType: "customer",
        entityId: "c1",
        before: { aftercare_email: true },
        after: { aftercare_email: false, note: "asked by email reply" },
      }),
    );
  });

  it("writes nothing for a change to the same value", async () => {
    const res = await post({ preference: "aftercare_email", value: true });
    expect(await res.json()).toMatchObject({ ok: true, changed: false });
    expect(h.db.customer_preference_events).toHaveLength(1);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("needs a note to turn WhatsApp on", async () => {
    for (const body of [
      { preference: "aftercare_whatsapp", value: true },
      { preference: "aftercare_whatsapp", value: true, note: "   " },
    ]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/how and when the customer agreed/);
    }
    expect(h.db.customers[0].aftercare_whatsapp).toBe(false);
    expect(h.db.customer_preference_events).toHaveLength(1);

    const note = "agreed at the studio on 20 Oct to the review request and the paid yearly check-up";
    expect((await post({ preference: "aftercare_whatsapp", value: true, note })).status).toBe(200);
    expect(h.db.customers[0].aftercare_whatsapp).toBe(true);
    expect(h.db.customer_preference_events[1]).toMatchObject({ preference: "aftercare_whatsapp", to_value: true, note });
  });

  it("refuses a note over 300 characters", async () => {
    expect((await post({ preference: "aftercare_email", value: false, note: "x".repeat(301) })).status).toBe(400);
  });
});
