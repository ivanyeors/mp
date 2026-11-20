import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import type { ApplicationFields } from "@/lib/partner-application";
import { applicantLogoFolder, partnerLogoFolder } from "@/lib/partner-upload/urls";

const ORIGIN = "https://proj.supabase.co";
const MEDIA = `${ORIGIN}/storage/v1/object/public/media/`;
const ME = "6b1f0c4e-2d3a-4b5c-8d9e-0f1a2b3c4d5e";
const OTHER_USER = "0c9d8e7f-6a5b-4c3d-9e2f-1a0b9c8d7e6f";
const SOME_PARTNER = "3f6c1d2e-8a4b-4c5d-9e7f-0a1b2c3d4e5f";
const MY_EMAIL = "jane@acme.example";
const WITHDRAWN = "/en-US/partner/apply?withdrawn=1";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  db: {} as Record<string, Record<string, unknown>[]>,
  user: null as unknown,
  afterRead: null as null | (() => void),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@/lib/auth/user", () => ({ getAuthUser: async () => h.user }));
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
vi.mock("@/lib/partner-upload", () => ({ removeApplicantLogos: vi.fn(async () => undefined) }));
vi.mock("@/lib/email/partner", () => ({ sendReacceptEmail: vi.fn(async () => undefined) }));

const { submitApplication, withdrawApplication } = await import("../actions");

function asUser(u: { id: string; email: string | null }): User {
  return { email_confirmed_at: "2026-01-01T00:00:00Z", ...u } as unknown as User;
}

async function settle(call: Promise<unknown>): Promise<{ redirect: string } | { returned: unknown }> {
  try {
    return { returned: await call };
  } catch (e) {
    const m = /^REDIRECT (.*)$/.exec(e instanceof Error ? e.message : "");
    if (m) return { redirect: m[1] };
    throw e;
  }
}

function application(over: Row = {}): Row {
  return {
    id: "pu-me",
    auth_user_id: ME,
    email: MY_EMAIL,
    partner_id: null,
    application_status: "pending",
    agreed_version: "2026-07-28",
    questionnaire: { companyName: "Acme Physio" },
    ...over,
  };
}

const someoneElse = (): Row =>
  application({ id: "pu-other", auth_user_id: OTHER_USER, email: "other@clinic.example" });

const ids = () => (h.db.partner_users ?? []).map((r) => r.id).sort();

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ORIGIN);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  h.afterRead = null;
  h.user = asUser({ id: ME, email: MY_EMAIL });
  h.db = { partner_users: [], partners: [] };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("withdrawApplication: success", () => {
  it("deletes the user's own pending application and redirects to the form with withdrawn=1", async () => {
    h.db.partner_users = [application(), someoneElse()];

    expect(await settle(withdrawApplication("en-US"))).toEqual({ redirect: WITHDRAWN });

    expect(ids()).toEqual(["pu-other"]);
  });

  it("redirects within the user's language", async () => {
    h.db.partner_users = [application()];

    expect(await settle(withdrawApplication("zh-CN"))).toEqual({ redirect: "/zh-CN/partner/apply?withdrawn=1" });

    expect(ids()).toEqual([]);
  });
});

describe("withdrawApplication: refused, nothing deleted", () => {
  it.each([
    ["approved and linked", { application_status: "approved", partner_id: SOME_PARTNER }],
    ["approved", { application_status: "approved" }],
    ["rejected", { application_status: "rejected" }],
    ["pending but already linked to a partner", { partner_id: SOME_PARTNER }],
  ])("returns { error } for an application that is %s", async (_label, over) => {
    h.db.partner_users = [application(over), someoneElse()];
    const before = structuredClone(h.db.partner_users);

    const res = await settle(withdrawApplication("en-US"));

    expect(res).toEqual({ returned: { error: expect.any(String) } });
    expect((res as { returned: { error: string } }).returned.error.trim()).not.toBe("");
    expect(h.db.partner_users).toEqual(before);
  });

  it("returns { error } for an application held by another login (reached through a verified backup email)", async () => {
    h.user = asUser({ id: ME, email: "backup@acme.example" });
    h.db.partner_users = [
      application({
        id: "pu-primary",
        auth_user_id: OTHER_USER,
        email: "owner@acme.example",
        backup_email: "backup@acme.example",
        backup_email_verified: true,
      }),
    ];

    const res = await settle(withdrawApplication("en-US"));

    expect(res).toEqual({ returned: { error: expect.any(String) } });
    expect(ids()).toEqual(["pu-primary"]);
  });

  it("returns { error } when Staff approve the application while it is being withdrawn", async () => {
    h.db.partner_users = [application()];
    h.afterRead = () => {
      Object.assign(h.db.partner_users[0], { application_status: "approved", partner_id: SOME_PARTNER });
    };

    const res = await settle(withdrawApplication("en-US"));

    expect(res).toEqual({ returned: { error: expect.any(String) } });
    expect(h.db.partner_users).toEqual([
      expect.objectContaining({ id: "pu-me", application_status: "approved", partner_id: SOME_PARTNER }),
    ]);
  });

  it("returns { error } when Staff reject the application while it is being withdrawn", async () => {
    h.db.partner_users = [application()];
    h.afterRead = () => {
      h.db.partner_users[0].application_status = "rejected";
    };

    const res = await settle(withdrawApplication("en-US"));

    expect(res).toEqual({ returned: { error: expect.any(String) } });
    expect(h.db.partner_users).toEqual([expect.objectContaining({ id: "pu-me", application_status: "rejected" })]);
  });

  it("does not succeed for a signed-out visitor, and deletes nothing", async () => {
    h.user = null;
    h.db.partner_users = [application(), someoneElse()];

    const res = await settle(withdrawApplication("en-US"));

    expect(res).not.toEqual({ redirect: WITHDRAWN });
    expect(ids()).toEqual(["pu-me", "pu-other"]);
  });

  it("does not succeed for a signed-in user with no application, and deletes nothing", async () => {
    h.db.partner_users = [someoneElse()];

    const res = await settle(withdrawApplication("en-US"));

    expect(res).not.toEqual({ redirect: WITHDRAWN });
    expect(ids()).toEqual(["pu-other"]);
  });
});

