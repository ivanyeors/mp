import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AftercareFakeDb } from "@/lib/aftercare/__tests__/fake-db";

/**
 * Marketing consent on the Customer page (migration slice 07): Staff with
 * `customers` read the state, its source and date and every change; only
 * `customers-edit` may record a support request to unsubscribe, which writes
 * one event with source `support` and an audit row. Nothing here subscribes
 * anyone.
 */

const h = vi.hoisted(() => ({
  db: {} as AftercareFakeDb,
  identity: null as { id: string; email: string } | null,
  audit: vi.fn(),
}));

vi.mock("@/lib/auth/user", () => ({
  getAuthUser: () => Promise.resolve(h.identity),
  getAuthIdentity: () => Promise.resolve(h.identity),
}));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeAftercareDb } = await import("@/lib/aftercare/__tests__/fake-db");
  const { setMarketingEmailRpc } = await import("@/lib/marketing-consent/__tests__/fake-consent");
  return { supabaseAdmin: () => fakeAftercareDb(h.db, { set_marketing_email: setMarketingEmailRpc }) };
});
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: h.audit }));
vi.mock("@/lib/staff/working-as", () => ({ getWorkingAs: () => Promise.resolve(null) }));

const route = await import("../[id]/marketing-consent/route");

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
const URL_ = "https://x.test/api/shop/customers/c1/marketing-consent";
const get = () => route.GET(new Request(URL_), ctx);
const post = (body: unknown) =>
  route.POST(
    new Request(URL_, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    ctx,
  );

beforeEach(() => {
  h.audit.mockReset();
  h.db = {
    admin_roles: [
      role("owner", [], true),
      role("crm-editor", ["customers", "customers-edit"]),
      role("crm-viewer", ["customers"]),
      role("orders-only", ["orders"]),
    ],
    admin_users: [],
    customers: [
      {
        id: "c1",
        marketing_email: "subscribed",
        marketing_email_source: "shopify_import",
        marketing_email_updated_at: "2026-10-14T16:00:00.000Z",
      },
    ],
    customer_consent_events: [
      {
        customer_id: "c1",
        channel: "email",
        from_state: "not_subscribed",
        to_state: "subscribed",
        source: "shopify_import",
        created_at: "2026-10-14T16:00:00.000Z",
      },
    ],
  };
});

describe("a view-only role (customers, no customers-edit)", () => {
  beforeEach(() => signIn("crm-viewer"));

  it("reads the state, its provenance and the history", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).view).toEqual({
      state: "subscribed",
      source: "shopify_import",
      updatedAt: "2026-10-14T16:00:00.000Z",
      history: [
        { fromState: "not_subscribed", toState: "subscribed", source: "shopify_import", createdAt: "2026-10-14T16:00:00.000Z" },
      ],
    });
  });

  it("cannot unsubscribe anyone", async () => {
    expect((await post({ action: "unsubscribe" })).status).toBe(403);
    expect(h.db.customers[0].marketing_email).toBe("subscribed");
    expect(h.db.customer_consent_events).toHaveLength(1);
  });
});

describe("a role without customers", () => {
  beforeEach(() => signIn("orders-only"));

  it("can neither read nor change it", async () => {
    expect((await get()).status).toBe(403);
    expect((await post({ action: "unsubscribe" })).status).toBe(403);
  });
});

describe.each(["crm-editor", "owner"])("a role with customers-edit (%s)", (roleId) => {
  beforeEach(() => signIn(roleId));

  it("records a support unsubscribe: the state, one event, one audit row", async () => {
    const res = await post({ action: "unsubscribe" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, changed: true, view: { state: "unsubscribed", source: "support" } });
    expect(h.db.customer_consent_events[1]).toMatchObject({
      from_state: "subscribed",
      to_state: "unsubscribed",
      source: "support",
    });
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "customer.marketing_unsubscribe", entityType: "customer", entityId: "c1" }),
    );
  });

  it("writes nothing for someone already unsubscribed", async () => {
    await post({ action: "unsubscribe" });
    h.audit.mockReset();
    expect(await (await post({ action: "unsubscribe" })).json()).toMatchObject({ ok: true, changed: false });
    expect(h.db.customer_consent_events).toHaveLength(2);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("has no way to subscribe anyone", async () => {
    Object.assign(h.db.customers[0], { marketing_email: "unsubscribed", marketing_email_source: "unsubscribe_link" });
    for (const body of [{ action: "subscribe" }, { action: "unsubscribe", to: "subscribed" }, { subscribed: true }, null]) {
      expect((await post(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(h.db.customers[0].marketing_email).toBe("unsubscribed");
    expect(h.db.customer_consent_events).toHaveLength(1);
  });

  it("answers 404 for a Customer that does not exist", async () => {
    h.db.customers = [];
    expect((await get()).status).toBe(404);
    expect((await post({ action: "unsubscribe" })).status).toBe(404);
  });
});
