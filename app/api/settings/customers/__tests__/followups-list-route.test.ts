import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * CRM 06: the Customers page's Follow-ups tab (Mine, All, Overdue) and the
 * sidebar badge. *Mine* and the badge are the profile the person works as;
 * *All* and *Overdue* are everyone's, for every Staff member with `customers`.
 * *Overdue* is due before today in Singapore, so the clock is pinned either
 * side of midnight SGT.
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

const listRoute = await import("../followups/route");
const countsRoute = await import("../followup-counts/route");

const MEI = "aaaaaaaa-0000-4000-8000-000000000001";
const KIM = "aaaaaaaa-0000-4000-8000-000000000002";

const STUDIO = "00000000-0000-4000-8000-0000000000b1"; // shared login: Jess, Kai, archived Ana
const CLERK = "00000000-0000-4000-8000-0000000000b2"; // personal login: Wang Ying
const LOOKER = "00000000-0000-4000-8000-0000000000b3"; // customers only
const VIEWER = "00000000-0000-4000-8000-0000000000b5"; // no customers key

const JESS = "11111111-1111-4111-8111-000000000001"; // profile A
const KAI = "11111111-1111-4111-8111-000000000002"; // profile B
const LEFT = "11111111-1111-4111-8111-000000000003"; // archived
const WANG = "11111111-1111-4111-8111-000000000004";

/** 23:59:59 on Wednesday 21 October in Singapore; still the 21st in UTC an hour later. */
const LAST_SECOND_OF_21 = new Date("2026-10-21T15:59:59Z");
const MIDNIGHT_INTO_22 = new Date("2026-10-21T16:00:00Z");

const fu = (id: string, assignee: string, due_on: string, extra: Record<string, unknown> = {}) => ({
  id,
  customer_id: MEI,
  title: `Follow-up ${id}`,
  due_on,
  assigned_to_profile_id: assignee,
  created_by_profile_id: null,
  created_at: "2026-10-01T00:00:00Z",
  done_at: null,
  done_by_profile_id: null,
  ...extra,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(LAST_SECOND_OF_21);
  h.cookie = undefined;
  h.db = {
    admin_roles: [
      { id: "r-owner", key: "owner", name: "Owner", grants_all: true, permissions: [] },
      { id: "r-staff", key: "staff", name: "Staff", grants_all: false, permissions: ["customers", "customers-edit"] },
      { id: "r-crm-viewer", key: "crm-viewer", name: "CRM viewer", grants_all: false, permissions: ["customers"] },
      { id: "r-viewer", key: "viewer", name: "Viewer", grants_all: false, permissions: ["orders"] },
    ],
    admin_users: [
      { id: STUDIO, email: "studio@x.test", role_id: "r-owner", is_active: true, auth_user_id: "auth-studio" },
      { id: CLERK, email: "clerk@x.test", role_id: "r-staff", is_active: true, auth_user_id: "auth-clerk" },
      { id: LOOKER, email: "looker@x.test", role_id: "r-crm-viewer", is_active: true, auth_user_id: "auth-looker" },
      { id: VIEWER, email: "viewer@x.test", role_id: "r-viewer", is_active: true, auth_user_id: "auth-viewer" },
    ],
    mp_staff: [
      { id: JESS, name: "Jess", admin_user_id: STUDIO, archived_at: null },
      { id: KAI, name: "Kai", admin_user_id: STUDIO, archived_at: null },
      { id: LEFT, name: "Ana", admin_user_id: STUDIO, archived_at: "2026-10-15T00:00:00Z" },
      { id: WANG, name: "Wang Ying", admin_user_id: CLERK, archived_at: null },
    ],
    customers: [
      { id: MEI, email: "mei@x.test", first_name: "Mei", last_name: "Tan" },
      { id: KIM, email: "kim@x.test", first_name: null, last_name: null },
    ],
    customer_followups: [
      fu("a-today", JESS, "2026-10-21"),
      fu("a-overdue", JESS, "2026-10-20", { customer_id: KIM }),
      fu("a-later", JESS, "2026-10-25"),
      fu("a-done", JESS, "2026-10-01", { done_at: "2026-10-02T00:00:00Z", done_by_profile_id: JESS }),
      fu("b-today", KAI, "2026-10-21", { created_at: "2026-10-02T00:00:00Z" }),
      fu("left-overdue", LEFT, "2026-10-05"),
      fu("w-tomorrow", WANG, "2026-10-22"),
    ],
    admin_audit_log: [],
  };
});

afterEach(() => {
  vi.useRealTimers();
});

const signIn = (memberId: string | null, workingAs?: string) => {
  const m = h.db.admin_users.find((r) => r.id === memberId);
  h.identity = m ? { id: m.auth_user_id as string, email: m.email as string } : null;
  h.cookie = workingAs;
};

