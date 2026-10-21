import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * CRM 06: a Customer's Follow-ups. Every Staff member with `customers` sees
 * them; creating, completing, reassigning and deleting need `customers-edit`.
 * The assignee is a Staff profile whose Member can close one, never a
 * view-only colleague, an archived profile or a deactivated login. Who created
 * or completed one is the profile the person works as. Audited with ids only.
 */

const h = vi.hoisted(() => ({
  db: {} as FakeDb,
  identity: null as { id: string; email: string } | null,
  cookie: undefined as string | undefined,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "mp_working_as" && h.cookie ? { value: h.cookie } : undefined) }),
}));
vi.mock("@/lib/auth/user", () => ({
  getAuthUser: () => Promise.resolve(h.identity),
  getAuthIdentity: () => Promise.resolve(h.identity),
}));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});

const listRoute = await import("../[id]/followups/route");
const itemRoute = await import("../[id]/followups/[followupId]/route");

const MEI = "aaaaaaaa-0000-4000-8000-000000000001";
const KIM = "aaaaaaaa-0000-4000-8000-000000000002";
const MISSING = "aaaaaaaa-0000-4000-8000-0000000000ff";

const STUDIO = "00000000-0000-4000-8000-0000000000b1"; // Owner, a shared login: Jess, Kai and an archived profile
const CLERK = "00000000-0000-4000-8000-0000000000b2"; // customers-edit, one profile
const LOOKER = "00000000-0000-4000-8000-0000000000b3"; // customers only: view-only
const GONE = "00000000-0000-4000-8000-0000000000b4"; // customers-edit, deactivated
const VIEWER = "00000000-0000-4000-8000-0000000000b5"; // no customers key

const JESS = "11111111-1111-4111-8111-000000000001";
const KAI = "11111111-1111-4111-8111-000000000002";
const LEFT = "11111111-1111-4111-8111-000000000003"; // archived
const WANG = "11111111-1111-4111-8111-000000000004";
const LEE = "11111111-1111-4111-8111-000000000005";
const GONE_P = "11111111-1111-4111-8111-000000000006";

const F_OPEN = "f0000000-0000-4000-8000-000000000001";
const F_ARCHIVED = "f0000000-0000-4000-8000-000000000002";
const F_DONE = "f0000000-0000-4000-8000-000000000003";
const F_KIM = "f0000000-0000-4000-8000-000000000004";

const TITLE = "Call Mrs Tan on Friday about her second pillow";