function validFields(over: Partial<ApplicationFields> = {}): ApplicationFields {
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
    ...over,
  };
}

const KNOWN_KEYS = new Set([
  "companyName",
  "uen",
  "website",
  "category",
  "contactName",
  "contactMobile",
  "businessEmail",
  "introPlan",
  "description",
  "logoUrl",
]);

const MY_LOGO = `${MEDIA}${applicantLogoFolder(ME)}1731740000-logo.webp`;
const stored = () => h.db.partner_users.find((r) => r.auth_user_id === ME)?.questionnaire as Row | undefined;

describe("submitApplication: the logo", () => {
  it("accepts a logo the user uploaded to their own applicant folder, and stores it", async () => {
    const res = await settle(submitApplication("en-US", validFields({ logoUrl: MY_LOGO }), true));

    expect(res).toHaveProperty("redirect");
    expect(h.db.partner_users).toHaveLength(1);
    expect(h.db.partner_users[0]).toMatchObject({ auth_user_id: ME, application_status: "pending" });
    expect(stored()?.logoUrl).toBe(MY_LOGO);
  });

  it("accepts an application with no logo", async () => {
    const res = await settle(submitApplication("en-US", validFields(), true));

    expect(res).toHaveProperty("redirect");
    expect(h.db.partner_users).toHaveLength(1);
    expect(stored()?.logoUrl ?? null).toBeNull();
  });

  it.each([
    ["another user's applicant folder", `${MEDIA}${applicantLogoFolder(OTHER_USER)}logo.webp`],
    ["the shared applicants folder, not their own", `${MEDIA}${applicantLogoFolder()}logo.webp`],
    ["a partner's folder", `${MEDIA}${partnerLogoFolder(SOME_PARTNER)}logo.webp`],
    ["another host", `https://evil.example/storage/v1/object/public/media/${applicantLogoFolder(ME)}logo.webp`],
    ["a different bucket", `${ORIGIN}/storage/v1/object/public/other/${applicantLogoFolder(ME)}logo.webp`],
    ["a path climbing out of their folder", `${MEDIA}${applicantLogoFolder(ME)}..%2F${OTHER_USER}%2Flogo.webp`],
    ["not a URL", "javascript:alert(1)"],
  ])("refuses a logo from %s with fieldErrors.logoUrl, storing nothing", async (_label, logoUrl) => {
    const res = await settle(submitApplication("en-US", validFields({ logoUrl }), true));

    expect(res).toEqual({ returned: expect.objectContaining({ fieldErrors: expect.any(Object) }) });
    const { fieldErrors } = (res as { returned: { fieldErrors: Record<string, string> } }).returned;
    expect(fieldErrors.logoUrl).toBeTruthy();
    expect(h.db.partner_users).toEqual([]);
  });
});

describe("submitApplication: what is stored", () => {
  it("stores only the known questionnaire keys, dropping extras a client sends", async () => {
    const tampered = {
      ...validFields({ logoUrl: MY_LOGO }),
      application_status: "approved",
      partner_id: SOME_PARTNER,
      isAdmin: true,
      notes: "<script>alert(1)</script>",
    } as unknown as ApplicationFields;

    const res = await settle(submitApplication("en-US", tampered, true));

    expect(res).toHaveProperty("redirect");
    expect(h.db.partner_users).toHaveLength(1);
    const q = stored() ?? {};
    for (const key of Object.keys(q)) expect(KNOWN_KEYS.has(key), `unexpected stored key ${key}`).toBe(true);
    expect(q).toMatchObject({ ...validFields(), logoUrl: MY_LOGO });
    expect(h.db.partner_users[0]).toMatchObject({ application_status: "pending" });
    expect(h.db.partner_users[0].partner_id ?? null).toBeNull();
  });

  it("stores the public write-up", async () => {
    await settle(submitApplication("en-US", validFields(), true));

    expect(stored()?.description).toBe("Sports and post-op physiotherapy in Tanjong Pagar.");
  });

  it("refuses an application without a write-up, storing nothing", async () => {
    const res = await settle(submitApplication("en-US", validFields({ description: "   " }), true));

    const { fieldErrors } = (res as { returned: { fieldErrors: Record<string, string> } }).returned;
    expect(fieldErrors.description).toBeTruthy();
    expect(h.db.partner_users).toEqual([]);
  });
});
