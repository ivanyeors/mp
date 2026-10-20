import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * CRM 02: Customer notes and the Customer save path. Notes are written as the
 * signed-in login and the profile it works as, deleted softly by their author
 * or an Owner or Admin, and audited without their text. Saving a Customer
 * writes only what changed, accepts a cleared name, and is audited.
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

const notesRoute = await import("../[id]/notes/route");
const noteRoute = await import("../[id]/notes/[noteId]/route");
const customerRoute = await import("../[id]/route");

const CUSTOMER = "aaaaaaaa-0000-4000-8000-000000000001";
const NAMELESS = "aaaaaaaa-0000-4000-8000-000000000002";
const MISSING = "aaaaaaaa-0000-4000-8000-0000000000ff";
const STUDIO = "00000000-0000-4000-8000-0000000000b1"; // Owner login, two profiles
const CLERK = "00000000-0000-4000-8000-0000000000b2"; // Staff login, one profile
const VIEWER = "00000000-0000-4000-8000-0000000000b3"; // no customers key
const LOOKER = "00000000-0000-4000-8000-0000000000b4"; // customers, without customers-edit
const JESS = "11111111-1111-4111-8111-111111111111";
const KAI = "22222222-2222-4222-8222-222222222222";
const CLERK_PROFILE = "33333333-3333-4333-8333-333333333333";
const N_LEGACY = "cccccccc-0000-4000-8000-000000000001";
const N_CLERK = "cccccccc-0000-4000-8000-000000000002";
const N_OWNER = "cccccccc-0000-4000-8000-000000000003";
const N_GONE = "cccccccc-0000-4000-8000-000000000004";

const SECRET = "Prefers a firm fill; asked twice for a discount";

const req = (method: string, body?: unknown) =>
  new Request("https://x.test/api", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const listNotes = (id = CUSTOMER) => notesRoute.GET(req("GET"), { params: Promise.resolve({ id }) });
const addNote = (body: unknown, id = CUSTOMER) => notesRoute.POST(req("POST", body), { params: Promise.resolve({ id }) });
const deleteNote = (noteId: string, id = CUSTOMER) =>
  noteRoute.DELETE(req("DELETE"), { params: Promise.resolve({ id, noteId }) });
const patchCustomer = (body: unknown, id = CUSTOMER) =>
  customerRoute.PATCH(req("PATCH", body), { params: Promise.resolve({ id }) });

const signIn = (memberId: string | null) => {
  const m = h.db.admin_users.find((r) => r.id === memberId);
  h.identity = m ? { id: m.auth_user_id as string, email: m.email as string } : null;
};
const note = (id: string) => h.db.customer_notes.find((n) => n.id === id)!;

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
      { id: VIEWER, email: "viewer@x.test", role_id: "r-viewer", is_active: true, auth_user_id: "auth-viewer" },
      { id: LOOKER, email: "looker@x.test", role_id: "r-crm-viewer", is_active: true, auth_user_id: "auth-looker" },
    ],
    mp_staff: [
      { id: JESS, name: "Jess", admin_user_id: STUDIO, archived_at: null },
      { id: KAI, name: "Kai", admin_user_id: STUDIO, archived_at: null },
      { id: CLERK_PROFILE, name: "Wang Ying", admin_user_id: CLERK, archived_at: null },
    ],
    customers: [
      { id: CUSTOMER, email: "mei@x.test", first_name: "Mei", last_name: "Tan", phone: "+6591234567", locale: "en-US", tags: ["vip"], notes: "old box" },
      { id: NAMELESS, email: "anon@x.test", first_name: null, last_name: null, phone: null, locale: "en-US", tags: [], notes: null },
    ],
    customer_notes: [
      // Moved from customers.notes by the migration: no author.
      { id: N_LEGACY, customer_id: CUSTOMER, body: "old box", author_profile_id: null, author_user_id: null, created_at: "2026-03-04T05:06:07Z", deleted_at: null },
      { id: N_CLERK, customer_id: CUSTOMER, body: "Called about delivery", author_profile_id: CLERK_PROFILE, author_user_id: "auth-clerk", created_at: "2026-10-01T02:00:00Z", deleted_at: null },
      { id: N_OWNER, customer_id: CUSTOMER, body: "Owner's note", author_profile_id: null, author_user_id: "auth-studio", created_at: "2026-10-02T02:00:00Z", deleted_at: null },
      { id: N_GONE, customer_id: CUSTOMER, body: "Deleted", author_profile_id: JESS, author_user_id: "auth-studio", created_at: "2026-10-03T02:00:00Z", deleted_at: "2026-10-04T00:00:00Z" },
    ],
    admin_audit_log: [],
  };
});

