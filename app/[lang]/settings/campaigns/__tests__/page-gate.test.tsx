import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasPermission,
  permissionEntry,
  permissionForHref,
  permissionsForRoleRow,
  ROLE_PERMISSIONS,
} from "@/lib/auth/permissions";

/**
 * Email campaigns is its own key (PRD-email-marketing): Owner and Admin hold
 * it through grants_all; Manager and Staff hold `customers` but must not
 * email the whole list, so they get the denied page, and every action refuses
 * them before it reads or sends anything.
 */

const h = vi.hoisted(() => ({ permissions: new Set<string>() }));

vi.mock("@/lib/auth/admin", () => ({
  requireAdminPage: vi.fn(async (permission: string) => {
    if (!h.permissions.has(permission)) throw new Error(`REDIRECT /settings?denied=${permission}`);
    return { permissions: h.permissions, email: "owner@mpillow.com", memberId: "m1", userId: "u1" };
  }),
  assertAdmin: vi.fn(async (permission: string) => {
    if (!h.permissions.has(permission)) throw new Error("Forbidden");
    return { permissions: h.permissions, email: "owner@mpillow.com", memberId: "m1", userId: "u1" };
  }),
}));
const supabaseAdmin = vi.hoisted(() => vi.fn(() => {
  throw new Error("the database was touched");
}));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin }));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: vi.fn() }));
vi.mock("@/lib/staff/working-as", () => ({ getWorkingAs: vi.fn(async () => null) }));

const { default: ListPage } = await import("../page");
const { default: NewPage } = await import("../new/page");
const actions = await import("../actions");

const ROLE_ROWS = {
  owner: { grants_all: true, permissions: [] },
  admin: { grants_all: true, permissions: [] },
  manager: { grants_all: false, permissions: ROLE_PERMISSIONS.manager },
  fulfilment: { grants_all: false, permissions: ROLE_PERMISSIONS.staff },
  viewer: { grants_all: false, permissions: ROLE_PERMISSIONS.viewer },
} as const;
type RoleKey = keyof typeof ROLE_ROWS;

const signInAs = (role: RoleKey) => {
  h.permissions = new Set(permissionsForRoleRow(ROLE_ROWS[role]));
};
const params = Promise.resolve({ lang: "en-US" });

beforeEach(() => vi.clearAllMocks());

describe("campaigns in the catalog", () => {
  it("is its own sidebar page under Store", () => {
    expect(permissionEntry("campaigns")).toMatchObject({ label: "Email campaigns", group: "Store", href: "/settings/campaigns" });
    expect(permissionForHref("/settings/campaigns")).toBe("campaigns");
    expect(permissionForHref("/settings/campaigns/new")).toBe("campaigns");
  });

  it("is held by Owner and Admin only", () => {
    for (const role of Object.keys(ROLE_ROWS) as RoleKey[]) {
      const held = permissionsForRoleRow(ROLE_ROWS[role]);
      expect(hasPermission({ permissions: held }, "campaigns"), role).toBe(role === "owner" || role === "admin");
    }
  });
});

describe("/settings/campaigns", () => {
  it.each(["manager", "fulfilment", "viewer"] as const)("sends %s to the denied page", async (role) => {
    signInAs(role);
    await expect(ListPage({ params })).rejects.toThrow("REDIRECT /settings?denied=campaigns");
    await expect(NewPage({ params })).rejects.toThrow("REDIRECT /settings?denied=campaigns");
  });
});

describe("every action checks campaigns before anything else", () => {
  const ID = "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a";
  const calls: [string, () => Promise<unknown>][] = [
    ["saveCampaign", () => actions.saveCampaign(null, {} as never)],
    ["duplicateCampaign", () => actions.duplicateCampaign(ID)],
    ["archiveCampaignAction", () => actions.archiveCampaignAction(ID)],
    ["previewCampaign", () => actions.previewCampaign({} as never)],
    ["checkCampaignReadiness", () => actions.checkCampaignReadiness(ID)],
    ["sendCampaignTestAction", () => actions.sendCampaignTestAction(ID, ["a@x.test"])],
    ["planCampaignWave", () => actions.planCampaignWave(ID, { size: 10 }, true)],
    ["sendCampaignBatchAction", () => actions.sendCampaignBatchAction(ID, { wave: "w1", customerIds: [ID] })],
  ];

  it.each(calls)("%s refuses Manager without touching the database", async (_name, call) => {
    signInAs("manager");
    await expect(call()).rejects.toThrow("Forbidden");
    expect(supabaseAdmin).not.toHaveBeenCalled();
  });
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/campaigns/new",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

describe("the editor", () => {
  it("opens a new campaign on the Shopify customers' invitation, with no offer in it", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { CampaignEditor } = await import("../campaign-editor");
    const { FIRST_CAMPAIGN_DRAFT } = await import("@/lib/email-campaigns/rules");
    const html = renderToStaticMarkup(
      <CampaignEditor campaign={null} draft={FIRST_CAMPAIGN_DRAFT} stats={null} segments={[]} staffEmail="owner@mpillow.com" />,
    );
    expect(html).toContain("New campaign");
    expect(html).toContain("Your Mpillow account is ready");
    expect(html).toContain("Imported from Shopify, not signed in yet");
    expect(html).not.toMatch(/voucher|points|% off|discount/i);
    // Nothing to test or send until it is saved.
    expect(html).not.toContain("Send a test");
  });
});
