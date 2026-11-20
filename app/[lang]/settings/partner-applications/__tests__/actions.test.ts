import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applicantLogoFolder, partnerLogoFolder } from "@/lib/partner-upload/urls";

const ORIGIN = "https://proj.supabase.co";
const MEDIA = `${ORIGIN}/storage/v1/object/public/media/`;
const APPLICANT = "6b1f0c4e-2d3a-4b5c-8d9e-0f1a2b3c4d5e";
const OTHER_USER = "0c9d8e7f-6a5b-4c3d-9e2f-1a0b9c8d7e6f";
const SOME_PARTNER = "3f6c1d2e-8a4b-4c5d-9e7f-0a1b2c3d4e5f";
const ROW_ID = "pu-1";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  db: {} as Record<string, Record<string, unknown>[]>,
  afterRead: null as null | (() => void),
}));

vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return {
    supabaseAdmin: () => {
      const fake = fakeSupabaseAdmin(h.db);
      return {
        from: (table: string) => {
          const q = fake.from(table);
          if (table === "partner_users") {
            const read = q.maybeSingle;
            q.maybeSingle = async () => {
              const res = await read();
              const hook = h.afterRead;
              h.afterRead = null;
              hook?.();
              return res;
            };
          }
          return q;
        },
      };
    },
  };
});
vi.mock("@/lib/auth/admin", () => ({
  assertAdmin: vi.fn(async () => ({ userId: "staff-1", email: "staff@example.com", memberId: "m-1" })),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: vi.fn(async () => undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/cache/invalidate", () => ({ invalidateTag: vi.fn(), invalidateTags: vi.fn() }));
vi.mock("@/lib/referrals", () => ({ ensureReferralCode: vi.fn(async () => "ACME10") }));
vi.mock("@/lib/email/partner", () => ({
  dispatchPartnerEmail: vi.fn(async () => ({ sent: true })),
}));

const { approveApplication, rejectApplication } = await import("../actions");

const TERMS = { pool: 25, customerDiscount: true };

function questionnaire(over: Row = {}): Row {
  return {
    companyName: "Acme Physio",
    uen: "201812345A",
    website: "https://acme.example",
    category: "physio",
    contactName: "Jane Tan",
    contactMobile: "87805311",
    businessEmail: "jane@acme.example",
    introPlan: "We will recommend Mpillow to post-op clients.",
    description: "Sports and post-op physiotherapy in Tanjong Pagar.",
    logoUrl: `${MEDIA}${applicantLogoFolder(APPLICANT)}logo.webp`,
    ...over,
  };
}

function application(over: Row = {}, q: Row = {}): Row {
  return {
    id: ROW_ID,
    auth_user_id: APPLICANT,
    email: "jane@acme.example",
    partner_id: null,
    application_status: "pending",
    questionnaire: questionnaire(q),
    ...over,
  };
}

const partners = () => h.db.partners ?? [];
const applicationRow = () => (h.db.partner_users ?? []).find((r) => r.id === ROW_ID);

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ORIGIN);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  h.afterRead = null;
  h.db = { partner_users: [application()], partners: [] };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("approveApplication: the listing the applicant sent", () => {
  it("creates one partner row carrying their logo, trimmed write-up and website, linked and approved", async () => {
    h.db.partner_users = [application({}, { description: "  We treat necks and backs.\n\n  " })];

    await expect(approveApplication(ROW_ID, TERMS)).resolves.toEqual({ ok: true });

    expect(partners()).toHaveLength(1);
    const partner = partners()[0];
    expect(partner.logo_url).toBe(`${MEDIA}${applicantLogoFolder(APPLICANT)}logo.webp`);
    expect(partner.description).toBe("We treat necks and backs.");
    expect(String(partner.website_url)).toMatch(/^https:\/\/acme\.example\/?$/);
    expect(partner.name).toBe("Acme Physio");

    expect(applicationRow()).toMatchObject({ application_status: "approved", partner_id: partner.id });
  });

  it("publishes the listing when Staff do not say otherwise", async () => {
    await approveApplication(ROW_ID, TERMS);
    expect(partners()).toHaveLength(1);
    expect(partners()[0].visible).toBe(true);
  });

  it("publishes the listing with list: true", async () => {
    await approveApplication(ROW_ID, { ...TERMS, list: true });
    expect(partners()[0].visible).toBe(true);
  });

  it("keeps the listing hidden with list: false, and still approves", async () => {
    await approveApplication(ROW_ID, { ...TERMS, list: false });
    expect(partners()).toHaveLength(1);
    expect(partners()[0].visible).toBe(false);
    expect(partners()[0].description).toBe("Sports and post-op physiotherapy in Tanjong Pagar.");
    expect(applicationRow()).toMatchObject({ application_status: "approved", partner_id: partners()[0].id });
  });

  it.each([
    ["another applicant's folder", `${MEDIA}${applicantLogoFolder(OTHER_USER)}logo.webp`],
    ["the shared applicants folder, not their own", `${MEDIA}${applicantLogoFolder()}logo.webp`],
    ["a partner's folder", `${MEDIA}${partnerLogoFolder(SOME_PARTNER)}logo.webp`],
    ["another host", `https://evil.example/storage/v1/object/public/media/${applicantLogoFolder(APPLICANT)}logo.webp`],
    ["a different bucket", `${ORIGIN}/storage/v1/object/public/other/${applicantLogoFolder(APPLICANT)}logo.webp`],
    ["a path climbing out of their folder", `${MEDIA}${applicantLogoFolder(APPLICANT)}..%2F${OTHER_USER}%2Flogo.webp`],
    ["not a URL", "javascript:alert(1)"],
  ])("does not copy a logo from %s, but still approves", async (_label, logoUrl) => {
    h.db.partner_users = [application({}, { logoUrl })];

    await expect(approveApplication(ROW_ID, TERMS)).resolves.toEqual({ ok: true });

    expect(partners()).toHaveLength(1);
    expect(partners()[0].logo_url ?? null).toBeNull();
    expect(partners()[0].description).toBe("Sports and post-op physiotherapy in Tanjong Pagar.");
    expect(applicationRow()).toMatchObject({ application_status: "approved" });
  });

  it("checks the logo against the folder of the row's own auth user: a row without one gets no logo", async () => {
    h.db.partner_users = [
      application({ auth_user_id: null }, { logoUrl: `${MEDIA}${applicantLogoFolder(APPLICANT)}logo.webp` }),
    ];

    await approveApplication(ROW_ID, TERMS);

    expect(partners()).toHaveLength(1);
    expect(partners()[0].logo_url ?? null).toBeNull();
  });

  it("approves an application made before the write-up existed, with no write-up or logo", async () => {
    const q = questionnaire();
    delete q.description;
    delete q.logoUrl;
    h.db.partner_users = [{ ...application(), questionnaire: q }];

    await expect(approveApplication(ROW_ID, TERMS)).resolves.toEqual({ ok: true });

    expect(partners()).toHaveLength(1);
    expect(partners()[0].description ?? null).toBeNull();
    expect(partners()[0].logo_url ?? null).toBeNull();
    expect(applicationRow()).toMatchObject({ application_status: "approved", partner_id: partners()[0].id });
  });
});

describe("approveApplication: an application that is withdrawn or no longer pending", () => {
  it("throws for an application already withdrawn, creating no partner row", async () => {
    h.db.partner_users = [];

    await expect(approveApplication(ROW_ID, TERMS)).rejects.toThrow();

    expect(partners()).toEqual([]);
  });

  it("throws, and leaves no partner row behind, when withdrawn while Staff approve it", async () => {
    h.afterRead = () => {
      h.db.partner_users = h.db.partner_users.filter((r) => r.id !== ROW_ID);
    };

    await expect(approveApplication(ROW_ID, TERMS)).rejects.toThrow();

    expect(partners()).toEqual([]);
    expect(applicationRow()).toBeUndefined();
  });

  it("throws, and leaves no partner row behind, when rejected by someone else in the meantime", async () => {
    h.afterRead = () => {
      const row = applicationRow();
      if (row) row.application_status = "rejected";
    };

    await expect(approveApplication(ROW_ID, TERMS)).rejects.toThrow();

    expect(partners()).toEqual([]);
    expect(applicationRow()).toMatchObject({ application_status: "rejected", partner_id: null });
  });

  it("throws for a rejected application, creating no partner row", async () => {
    h.db.partner_users = [application({ application_status: "rejected" })];

    await expect(approveApplication(ROW_ID, TERMS)).rejects.toThrow();

    expect(partners()).toEqual([]);
    expect(applicationRow()).toMatchObject({ application_status: "rejected", partner_id: null });
  });
});

describe("rejectApplication", () => {
  it("rejects a pending application and creates no partner row", async () => {
    await expect(rejectApplication(ROW_ID)).resolves.toEqual({ ok: true });

    expect(applicationRow()).toMatchObject({ application_status: "rejected", partner_id: null });
    expect(partners()).toEqual([]);
  });

  it("throws for an application already withdrawn", async () => {
    h.db.partner_users = [];

    await expect(rejectApplication(ROW_ID)).rejects.toThrow();

    expect(h.db.partner_users).toEqual([]);
  });

  it("throws when the application is withdrawn while Staff reject it, and does not bring it back", async () => {
    h.afterRead = () => {
      h.db.partner_users = h.db.partner_users.filter((r) => r.id !== ROW_ID);
    };

    await expect(rejectApplication(ROW_ID)).rejects.toThrow();

    expect(h.db.partner_users).toEqual([]);
    expect(partners()).toEqual([]);
  });
});
