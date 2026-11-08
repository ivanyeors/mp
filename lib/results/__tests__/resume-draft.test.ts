import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The continue link's loader (ADR 0050): it reopens a guest's own Mpillow
 * Draft for whoever holds its access token, and nothing else, so a stale or
 * forged link shows the ordinary configurator and learns nothing.
 */

const h = vi.hoisted(() => ({ row: null as Record<string, unknown> | null }));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => {
    const b = {
      from: () => b,
      select: () => b,
      eq: () => b,
      maybeSingle: async () => ({ data: h.row, error: null }),
    };
    return b;
  },
}));

const { loadResumeDraft } = await import("@/lib/results/resume-draft");

const ID = "3f2b8c1e-7d4a-4e9b-a1c2-5d6e7f8a9b0c";
const TOKEN = "9b8a7f6e-5d4c-4b3a-8f2e-1d0c9b8a7f6e";

beforeEach(() => {
  h.row = {
    id: ID,
    status: null,
    source: "online_customization",
    product_type: "pillow",
    data: { name: "Wei Ling", gender: "female", configurator: "basic", notes: "x" },
    customer_email: "wei@example.com",
    access_token: TOKEN,
  };
});

describe("loadResumeDraft", () => {
  it("reopens the Draft for its token, with its answers, email and configurator", async () => {
    await expect(loadResumeDraft(ID, TOKEN)).resolves.toEqual({
      id: ID,
      token: TOKEN,
      answers: { name: "Wei Ling", gender: "female" },
      email: "wei@example.com",
      configurator: "basic",
    });
  });

  it("refuses a wrong or missing token", async () => {
    await expect(loadResumeDraft(ID, "9b8a7f6e-0000-4b3a-8f2e-1d0c9b8a7f6e")).resolves.toBeNull();
    await expect(loadResumeDraft(ID, undefined)).resolves.toBeNull();
  });

  it("refuses an id that is not one", async () => {
    await expect(loadResumeDraft("not-a-uuid", TOKEN)).resolves.toBeNull();
    await expect(loadResumeDraft(undefined, TOKEN)).resolves.toBeNull();
  });

  it("refuses a Draft that no longer is one, an Mbolster and an Assisted customisation", async () => {
    for (const over of [{ status: "held" }, { status: "assigned" }, { product_type: "bolster" }, { source: "staff_assisted" }]) {
      h.row = { ...h.row!, ...over };
      await expect(loadResumeDraft(ID, TOKEN)).resolves.toBeNull();
    }
  });

  it("refuses a Draft that does not exist", async () => {
    h.row = null;
    await expect(loadResumeDraft(ID, TOKEN)).resolves.toBeNull();
  });
});
