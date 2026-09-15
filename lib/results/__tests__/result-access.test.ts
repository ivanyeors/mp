import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  requireAnyAdmin: vi.fn(),
  getAuthUser: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({ requireAnyAdmin: h.requireAnyAdmin }));
vi.mock("@/lib/auth/user", () => ({ getAuthUser: h.getAuthUser }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => {
    const b = {
      from: () => b,
      select: () => b,
      eq: () => b,
      maybeSingle: h.maybeSingle,
    };
    return b;
  },
}));

const { requireResultAccess } = await import("@/lib/results/access");

const TOKEN = "11111111-1111-4111-8111-111111111111";

/** A Result that has been through hold: it has a token and a live status. */
const live = {
  access_token: TOKEN,
  customer_id: null,
  customer_email: null,
  status: "held" as string | null,
  order_id: null as string | null,
};
/** A Draft Result created after tokens started being minted at create. */
const draft = { ...live, status: null };
/** A Draft Result that predates that change. */
const legacyDraft = { access_token: null, customer_id: null, customer_email: null, status: null, order_id: null };

const asStaff = () => h.requireAnyAdmin.mockResolvedValue(null);
const notStaff = () =>
  h.requireAnyAdmin.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

beforeEach(() => {
  vi.clearAllMocks();
  h.getAuthUser.mockResolvedValue(null);
  h.maybeSingle.mockResolvedValue({ data: null });
});

describe("requireResultAccess", () => {
  it("recognises Staff, whatever the row's state", async () => {
    asStaff();
    await expect(requireResultAccess(live, null)).resolves.toEqual({ ok: true, mode: "staff" });
  });

  it("lets Staff write a live Result even under draftOnly", async () => {
    asStaff();
    await expect(requireResultAccess(live, null, { draftOnly: true })).resolves.toEqual({
      ok: true,
      mode: "staff",
    });
  });

  it("asks for exactly the Staff permissions a caller narrows it to", async () => {
    notStaff();
    await requireResultAccess(live, null, { staffPermissions: ["results"] });
    expect(h.requireAnyAdmin).toHaveBeenCalledWith(["results"]);
  });

  it("recognises an Owner holding the token", async () => {
    notStaff();
    await expect(requireResultAccess(draft, TOKEN)).resolves.toEqual({ ok: true, mode: "owner" });
  });

  it("recognises a signed-in Customer matching the row", async () => {
    notStaff();
    h.getAuthUser.mockResolvedValue({ id: "auth-1" });
    h.maybeSingle.mockResolvedValue({ data: { id: "cust-1", email: "a@b.test" } });
    await expect(
      requireResultAccess({ ...draft, customer_id: "cust-1" }, null),
    ).resolves.toEqual({ ok: true, mode: "owner" });
  });

  // The attack this whole initiative exists to stop.
  it("refuses a stranger holding only the Result id", async () => {
    notStaff();
    const access = await requireResultAccess(live, null);
    expect(access.ok).toBe(false);
    if (!access.ok) expect(access.response.status).toBe(403);
  });

  it("refuses a wrong token", async () => {
    notStaff();
    const access = await requireResultAccess(draft, "22222222-2222-4222-8222-222222222222");
    expect(access.ok).toBe(false);
  });

  it("refuses an Owner writing a Result that has left draft", async () => {
    notStaff();
    const access = await requireResultAccess(live, TOKEN, { draftOnly: true });
    expect(access.ok).toBe(false);
    if (!access.ok) expect(access.response.status).toBe(403);
  });

  it("still lets that Owner read it", async () => {
    notStaff();
    await expect(requireResultAccess(live, TOKEN)).resolves.toEqual({ ok: true, mode: "owner" });
  });

  describe("legacy drafts (pre-token, no status)", () => {
    it("stay open so a pre-deploy browser tab keeps saving", async () => {
      notStaff();
      await expect(requireResultAccess(legacyDraft, null, { draftOnly: true })).resolves.toEqual({
        ok: true,
        mode: "owner",
      });
    });

    it("does not extend the allowance to a row with a status", async () => {
      notStaff();
      const access = await requireResultAccess({ ...legacyDraft, status: "held" }, null);
      expect(access.ok).toBe(false);
    });

    // Order sync and Staff create these tokenless and permanent — not Drafts.
    it("does not extend the allowance to an order-linked row", async () => {
      notStaff();
      const access = await requireResultAccess({ ...legacyDraft, order_id: "ord-1" }, null, {
        draftOnly: true,
      });
      expect(access.ok).toBe(false);
    });

    it("does not extend the allowance once a token exists", async () => {
      notStaff();
      const access = await requireResultAccess(draft, null);
      expect(access.ok).toBe(false);
    });
  });
});