type ListBody = {
  scope: string;
  today: string;
  me: { id: string; name: string } | null;
  assignees: { id: string }[];
  rows: { id: string; customerName: string; assignee: { id: string; name: string; archived: boolean } }[];
};

async function scope(name: string) {
  const res = await listRoute.GET(new Request(`https://x.test/api/settings/customers/followups?scope=${name}`));
  expect(res.status).toBe(200);
  return (await res.json()) as ListBody;
}
const ids = async (name: string) => (await scope(name)).rows.map((r) => r.id);

async function badge() {
  const res = await countsRoute.GET();
  expect(res.status).toBe(200);
  return (await res.json()) as { profile: { id: string } | null; counts: { dueToday: number; overdue: number } | null };
}

describe("Mine and the badge follow the profile you work as", () => {
  it("a follow-up assigned to profile A is in A's Mine and badge, and not in B's", async () => {
    signIn(STUDIO, JESS);
    expect(await ids("mine")).toEqual(["a-overdue", "a-today", "a-later"]);
    expect((await badge()).counts).toEqual({ dueToday: 1, overdue: 1 });

    signIn(STUDIO, KAI);
    expect(await ids("mine")).toEqual(["b-today"]);
    expect((await badge()).counts).toEqual({ dueToday: 1, overdue: 0 });
  });

  it("a personal login's only profile is its own without choosing", async () => {
    signIn(CLERK);
    const body = await scope("mine");
    expect(body.me).toEqual({ id: WANG, name: "Wang Ying" });
    expect(body.rows.map((r) => r.id)).toEqual(["w-tomorrow"]);
    // Due tomorrow: nothing on the badge yet.
    expect(await badge()).toEqual({ ok: true, profile: { id: WANG, name: "Wang Ying" }, counts: { dueToday: 0, overdue: 0 } });
  });

  it("a shared login with nobody chosen has no Mine and no badge", async () => {
    signIn(STUDIO);
    const body = await scope("mine");
    expect(body.me).toBeNull();
    expect(body.rows).toEqual([]);
    expect(await badge()).toEqual({ ok: true, profile: null, counts: null });
  });
});

describe("All", () => {
  it("shows a view-only role everyone's open follow-ups, the archived assignee's included", async () => {
    signIn(LOOKER);
    const body = await scope("all");
    expect(body.rows.map((r) => r.id)).toEqual([
      "left-overdue",
      "a-overdue",
      "a-today",
      "b-today",
      "w-tomorrow",
      "a-later",
    ]);
    expect(body.rows[0].assignee).toEqual({ id: LEFT, name: "Ana", archived: true });
    expect(body.rows[0].customerName).toBe("Mei Tan");
    // A Customer with no name is shown by email.
    expect(body.rows[1].customerName).toBe("kim@x.test");
    // Nobody to reassign to without customers-edit.
    expect(body.assignees).toEqual([]);
  });

  it("offers an editor the profiles to reassign to", async () => {
    signIn(CLERK);
    expect((await scope("all")).assignees.map((p) => p.id)).toEqual([JESS, KAI, WANG]);
  });
});

describe("Overdue is due before today in Singapore", () => {
  it("at 23:59:59 SGT, today's follow-ups are not overdue yet", async () => {
    signIn(LOOKER);
    const body = await scope("overdue");
    expect(body.today).toBe("2026-10-21");
    expect(body.rows.map((r) => r.id)).toEqual(["left-overdue", "a-overdue"]);
  });

  it("from 00:00 SGT they are, though the UTC date has not changed", async () => {
    vi.setSystemTime(MIDNIGHT_INTO_22);
    signIn(LOOKER);
    const body = await scope("overdue");
    expect(body.today).toBe("2026-10-22");
    expect(body.rows.map((r) => r.id)).toEqual(["left-overdue", "a-overdue", "a-today", "b-today"]);

    signIn(STUDIO, JESS);
    expect((await badge()).counts).toEqual({ dueToday: 0, overdue: 2 });
    // Wang Ying's follow-up for the 22nd is now due today.
    signIn(CLERK);
    expect((await badge()).counts).toEqual({ dueToday: 1, overdue: 0 });
  });
});

describe("guards", () => {
  it("both need customers", async () => {
    signIn(null);
    expect((await listRoute.GET(new Request("https://x.test/x?scope=all"))).status).toBe(401);
    expect((await countsRoute.GET()).status).toBe(401);
    signIn(VIEWER);
    expect((await listRoute.GET(new Request("https://x.test/x?scope=all"))).status).toBe(403);
    expect((await countsRoute.GET()).status).toBe(403);
  });

  it("an unknown scope reads as Mine", async () => {
    signIn(STUDIO, KAI);
    expect((await scope("everyone")).scope).toBe("mine");
  });
});
