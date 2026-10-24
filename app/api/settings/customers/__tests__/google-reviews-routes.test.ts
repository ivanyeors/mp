import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * Customers → Reviews (CRM slice 12): seeing Google reviews to match needs
 * `customers`; *Link*, *Not them* and *Unlink* need `customers-edit`. A
 * review is linked to at most one Customer: a second link is refused with the
 * current one shown. Every action is audited with ids, never the review's
 * text. Real permission checks through the shared fake admin; the SQL
 * functions are faked in memory (lib/crm/__tests__/google-review-fake.ts).
 */

const h = vi.hoisted(() => ({ db: {} as FakeDb, identity: null as { id: string; email: string } | null }));

vi.mock("@/lib/auth/user", () => ({
  getAuthUser: () => Promise.resolve(h.identity),
  getAuthIdentity: () => Promise.resolve(h.identity),
}));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeReviewsAdmin } = await import("@/lib/crm/__tests__/google-review-fake");
  return { supabaseAdmin: () => fakeReviewsAdmin(h.db) };
});

const list = await import("../google-reviews/route");
const link = await import("../google-reviews/[reviewId]/link/route");
const rejections = await import("../google-reviews/[reviewId]/rejections/route");
const card = await import("../../../shop/customers/[id]/reviews/route");

const JANE = "c0000000-0000-4000-8000-000000000001";
const BOB = "c0000000-0000-4000-8000-000000000004";
const R_JANE = "e0000000-0000-4000-8000-000000000001";
const R_OTHER = "e0000000-0000-4000-8000-000000000002";
const PROFILE = "11111111-1111-4111-8111-111111111111";
const COMMENT = "Great pillow, slept well. My neck thanks you.";

const role = (id: string, permissions: string[], grantsAll = false) => ({
  id,
  key: id,
  name: id,
  is_system: grantsAll,
  grants_all: grantsAll,
  permissions,
});

const signIn = (roleId: string) => {
  h.identity = { id: `auth-${roleId}`, email: `${roleId}@x.test` };
  h.db.admin_users = [
    { id: `m-${roleId}`, email: `${roleId}@x.test`, role_id: roleId, is_active: true, auth_user_id: `auth-${roleId}` },
  ];
  // One profile under the login: it is who linked.
  h.db.mp_staff = [{ id: PROFILE, name: "Jess", admin_user_id: `m-${roleId}`, archived_at: null }];
};

const json = (method: string, body: unknown) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const params = (reviewId: string) => ({ params: Promise.resolve({ reviewId }) });
const postLink = (reviewId: string, body: unknown) =>
  link.POST(new Request(`https://x.test/api/settings/customers/google-reviews/${reviewId}/link`, json("POST", body)), params(reviewId));
const deleteLink = (reviewId: string, body: unknown) =>
  link.DELETE(new Request(`https://x.test/api/settings/customers/google-reviews/${reviewId}/link`, json("DELETE", body)), params(reviewId));
const postReject = (reviewId: string, body: unknown) =>
  rejections.POST(
    new Request(`https://x.test/api/settings/customers/google-reviews/${reviewId}/rejections`, json("POST", body)),
    params(reviewId),
  );
const getList = (query = "") => list.GET(new Request(`https://x.test/api/settings/customers/google-reviews${query}`));
const getCard = (id: string) =>
  card.GET(new Request(`https://x.test/api/shop/customers/${id}/reviews`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  delete process.env.ADMIN_BOOTSTRAP_EMAILS;
  h.db = {
    admin_roles: [
      role("owner", [], true),
      role("crm-editor", ["customers", "customers-edit"]),
      role("crm-viewer", ["customers"]),
      role("orders-only", ["orders"]),
    ],
    admin_users: [],
    admin_audit_log: [],
    customers: [
      { id: JANE, first_name: "Jane", last_name: "Tan", email: "jane@x.test" },
      { id: BOB, first_name: "Bob", last_name: "Lee", email: "bob@x.test" },
    ],
    google_reviews: [
      { id: R_JANE, star_rating: 5, comment: COMMENT, reviewer_name: "Jane T.", review_created_at: "2026-11-03T02:00:00.000Z", status: "pending" },
      { id: R_OTHER, star_rating: 4, comment: null, reviewer_name: "Walk In", review_created_at: "2026-10-01T02:00:00.000Z", status: "backlog" },
    ],
    match_candidates: [
      { google_review_id: R_JANE, customer_id: JANE, first_name: "Jane", last_name: "Tan", email: "jane@x.test", asked_at: "2026-10-25T02:00:00.000Z", clicked_at: null, delivered_at: null },
    ],
    customer_google_reviews: [],
    customer_google_review_rejections: [],
    product_reviews: [],
    customer_review_requests: [],
    customer_emails: [],
    customer_whatsapp: [],
  };
});

describe("seeing matches needs customers", () => {
  it("lists the reviews to match for a view-only role", async () => {
    signIn("crm-viewer");
    const res = await getList();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      scope: "to-match",
      counts: { toMatch: 1, unlinked: 2 },
      rows: [{ review: { id: R_JANE }, suggestions: [{ customerId: JANE, reason: "first name and initial; asked 9 days before" }] }],
    });
    expect(await (await getList("?scope=unlinked")).json()).toMatchObject({ scope: "unlinked", total: 2 });
    expect((await getCard(JANE)).status).toBe(200);
  });

  it("refuses a role without customers", async () => {
    signIn("orders-only");
    expect((await getList()).status).toBe(403);
    expect((await getCard(JANE)).status).toBe(403);
  });
});

