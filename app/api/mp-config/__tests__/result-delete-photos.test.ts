import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  after: vi.fn(),
  driveIds: vi.fn(),
  trash: vi.fn(),
  deleted: vi.fn(),
}));

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: h.after }));
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: async () => null, getAdminContext: async () => null }));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: async () => undefined }));
vi.mock("@/lib/results/pair-ending", () => ({
  companionLockReason: async () => null,
  loadEndingPlan: async () => null,
  cascadeEnding: async () => undefined,
  notifyCompanionRemoved: async () => undefined,
}));
vi.mock("@/lib/results/sizing-photo-drive", () => ({ sizingPhotoDriveIds: h.driveIds, trashSizingPhotoFiles: h.trash }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => {
    const b = {
      from: () => b,
      select: () => b,
      eq: () => b,
      maybeSingle: async () => ({ data: { id: ID, status: "draft", order_id: null, payment_intent_id: null }, error: null }),
      delete: () => ({ eq: h.deleted }),
    };
    return b;
  },
}));

const { DELETE } = await import("@/app/api/mp-config/responses/[id]/route");

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const del = () => DELETE(new Request(`https://x.test/api/mp-config/responses/${ID}`, { method: "DELETE" }) as never, { params: Promise.resolve({ id: ID }) });

beforeEach(() => {
  vi.clearAllMocks();
  h.driveIds.mockResolvedValue(["file-front", "file-side"]);
  h.deleted.mockResolvedValue({ error: null });
});

describe("DELETE /api/mp-config/responses/[id] and the Result's Sizing photos on Drive", () => {
  it("trashes the Result's photos on Drive once the Result is deleted", async () => {
    expect((await del()).status).toBe(200);
    expect(h.trash).not.toHaveBeenCalled();
    await h.after.mock.calls[0][0]();
    expect(h.trash).toHaveBeenCalledWith(["file-front", "file-side"]);
  });

  it("keeps the photos when the Result could not be deleted", async () => {
    h.deleted.mockResolvedValue({ error: { message: "db down" } });
    expect((await del()).status).toBe(500);
    expect(h.after).not.toHaveBeenCalled();
  });

  it("refuses to delete a Result whose photos it can't list, so none are left behind on Drive", async () => {
    h.driveIds.mockRejectedValue(new Error("db down"));
    expect((await del()).status).toBe(500);
    expect(h.deleted).not.toHaveBeenCalled();
  });
});
