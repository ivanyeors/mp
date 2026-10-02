import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { createFakeSupabase } from "@/lib/reviews/__tests__/fake-supabase";
import { hashLinkCode } from "@/lib/telegram/link-codes";

/**
 * Staff Management → Telegram access API. Owners/admins only (`staff`), every
 * change audited, and a link code is returned once while only its hash is kept.
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

const ADMIN = { userId: "u1", email: "sg@mpillow.com", role: "owner", isBootstrap: false };
const OP_ID = "6b6b6b6b-1111-4222-8333-444455556666";
const json = (body: unknown, method = "POST") =>
  new Request("http://x/api/staff/telegram-operators", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const params = (id = OP_ID) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  h.requireAdminContext.mockResolvedValue(ADMIN);
  h.tables = {
    telegram_operators: [
      {
        id: OP_ID,
        display_name: "Ivan",
        role: "review_manager",
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
  it("requires the staff permission on every method", async () => {
    h.requireAdminContext.mockRejectedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    expect((await collection.GET()).status).toBe(403);
    expect((await collection.POST(json({ display_name: "A", role: "review_manager" }))).status).toBe(403);
    expect((await item.PATCH(json({ is_active: false }, "PATCH"), params())).status).toBe(403);
    expect((await item.DELETE(json({}, "DELETE"), params())).status).toBe(403);
    expect(h.requireAdminContext).toHaveBeenCalledWith("staff");
    expect(h.tables.telegram_operators[0].is_active).toBe(true);
  });

  it("adds a person, returns their link code once, and stores only its hash", async () => {
    const res = await collection.POST(json({ display_name: "Nadia", role: "shop_moderator" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.linkCode).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(body.row).not.toHaveProperty("link_code_hash");

    const stored = h.tables.telegram_operators[1];
    expect(stored).toMatchObject({ display_name: "Nadia", role: "shop_moderator", created_by: "sg@mpillow.com" });
    expect(stored.link_code_hash).toBe(hashLinkCode(body.linkCode));
    expect(JSON.stringify(stored)).not.toContain(body.linkCode);
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "telegram_operator.create", actor: ADMIN }));
  });

  it("rejects an unknown role", async () => {
    expect((await collection.POST(json({ display_name: "X", role: "owner" }))).status).toBe(400);
  });

  it("never lists link code hashes", async () => {
    h.tables.telegram_operators[0].link_code_hash = "secret-hash";
    const body = await (await collection.GET()).json();
    expect(body.rows).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain("secret-hash");
  });

  it("changes role and status, issues a new code, unlinks, and removes — all audited", async () => {
    let res = await item.PATCH(json({ role: "shop_moderator", is_active: false }, "PATCH"), params());
    expect((await res.json()).row).toMatchObject({ role: "shop_moderator", is_active: false });

    res = await item.PATCH(json({ action: "new_link_code" }, "PATCH"), params());
    const issued = await res.json();
    expect(issued.linkCode).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(h.tables.telegram_operators[0].link_code_hash).toBe(hashLinkCode(issued.linkCode));

    res = await item.PATCH(json({ action: "unlink" }, "PATCH"), params());
    expect((await res.json()).row).toMatchObject({ telegram_user_id: null, telegram_username: null });

    expect((await item.DELETE(json({}, "DELETE"), params())).status).toBe(200);
    expect(h.tables.telegram_operators).toHaveLength(0);
    expect(h.audit.mock.calls.map((c) => c[0].action)).toEqual([
      "telegram_operator.update",
      "telegram_operator.new_link_code",
      "telegram_operator.unlink",
      "telegram_operator.delete",
    ]);
  });

  it("sends the Telegram preview for owners/admins only, and reports Telegram's answer", async () => {
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