const req = (method: string, body?: unknown) =>
  new Request("https://x.test/api", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const list = (id = MEI) => listRoute.GET(req("GET"), { params: Promise.resolve({ id }) });
const create = (body: unknown, id = MEI) => listRoute.POST(req("POST", body), { params: Promise.resolve({ id }) });
const patch = (followupId: string, body: unknown, id = MEI) =>
  itemRoute.PATCH(req("PATCH", body), { params: Promise.resolve({ id, followupId }) });
const remove = (followupId: string, id = MEI) =>
  itemRoute.DELETE(req("DELETE"), { params: Promise.resolve({ id, followupId }) });

const signIn = (memberId: string | null, workingAs?: string) => {
  const m = h.db.admin_users.find((r) => r.id === memberId);
  h.identity = m ? { id: m.auth_user_id as string, email: m.email as string } : null;
  h.cookie = workingAs;
};
const row = (id: string) => h.db.customer_followups.find((f) => f.id === id);
const valid = { title: TITLE, dueOn: "2026-10-23", assignedToProfileId: JESS };

beforeEach(() => {
  delete process.env.ADMIN_BOOTSTRAP_EMAILS;
  h.cookie = undefined;
  h.db = {
    admin_roles: [
      { id: "r-owner", key: "owner", name: "Owner", grants_all: true, permissions: [] },
      { id: "r-staff", key: "staff", name: "Staff", grants_all: false, permissions: ["customers", "customers-edit", "orders"] },
      { id: "r-crm-viewer", key: "crm-viewer", name: "CRM viewer", grants_all: false, permissions: ["customers"] },
      { id: "r-viewer", key: "viewer", name: "Viewer", grants_all: false, permissions: ["orders"] },
    ],
    admin_users: [
      { id: STUDIO, email: "studio@x.test", role_id: "r-owner", is_active: true, auth_user_id: "auth-studio" },
      { id: CLERK, email: "clerk@x.test", role_id: "r-staff", is_active: true, auth_user_id: "auth-clerk" },
      { id: LOOKER, email: "looker@x.test", role_id: "r-crm-viewer", is_active: true, auth_user_id: "auth-looker" },
      { id: GONE, email: "gone@x.test", role_id: "r-staff", is_active: false, auth_user_id: "auth-gone" },
      { id: VIEWER, email: "viewer@x.test", role_id: "r-viewer", is_active: true, auth_user_id: "auth-viewer" },
    ],
    mp_staff: [
      { id: JESS, name: "Jess", admin_user_id: STUDIO, archived_at: null },
      { id: KAI, name: "Kai", admin_user_id: STUDIO, archived_at: null },
      { id: LEFT, name: "Ana", admin_user_id: STUDIO, archived_at: "2026-10-15T00:00:00Z" },
      { id: WANG, name: "Wang Ying", admin_user_id: CLERK, archived_at: null },
      { id: LEE, name: "Lee", admin_user_id: LOOKER, archived_at: null },
      { id: GONE_P, name: "Gone", admin_user_id: GONE, archived_at: null },
    ],
    customers: [
      { id: MEI, email: "mei@x.test", first_name: "Mei", last_name: "Tan" },
      { id: KIM, email: "kim@x.test", first_name: null, last_name: null },
    ],
    customer_followups: [
      { id: F_OPEN, customer_id: MEI, title: "Call about her second pillow", due_on: "2026-10-23", assigned_to_profile_id: JESS, created_by_profile_id: KAI, created_at: "2026-10-20T02:00:00Z", done_at: null, done_by_profile_id: null },
      { id: F_ARCHIVED, customer_id: MEI, title: "Send the fill sample", due_on: "2026-10-10", assigned_to_profile_id: LEFT, created_by_profile_id: null, created_at: "2026-10-01T02:00:00Z", done_at: null, done_by_profile_id: null },
      { id: F_DONE, customer_id: MEI, title: "Done one", due_on: "2026-10-01", assigned_to_profile_id: WANG, created_by_profile_id: WANG, created_at: "2026-09-25T02:00:00Z", done_at: "2026-10-02T03:00:00Z", done_by_profile_id: WANG },
      { id: F_KIM, customer_id: KIM, title: "Kim's", due_on: "2026-10-25", assigned_to_profile_id: KAI, created_by_profile_id: null, created_at: "2026-10-19T02:00:00Z", done_at: null, done_by_profile_id: null },
    ],
    admin_audit_log: [],
  };
});

type Json = Record<string, unknown> & {
  rows: { id: string; assignee: { id: string; name: string; archived: boolean }; doneBy: { name: string } | null }[];
  assignees: { id: string; name: string }[];
  me: { id: string; name: string } | null;
};

describe("seeing a Customer's follow-ups", () => {
  it("lists them open first by due date, and offers only profiles that can close one", async () => {
    signIn(CLERK);
    const res = await list();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Json;
    expect(body.rows.map((r) => r.id)).toEqual([F_ARCHIVED, F_OPEN, F_DONE]);
    expect(body.rows[0].assignee).toEqual({ id: LEFT, name: "Ana", archived: true });
    expect(body.rows[2].doneBy?.name).toBe("Wang Ying");
    expect(body.me).toEqual({ id: WANG, name: "Wang Ying" });
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Not Lee (view-only), not Gone (deactivated), not Ana (archived).
    expect(body.assignees).toEqual([
      { id: JESS, name: "Jess" },
      { id: KAI, name: "Kai" },
      { id: WANG, name: "Wang Ying" },
    ]);
  });

  it("needs customers", async () => {
    signIn(null);
    expect((await list()).status).toBe(401);
    signIn(VIEWER);
    expect((await list()).status).toBe(403);
  });
});

describe("a view-only role", () => {
  it("sees every follow-up and is offered no assignees", async () => {
    signIn(LOOKER);
    const body = (await (await list()).json()) as Json;
    expect(body.rows).toHaveLength(3);
    expect(body.assignees).toEqual([]);
  });

  it("cannot create, complete, reassign or delete one", async () => {
    signIn(LOOKER);
    const before = JSON.stringify(h.db.customer_followups);
    expect((await create(valid)).status).toBe(403);
    expect((await patch(F_OPEN, { done: true })).status).toBe(403);
    expect((await patch(F_ARCHIVED, { assignedToProfileId: JESS })).status).toBe(403);
    expect((await remove(F_OPEN)).status).toBe(403);
    expect(JSON.stringify(h.db.customer_followups)).toBe(before);
    expect(h.db.admin_audit_log).toEqual([]);
  });
});

describe("adding a follow-up", () => {
  it("is created by the login's only profile, and audited with ids, never the title", async () => {
    signIn(CLERK);
    const res = await create({ ...valid, title: `  ${TITLE}  ` });
    expect(res.status).toBe(201);
    const { row: created } = await res.json();
    expect(created).toMatchObject({ title: TITLE, dueOn: "2026-10-23", assignee: { id: JESS, name: "Jess", archived: false }, createdBy: { id: WANG, name: "Wang Ying" } });
    expect(h.db.customer_followups.at(-1)).toMatchObject({
      customer_id: MEI,
      title: TITLE,
      due_on: "2026-10-23",
      assigned_to_profile_id: JESS,
      created_by_profile_id: WANG,
    });
    expect(h.db.admin_audit_log).toHaveLength(1);
    expect(h.db.admin_audit_log[0]).toMatchObject({
      action: "customer_followup.create",
      entity_type: "customer_followup",
      entity_id: created.id,
      actor_email: "clerk@x.test",
      after: { customer_id: MEI, assigned_to_profile_id: JESS, due_on: "2026-10-23" },
    });
    expect(JSON.stringify(h.db.admin_audit_log)).not.toContain("pillow");
  });

  it("on a shared login, is created by the profile chosen under Working as, or by nobody", async () => {
    signIn(STUDIO);
    expect((await create(valid)).status).toBe(201);
    expect(h.db.customer_followups.at(-1)?.created_by_profile_id).toBeNull();
    signIn(STUDIO, KAI);
    expect((await create({ ...valid, assignedToProfileId: WANG })).status).toBe(201);
    expect(h.db.customer_followups.at(-1)).toMatchObject({ created_by_profile_id: KAI, assigned_to_profile_id: WANG });
    // Another login's profile in the cookie is ignored, never trusted.
    signIn(STUDIO, WANG);
    expect((await create(valid)).status).toBe(201);
    expect(h.db.customer_followups.at(-1)?.created_by_profile_id).toBeNull();
  });

  it("is never given to a view-only colleague, an archived profile, a deactivated login or a Member", async () => {
    signIn(STUDIO, JESS);
    for (const who of [LEE, LEFT, GONE_P, STUDIO]) {
      const res = await create({ ...valid, assignedToProfileId: who });
      expect(res.status, who).toBe(400);
    }
    expect(h.db.customer_followups).toHaveLength(4);
  });

  it("refuses a blank or long title, a day that does not exist, and a missing Customer", async () => {
    signIn(CLERK);
    expect((await create({ ...valid, title: "  " })).status).toBe(400);
    expect((await create({ ...valid, title: "x".repeat(201) })).status).toBe(400);
    expect((await create({ ...valid, dueOn: "2026-02-30" })).status).toBe(400);
    expect((await create(valid, MISSING)).status).toBe(404);
    expect((await create(valid, "not-a-uuid")).status).toBe(404);
    expect(h.db.customer_followups).toHaveLength(4);
  });
});

describe("completing a follow-up", () => {
  it("records who and when, once, and audits it without the title", async () => {
    signIn(CLERK);
    const res = await patch(F_OPEN, { done: true });
    expect(res.status).toBe(200);
    const { row: done } = await res.json();
    expect(done.doneBy).toEqual({ id: WANG, name: "Wang Ying" });
    expect(row(F_OPEN)).toMatchObject({ done_by_profile_id: WANG });
    expect(typeof row(F_OPEN)?.done_at).toBe("string");
    expect(h.db.admin_audit_log[0]).toMatchObject({
      action: "customer_followup.done",
      entity_id: F_OPEN,
      after: { customer_id: MEI, done_by_profile_id: WANG },
    });
    expect(JSON.stringify(h.db.admin_audit_log)).not.toContain("pillow");
    // A second click records nothing more.
    const doneAt = row(F_OPEN)?.done_at;
    expect((await patch(F_OPEN, { done: true })).status).toBe(409);
    expect(row(F_OPEN)?.done_at).toBe(doneAt);
    expect(h.db.admin_audit_log).toHaveLength(1);
  });

  it("is found only under its own Customer", async () => {
    signIn(CLERK);
    expect((await patch(F_KIM, { done: true })).status).toBe(404);
    expect(row(F_KIM)?.done_at).toBeNull();
    expect((await patch(F_OPEN, { done: false })).status).toBe(400);
  });
});

describe("reassigning", () => {
  it("moves an archived assignee's open follow-up to a live profile", async () => {
    signIn(STUDIO, JESS);
    const res = await patch(F_ARCHIVED, { assignedToProfileId: KAI });
    expect(res.status).toBe(200);
    expect((await res.json()).row.assignee).toEqual({ id: KAI, name: "Kai", archived: false });
    expect(row(F_ARCHIVED)?.assigned_to_profile_id).toBe(KAI);
    expect(h.db.admin_audit_log[0]).toMatchObject({
      action: "customer_followup.reassign",
      entity_id: F_ARCHIVED,
      actor_profile_id: JESS,
      before: { customer_id: MEI, assigned_to_profile_id: LEFT },
      after: { customer_id: MEI, assigned_to_profile_id: KAI },
    });
  });

  it("never to someone who cannot close it, and never once it is done", async () => {
    signIn(STUDIO, JESS);
    expect((await patch(F_ARCHIVED, { assignedToProfileId: LEE })).status).toBe(400);
    expect((await patch(F_ARCHIVED, { assignedToProfileId: GONE_P })).status).toBe(400);
    expect(row(F_ARCHIVED)?.assigned_to_profile_id).toBe(LEFT);
    expect((await patch(F_DONE, { assignedToProfileId: KAI })).status).toBe(409);
    expect(row(F_DONE)?.assigned_to_profile_id).toBe(WANG);
  });
});

describe("deleting", () => {
  it("removes it and audits its ids", async () => {
    signIn(CLERK);
    expect((await remove(F_OPEN)).status).toBe(200);
    expect(row(F_OPEN)).toBeUndefined();
    expect(h.db.admin_audit_log[0]).toMatchObject({
      action: "customer_followup.delete",
      entity_id: F_OPEN,
      before: { customer_id: MEI, assigned_to_profile_id: JESS, due_on: "2026-10-23", done_at: null },
    });
    expect(JSON.stringify(h.db.admin_audit_log)).not.toContain("pillow");
  });

  it("only under its own Customer", async () => {
    signIn(CLERK);
    expect((await remove(F_KIM)).status).toBe(404);
    expect(row(F_KIM)).toBeDefined();
    expect((await remove(F_OPEN, KIM)).status).toBe(404);
    expect(h.db.admin_audit_log).toEqual([]);
  });
});