describe("reading notes", () => {
  it("lists live notes newest first, the moved one last and authorless", async () => {
    signIn(CLERK);
    const res = await listNotes();
    expect(res.status).toBe(200);
    const { rows } = await res.json();
    expect(rows.map((r: { id: string }) => r.id)).toEqual([N_OWNER, N_CLERK, N_LEGACY]);
    expect(rows[0]).toMatchObject({ authorName: "studio@x.test", legacy: false });
    expect(rows[1]).toMatchObject({ authorName: "Wang Ying", authorUserId: "auth-clerk", legacy: false });
    expect(rows[2]).toMatchObject({ body: "old box", authorName: null, legacy: true, createdAt: "2026-03-04T05:06:07Z" });
  });

  it("needs the customers key", async () => {
    signIn(VIEWER);
    expect((await listNotes()).status).toBe(403);
    signIn(null);
    expect((await listNotes()).status).toBe(401);
  });
});

describe("adding a note", () => {
  it("writes it as the login and its only profile, and audits it without the text", async () => {
    signIn(CLERK);
    const res = await addNote({ body: `  ${SECRET}  ` });
    expect(res.status).toBe(201);
    const { row } = await res.json();
    expect(row).toMatchObject({ body: SECRET, authorName: "Wang Ying", authorUserId: "auth-clerk", legacy: false });
    expect(h.db.customer_notes.at(-1)).toMatchObject({
      customer_id: CUSTOMER,
      body: SECRET,
      author_profile_id: CLERK_PROFILE,
      author_user_id: "auth-clerk",
    });
    expect(h.db.admin_audit_log).toHaveLength(1);
    expect(h.db.admin_audit_log[0]).toMatchObject({
      action: "customer_note.create",
      entity_type: "customer_note",
      entity_id: row.id,
      actor_email: "clerk@x.test",
    });
    expect(JSON.stringify(h.db.admin_audit_log)).not.toContain("firm fill");
  });

  it("on a shared login, is written as the profile chosen under Working as", async () => {
    signIn(STUDIO);
    h.cookie = KAI;
    await addNote({ body: "Picked up in store" });
    expect(h.db.customer_notes.at(-1)).toMatchObject({ author_profile_id: KAI, author_user_id: "auth-studio" });
  });

  it("on a shared login with no profile chosen, names no profile but keeps the login", async () => {
    signIn(STUDIO);
    const { row } = await (await addNote({ body: "Picked up in store" })).json();
    expect(h.db.customer_notes.at(-1)).toMatchObject({ author_profile_id: null, author_user_id: "auth-studio" });
    expect(row.authorName).toBe("studio@x.test");
  });

  it("refuses an empty or over-long note, an unknown Customer, and a caller without the key", async () => {
    signIn(CLERK);
    expect((await addNote({ body: "   " })).status).toBe(400);
    expect((await addNote({ body: "x".repeat(5001) })).status).toBe(400);
    expect((await addNote({ body: "hi" }, MISSING)).status).toBe(404);
    expect((await addNote({ body: "hi" }, "not-a-uuid")).status).toBe(404);
    signIn(VIEWER);
    expect((await addNote({ body: "hi" })).status).toBe(403);
    expect(h.db.customer_notes).toHaveLength(4);
    expect(h.db.admin_audit_log).toHaveLength(0);
  });
});