describe("linking, unlinking and Not them need customers-edit", () => {
  it.each([
    ["link", () => postLink(R_JANE, { customerId: JANE, how: "suggestion" })],
    ["unlink", () => deleteLink(R_JANE, { customerId: JANE })],
    ["not them", () => postReject(R_JANE, { customerId: JANE })],
  ])("%s is refused for a view-only role, and changes nothing", async (_name, call) => {
    signIn("crm-viewer");
    expect((await call()).status).toBe(403);
    expect(h.db.customer_google_reviews).toEqual([]);
    expect(h.db.customer_google_review_rejections).toEqual([]);
  });

  it("links on a Staff action, as the profile they work as, and audits ids only", async () => {
    signIn("crm-editor");
    const res = await postLink(R_JANE, { customerId: JANE, how: "suggestion" });
    expect(res.status).toBe(201);
    expect(h.db.customer_google_reviews).toEqual([
      expect.objectContaining({ google_review_id: R_JANE, customer_id: JANE, how: "suggestion", linked_by_profile_id: PROFILE }),
    ]);
    expect(h.db.admin_audit_log).toEqual([
      expect.objectContaining({
        action: "customer_google_review.link",
        entity_type: "google_review",
        entity_id: R_JANE,
        after: { customer_id: JANE, how: "suggestion" },
      }),
    ]);
    expect(JSON.stringify(h.db.admin_audit_log)).not.toContain("slept");
    // Gone from the list once linked, and on the Customer's card.
    expect(await (await getList()).json()).toMatchObject({ counts: { toMatch: 0, unlinked: 1 } });
    expect(await (await getCard(JANE)).json()).toMatchObject({ google: [{ id: R_JANE, linkedBy: "Jess", comment: COMMENT }] });
  });

  it("refuses a second link with the current one shown, whoever asks", async () => {
    signIn("owner");
    expect((await postLink(R_JANE, { customerId: JANE, how: "suggestion" })).status).toBe(201);
    const again = await postLink(R_JANE, { customerId: BOB, how: "manual" });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({
      current: { customerId: JANE, name: "Jane Tan", email: "jane@x.test" },
    });
    expect(h.db.customer_google_reviews).toHaveLength(1);
    expect(h.db.admin_audit_log!.map((r) => r.action)).toEqual(["customer_google_review.link"]);
  });

  it("links by hand to a Customer we never asked", async () => {
    signIn("crm-editor");
    expect((await postLink(R_OTHER, { customerId: BOB, how: "manual" })).status).toBe(201);
    expect(h.db.customer_google_reviews).toEqual([expect.objectContaining({ google_review_id: R_OTHER, customer_id: BOB, how: "manual" })]);
  });

  it("records Not them, never suggests the pair again, and refuses it for a linked pair", async () => {
    signIn("crm-editor");
    expect((await postReject(R_JANE, { customerId: JANE })).status).toBe(201);
    expect(await (await getList()).json()).toMatchObject({ counts: { toMatch: 0 } });
    expect(h.db.admin_audit_log!.map((r) => [r.action, r.after])).toEqual([["customer_google_review.reject", { customer_id: JANE }]]);

    expect((await postLink(R_OTHER, { customerId: BOB, how: "manual" })).status).toBe(201);
    expect((await postReject(R_OTHER, { customerId: BOB })).status).toBe(409);
  });

  it("unlinks, records the pair as Not them, and says when there is no such link", async () => {
    signIn("crm-editor");
    await postLink(R_JANE, { customerId: JANE, how: "suggestion" });
    expect((await deleteLink(R_JANE, { customerId: BOB })).status).toBe(404);
    const res = await deleteLink(R_JANE, { customerId: JANE });
    expect(res.status).toBe(200);
    expect(h.db.customer_google_reviews).toEqual([]);
    expect(h.db.customer_google_review_rejections).toEqual([
      expect.objectContaining({ google_review_id: R_JANE, customer_id: JANE, rejected_by_profile_id: PROFILE }),
    ]);
    expect(h.db.admin_audit_log!.map((r) => r.action)).toEqual(["customer_google_review.link", "customer_google_review.unlink"]);
  });

  it("refuses a bad body, an unknown review or customer", async () => {
    signIn("crm-editor");
    expect((await postLink(R_JANE, { customerId: JANE, how: "automatic" })).status).toBe(400);
    expect((await postLink(R_JANE, { customerId: "nope", how: "manual" })).status).toBe(400);
    expect((await postLink("not-a-uuid", { customerId: JANE, how: "manual" })).status).toBe(404);
    expect((await postLink("e0000000-0000-4000-8000-0000000000ff", { customerId: JANE, how: "manual" })).status).toBe(404);
    expect(h.db.customer_google_reviews).toEqual([]);
    expect(h.db.admin_audit_log).toEqual([]);
  });
});
