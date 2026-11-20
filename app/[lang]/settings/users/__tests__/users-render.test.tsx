import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { MemberRow, RoleRow } from "@/lib/auth/members";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const { UsersClient } = await import("../users-client");

const role = (id: string, key: string, name: string, permissions: string[], system = false): RoleRow => ({
  id,
  key,
  name,
  description: null,
  is_system: system,
  grants_all: system,
  permissions,
  memberCount: 0,
});

const roles = [
  role("r-owner", "owner", "Owner", [], true),
  role("r-admin", "admin", "Admin", [], true),
  role("r-fulfilment", "fulfilment", "Fulfilment", ["orders", "returns", "results"]),
];

const members: MemberRow[] = [
  { id: "m1", email: "sg@mpillow.com", roleId: "r-owner", status: "active", isActive: true, createdAt: "2026-06-21T00:00:00Z", lastSignInAt: "2026-10-03T00:00:00Z", inviteSentAt: null },
  { id: "m2", email: "new@x.test", roleId: "r-fulfilment", status: "invited", isActive: true, createdAt: "2026-10-04T00:00:00Z", lastSignInAt: null, inviteSentAt: "2026-10-04T00:00:00Z" },
];

const actor = { memberId: "m1", isOwner: true, grantsAll: true, permissions: [] };

describe("Users & permissions render", () => {
  it.each(["members", "roles", "profiles", "telegram"] as const)("renders the %s tab", (tab) => {
    const html = renderToString(
      <UsersClient
        initialTab={tab}
        actor={actor}
        initialMembers={members}
        initialRoles={roles}
        initialProfiles={[
          { id: "p1", name: "Kai Lin", memberId: "m1", memberEmail: "sg@mpillow.com", archivedAt: null, createdAt: "", updatedAt: "" },
          { id: "p2", name: "Old", memberId: "m1", memberEmail: "sg@mpillow.com", archivedAt: "2026-10-01", createdAt: "", updatedAt: "" },
        ]}
        initialTelegram={[]}
      />,
    );
    expect(html).toContain("Users &amp; permissions");
    if (tab === "members") {
      expect(html).toContain("sg@mpillow.com");
      expect(html).toContain("Invited");
    }
    if (tab === "members") expect(html).toContain("1 profile");
    if (tab === "profiles") {
      expect(html).toContain("Kai Lin");
      expect(html).not.toContain(">Old<");
    }
    if (tab === "roles") {
      expect(html).toContain("Fulfilment");
      expect(html).toContain("Page Builder");
      expect(html).toContain("Reply to Google reviews");
    }
  });
});
