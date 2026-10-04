import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { createFakeSupabase } from "@/lib/reviews/__tests__/fake-supabase";
import { hashLinkCode } from "@/lib/telegram/link-codes";
import { ADMIN_PERMISSIONS } from "@/lib/auth/permissions";

/**
 * Users & permissions → Telegram API (slice 08). `users` only, every change
 * audited with before/after actions, a link code returned once while only its
 * hash is kept, and a link never granted more than its login's role allows.
 */

const h = vi.hoisted(() => ({
  db: null as unknown,
  tables: {} as Record<string, Record<string, unknown>[]>,
  requireAdminContext: vi.fn(),
  audit: vi.fn(),
  preview: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => h.db }));
vi.mock("@/lib/auth/admin", () => ({ requireAdminContext: h.requireAdminContext }));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: h.audit }));
vi.mock("@/lib/reviews/preview", () => ({ sendReviewCardPreview: h.preview }));

const collection = await import("@/app/api/staff/telegram-operators/route");
const item = await import("@/app/api/staff/telegram-operators/[id]/route");
const preview = await import("@/app/api/staff/telegram-operators/preview/route");

const OWNER = {
  memberId: "m-sg",
  userId: "u1",
  email: "sg@mpillow.com",
  roleKey: "owner",
  isOwner: true,
  grantsAll: true,
  permissions: new Set(ADMIN_PERMISSIONS),
  isBootstrap: false,
};
const LINK_ID = "6b6b6b6b-1111-4222-8333-444455556666";
const IVAN = "7a7a7a7a-1111-4222-8333-444455556666";
const JESS = "8a8a8a8a-1111-4222-8333-444455556666";
const SHOPPER = "9a9a9a9a-1111-4222-8333-444455556666";
const REPLY = "telegram.google-review-reply";
const MODERATE = "telegram.shop-review-moderate";

const json = (body: unknown, method = "POST") =>
  new Request("http://x/api/staff/telegram-operators", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const params = (id = LINK_ID) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  h.requireAdminContext.mockResolvedValue(OWNER);
  h.tables = {
    admin_roles: [
      { id: "r-owner", name: "Owner", grants_all: true, permissions: [] },
      { id: "r-shop", name: "Shop desk", grants_all: false, permissions: ["orders", MODERATE] },
    ],
    admin_users: [
      { id: "m-sg", email: "sg@mpillow.com", role_id: "r-owner", is_active: true },
      { id: "m-shop", email: "shop@x.test", role_id: "r-shop", is_active: true },
    ],
    mp_staff: [
      { id: IVAN, name: "Ivan", admin_user_id: "m-sg", archived_at: null },
      { id: JESS, name: "Jess", admin_user_id: "m-sg", archived_at: null },
      { id: SHOPPER, name: "Sam", admin_user_id: "m-shop", archived_at: null },
    ],
    telegram_operators: [
      {
        id: LINK_ID,
        staff_profile_id: IVAN,
        actions: [REPLY, MODERATE],
        is_active: true,
        telegram_user_id: 111,
        telegram_username: "ivan",
        linked_at: "2026-10-01T00:00:00Z",
        link_code_hash: null,
        link_code_expires_at: null,
        created_by: "sg@mpillow.com",
      },
    ],
  };
  h.db = createFakeSupabase(h.tables);
});