describe("deleting a note", () => {
  it("lets the author delete their own, softly, and audits it without the text", async () => {
    signIn(CLERK);
    h.db.customer_notes.find((n) => n.id === N_CLERK)!.body = SECRET;
    expect((await deleteNote(N_CLERK)).status).toBe(200);
    expect(note(N_CLERK).deleted_at).toEqual(expect.any(String));
    expect(note(N_CLERK).deleted_by_profile_id).toBe(CLERK_PROFILE);
    expect(note(N_CLERK).body).toBe(SECRET); // kept: the deletion is soft
    expect(h.db.admin_audit_log[0]).toMatchObject({
      action: "customer_note.delete",
      entity_type: "customer_note",
      entity_id: N_CLERK,
    });
    expect(JSON.stringify(h.db.admin_audit_log)).not.toContain("firm fill");
    const { rows } = await (await listNotes()).json();
    expect(rows.map((r: { id: string }) => r.id)).not.toContain(N_CLERK);
  });

  it("refuses someone else's note to Staff, but an Owner may delete any", async () => {
    signIn(CLERK);
    expect((await deleteNote(N_OWNER)).status).toBe(403);
    expect((await deleteNote(N_LEGACY)).status).toBe(403);
    expect(note(N_OWNER).deleted_at).toBeNull();
    signIn(STUDIO);
    expect((await deleteNote(N_CLERK)).status).toBe(200);
    expect((await deleteNote(N_LEGACY)).status).toBe(200);
  });

  it("404s an already-deleted note, another Customer's note, and a bad id", async () => {
    signIn(STUDIO);
    expect((await deleteNote(N_GONE)).status).toBe(404);
    expect((await deleteNote(N_CLERK, NAMELESS)).status).toBe(404);
    expect((await deleteNote("nope")).status).toBe(404);
    expect(h.db.admin_audit_log).toHaveLength(0);
  });

  it("needs customers-edit", async () => {
    signIn(VIEWER);
    expect((await deleteNote(N_CLERK)).status).toBe(403);
    expect(note(N_CLERK).deleted_at).toBeNull();
  });
});

describe("view-only Customers (customers without customers-edit, CRM 10)", () => {
  it("reads the notes, and is refused every note write and the PATCH, changing nothing", async () => {
    signIn(LOOKER);
    expect((await listNotes()).status).toBe(200);
    expect((await addNote({ body: "hi" })).status).toBe(403);
    // Even a note their own login wrote is not theirs to delete without customers-edit.
    h.db.customer_notes.find((n) => n.id === N_CLERK)!.author_user_id = "auth-looker";
    expect((await deleteNote(N_CLERK)).status).toBe(403);
    expect((await patchCustomer({ first_name: "Changed" })).status).toBe(403);
    expect(h.db.customer_notes).toHaveLength(4);
    expect(note(N_CLERK).deleted_at).toBeNull();
    expect(h.db.customers[0].first_name).toBe("Mei");
    expect(h.db.admin_audit_log).toHaveLength(0);
  });
});

describe("saving a Customer (PATCH)", () => {
  it("saves a Customer with no name, and clears a name with null or an empty string", async () => {
    signIn(CLERK);
    expect((await patchCustomer({ tags: ["wholesale"] }, NAMELESS)).status).toBe(200);
    expect((await patchCustomer({ first_name: null, last_name: "" })).status).toBe(200);
    expect(h.db.customers[0]).toMatchObject({ first_name: null, last_name: null, phone: "+6591234567" });
  });

  it("writes and audits only the fields that changed", async () => {
    signIn(CLERK);
    const res = await patchCustomer({ first_name: "Mei", last_name: "Lim", phone: "+6591234567", tags: ["vip", "b2b"] });
    expect(res.status).toBe(200);
    expect(h.db.admin_audit_log).toEqual([
      expect.objectContaining({
        action: "customer.update",
        entity_type: "customer",
        entity_id: CUSTOMER,
        before: { last_name: "Tan", tags: ["vip"] },
        after: { last_name: "Lim", tags: ["vip", "b2b"] },
      }),
    ]);
  });

  it("does not write or audit when nothing changed", async () => {
    signIn(CLERK);
    expect((await patchCustomer({ first_name: " Mei " })).status).toBe(200);
    expect(h.db.admin_audit_log).toHaveLength(0);
  });

  it("refuses notes (retired) with a readable error, and an unknown Customer", async () => {
    signIn(CLERK);
    const res = await patchCustomer({ notes: "x" });
    expect(res.status).toBe(400);
    expect(typeof (await res.json()).error).toBe("string");
    expect(h.db.customers[0].notes).toBe("old box");
    expect((await patchCustomer({ first_name: "A" }, MISSING)).status).toBe(404);
  });
});
