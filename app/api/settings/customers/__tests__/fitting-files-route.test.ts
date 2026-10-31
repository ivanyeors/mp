import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * ADR 0039 f: a Fitting record's Drive photos are previewed through the
 * platform. The route serves a file only by its position on that Customer's
 * own Fitting record, to a viewer holding `customers`, and never keeps it.
 */

const h = vi.hoisted(() => ({
  db: {} as FakeDb,
  identity: null as { id: string; email: string } | null,
  meta: {} as Record<string, { mimeType: string; thumbnailLink: string | null; size: number | null; isFolder: boolean }>,
  denied: new Set<string>(),
  asked: [] as string[],
}));

vi.mock("@/lib/auth/user", () => ({
  getAuthUser: () => Promise.resolve(h.identity),
  getAuthIdentity: () => Promise.resolve(h.identity),
}));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});
vi.mock("@/lib/media-assets/drive", async () => {
  const real = await vi.importActual<typeof import("@/lib/media-assets/drive")>("@/lib/media-assets/drive");
  return {
    ...real,
    resolveUrl: async (id: string) => {
      h.asked.push(id);
      if (h.denied.has(id)) throw new real.DriveError("forbidden", "no access");
      const m = h.meta[id];
      if (!m) throw new real.DriveError("not_found", "missing");
      return { id, name: id, webViewLink: null, ...m };
    },
    downloadThumbnail: async (link: string | null) => (link ? PNG : null),
    downloadFile: async () => PNG,
  };
});

// A 1×1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const route = await import("../[id]/fittings/[fittingId]/files/[index]/route");

const MEI = "aaaaaaaa-0000-4000-8000-000000000001";
const KIM = "aaaaaaaa-0000-4000-8000-000000000002";
const FIT = "0e000000-0000-4000-8000-0000000000c1";
const OWNER = "00000000-0000-4000-8000-0000000000b1";
const NOBODY = "00000000-0000-4000-8000-0000000000b2";

beforeEach(() => {
  h.asked = [];
  h.denied = new Set(["1denieddenieddenied"]);
  h.meta = {
    "1backbackbackback": { mimeType: "image/jpeg", thumbnailLink: "https://lh3.example/t=s220", size: 1000, isFolder: false },
    "1formformformform": { mimeType: "application/pdf", thumbnailLink: null, size: 1000, isFolder: false },
  };
  h.db = {
    admin_roles: [
      { id: "r-crm", key: "crm", name: "CRM", grants_all: false, permissions: ["customers"] },
      { id: "r-none", key: "none", name: "None", grants_all: false, permissions: ["orders"] },
    ],
    admin_users: [
      { id: OWNER, email: "c@x.test", role_id: "r-crm", is_active: true, auth_user_id: "auth-c" },
      { id: NOBODY, email: "n@x.test", role_id: "r-none", is_active: true, auth_user_id: "auth-n" },
    ],
    customer_fittings: [
      {
        id: FIT,
        customer_id: MEI,
        drive_files: [
          { slot: "back_photo", file_id: "1backbackbackback" },
          { slot: "customisation_form", file_id: "1formformformform" },
          { slot: "side_photo", file_id: "1denieddenieddenied" },
        ],
      },
    ],
  };
});

const signIn = (memberId: string | null) => {
  const m = h.db.admin_users.find((r) => r.id === memberId);
  h.identity = m ? { id: m.auth_user_id as string, email: m.email as string } : null;
};

const get = (customer: string, index: string, size = "thumb") =>
  route.GET(new Request(`https://x.test/api/settings/customers/${customer}/fittings/${FIT}/files/${index}?size=${size}`), {
    params: Promise.resolve({ id: customer, fittingId: FIT, index }),
  });

describe("GET /api/settings/customers/[id]/fittings/[fittingId]/files/[index]", () => {
  it("needs a signed-in Staff member holding customers", async () => {
    signIn(null);
    expect((await get(MEI, "0")).status).toBe(401);
    signIn(NOBODY);
    expect((await get(MEI, "0")).status).toBe(403);
    expect(h.asked).toEqual([]);
  });

  it("serves the file at that position as a resized image that is never cached", async () => {
    signIn(OWNER);
    const res = await get(MEI, "0");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(h.asked).toEqual(["1backbackbackback"]);
    expect((await get(MEI, "0", "full")).headers.get("content-type")).toBe("image/webp");
  });

  it("gives a PDF in full, and says when Drive has no thumbnail of it", async () => {
    signIn(OWNER);
    expect((await get(MEI, "1")).status).toBe(415);
    const res = await get(MEI, "1", "full");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("serves nothing that is not on this Customer's own Fitting record", async () => {
    signIn(OWNER);
    expect((await get(KIM, "0")).status).toBe(404);
    expect((await get(MEI, "3")).status).toBe(404);
    expect((await get(MEI, "1abc")).status).toBe(404);
    expect((await get("not-a-uuid", "0")).status).toBe(404);
    expect(h.asked).toEqual([]);
  });

  it("passes on Drive's refusal, so the card links to Drive instead", async () => {
    signIn(OWNER);
    const res = await get(MEI, "2");
    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});