describe("Telegram access API", () => {
  it("requires the users permission on every method", async () => {
    h.requireAdminContext.mockRejectedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    expect((await collection.GET()).status).toBe(403);
    expect((await collection.POST(json({ staff_profile_id: JESS, actions: [] }))).status).toBe(403);
    expect((await item.PATCH(json({ is_active: false }, "PATCH"), params())).status).toBe(403);
    expect((await item.DELETE(json({}, "DELETE"), params())).status).toBe(403);
    expect(h.requireAdminContext).toHaveBeenCalledWith("users");
    expect(h.tables.telegram_operators[0].is_active).toBe(true);
  });

  it("links a profile, returns its code once, stores only the hash, and audits the actions", async () => {
    const res = await collection.POST(json({ staff_profile_id: JESS, actions: [MODERATE] }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.linkCode).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(body.row).not.toHaveProperty("link_code_hash");

    const stored = h.tables.telegram_operators[1];
    expect(stored).toMatchObject({ staff_profile_id: JESS, display_name: "Jess", actions: [MODERATE] });
    expect(stored.link_code_hash).toBe(hashLinkCode(body.linkCode));
    expect(JSON.stringify(stored)).not.toContain(body.linkCode);
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "telegram_link.create",
        entityType: "telegram_link",
        actor: OWNER,
        after: expect.objectContaining({ profile: "Jess", actions: [MODERATE] }),
      }),
    );
  });

  it("refuses a second link for one profile, an archived profile, and an unknown action", async () => {
    expect((await collection.POST(json({ staff_profile_id: IVAN, actions: [] }))).status).toBe(409);
    h.tables.mp_staff[1].archived_at = "2026-10-01T00:00:00Z";
    expect((await collection.POST(json({ staff_profile_id: JESS, actions: [] }))).status).toBe(400);
    expect((await collection.POST(json({ staff_profile_id: SHOPPER, actions: ["review_manager"] }))).status).toBe(400);
  });

  it("never grants an action the profile's login role lacks", async () => {
    const res = await collection.POST(json({ staff_profile_id: SHOPPER, actions: [REPLY] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Shop desk");
    expect((await collection.POST(json({ staff_profile_id: SHOPPER, actions: [MODERATE] }))).status).toBe(201);
  });

  it("a non-Owner/Admin cannot link a login whose role has actions they don't hold", async () => {
    h.requireAdminContext.mockResolvedValue({
      ...OWNER,
      isOwner: false,
      grantsAll: false,
      permissions: new Set(["users", "orders"]),
    });
    expect((await collection.POST(json({ staff_profile_id: SHOPPER, actions: [MODERATE] }))).status).toBe(403);
    h.requireAdminContext.mockResolvedValue({
      ...OWNER,
      isOwner: false,
      grantsAll: false,
      permissions: new Set(["users", "orders", MODERATE]),
    });
    expect((await collection.POST(json({ staff_profile_id: SHOPPER, actions: [MODERATE] }))).status).toBe(201);
  });

  describe("who may touch a link (review finding: link takeover)", () => {
    const peopleManager = {
      ...OWNER,
      memberId: "m-pm",
      isOwner: false,
      grantsAll: false,
      permissions: new Set(["users", "orders", MODERATE]),
    };

    it("a non-Owner with users cannot issue a code for, switch, unlink or remove an Owner login's link", async () => {
      h.requireAdminContext.mockResolvedValue(peopleManager);
      for (const body of [{ action: "new_link_code" }, { action: "unlink" }, { is_active: false }, { actions: [] }]) {
        const res = await item.PATCH(json(body, "PATCH"), params());
        expect(res.status, JSON.stringify(body)).toBe(403);
        expect(JSON.stringify(await res.json())).not.toContain("linkCode");
      }
      expect((await item.DELETE(json({}, "DELETE"), params())).status).toBe(403);
      expect(h.tables.telegram_operators[0]).toMatchObject({ telegram_user_id: 111, link_code_hash: null, is_active: true });
    });

    it("…nor link a profile under an Owner's login", async () => {
      h.requireAdminContext.mockResolvedValue(peopleManager);
      expect((await collection.POST(json({ staff_profile_id: JESS, actions: [] }))).status).toBe(403);
    });

    it("cannot reissue a code for a link that can do more than they can", async () => {
      // Sam's login role allows moderation; the manager holds it, so a code is fine…
      h.tables.telegram_operators.push({
        id: "5b5b5b5b-1111-4222-8333-444455556666",
        staff_profile_id: SHOPPER,
        actions: [MODERATE],
        is_active: true,
        telegram_user_id: 222,
      });
      h.requireAdminContext.mockResolvedValue(peopleManager);
      const ok = await item.PATCH(json({ action: "new_link_code" }, "PATCH"), params("5b5b5b5b-1111-4222-8333-444455556666"));
      expect(ok.status).toBe(200);
      // …but not for someone who lacks moderation themselves.
      h.requireAdminContext.mockResolvedValue({ ...peopleManager, permissions: new Set(["users", "orders"]) });
      const res = await item.PATCH(json({ action: "new_link_code" }, "PATCH"), params("5b5b5b5b-1111-4222-8333-444455556666"));
      expect(res.status).toBe(403);
    });

    it("counts an action the login's role doesn't grant today: it returns when the role is widened", async () => {
      h.tables.telegram_operators.push({
        id: "5b5b5b5b-1111-4222-8333-444455556666",
        staff_profile_id: SHOPPER,
        actions: [MODERATE, REPLY],
        is_active: true,
        telegram_user_id: 222,
      });
      h.requireAdminContext.mockResolvedValue(peopleManager);
      for (const body of [{ action: "new_link_code" }, { action: "unlink" }]) {
        const res = await item.PATCH(json(body, "PATCH"), params("5b5b5b5b-1111-4222-8333-444455556666"));
        expect(res.status, JSON.stringify(body)).toBe(403);
      }
      expect(h.tables.telegram_operators[1]).toMatchObject({ telegram_user_id: 222 });
    });
  });

  it("never lists link code hashes", async () => {
    h.tables.telegram_operators[0].link_code_hash = "secret-hash";
    const body = await (await collection.GET()).json();
    expect(body.rows).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain("secret-hash");
  });

  it("sets actions, switches off, issues a new code, unlinks, and removes — each audited", async () => {
    let res = await item.PATCH(json({ actions: [MODERATE] }, "PATCH"), params());
    expect((await res.json()).row).toMatchObject({ actions: [MODERATE] });

    res = await item.PATCH(json({ is_active: false }, "PATCH"), params());
    expect((await res.json()).row).toMatchObject({ is_active: false });

    res = await item.PATCH(json({ action: "new_link_code" }, "PATCH"), params());
    const issued = await res.json();
    expect(issued.linkCode).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(h.tables.telegram_operators[0].link_code_hash).toBe(hashLinkCode(issued.linkCode));

    res = await item.PATCH(json({ action: "unlink" }, "PATCH"), params());
    expect((await res.json()).row).toMatchObject({ telegram_user_id: null, telegram_username: null });

    expect((await item.DELETE(json({}, "DELETE"), params())).status).toBe(200);
    expect(h.tables.telegram_operators).toHaveLength(0);
    expect(h.audit.mock.calls.map((c) => c[0].action)).toEqual([
      "telegram_link.update",
      "telegram_link.turn_off",
      "telegram_link.new_link_code",
      "telegram_link.unlink",
      "telegram_link.delete",
    ]);
    expect(h.audit.mock.calls[0][0]).toMatchObject({
      before: { actions: [REPLY, MODERATE].sort() },
      after: { actions: [MODERATE] },
    });
  });

  it("refuses two changes in one request", async () => {
    expect((await item.PATCH(json({ is_active: false, actions: [] }, "PATCH"), params())).status).toBe(400);
  });

  it("sends the Telegram preview for users holders only, and reports Telegram's answer", async () => {
    h.preview.mockResolvedValueOnce({ ok: true, sent: 7, total: 7, usedClaude: true });
    let res = await preview.POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sent: 7, total: 7, usedClaude: true });
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "telegram_operator.preview" }));

    h.preview.mockResolvedValueOnce({ ok: false, sent: 0, total: 7, usedClaude: false, error: "TELEGRAM_BOT_TOKEN is not set" });
    res = await preview.POST();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("TELEGRAM_BOT_TOKEN is not set");

    h.requireAdminContext.mockRejectedValueOnce(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    expect((await preview.POST()).status).toBe(403);
    expect(h.preview).toHaveBeenCalledTimes(2);
  });

  it("404s an unknown or malformed id", async () => {
    expect((await item.PATCH(json({ is_active: false }, "PATCH"), params("nope"))).status).toBe(404);
    expect((await item.DELETE(json({}, "DELETE"), params("7c7c7c7c-1111-4222-8333-444455556666"))).status).toBe(404);
  });
});
