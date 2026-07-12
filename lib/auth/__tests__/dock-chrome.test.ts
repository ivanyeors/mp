import { describe, it, expect } from "vitest";
import {
  isAdminPanelDockPath,
  landingAuthPill,
  resolveDockSessionRole,
} from "@/lib/auth/dock-chrome";

describe("dock-chrome", () => {
  it("resolves guest / customer / staff (staff wins)", () => {
    expect(resolveDockSessionRole(false, false)).toBe("guest");
    expect(resolveDockSessionRole(true, false)).toBe("customer");
    expect(resolveDockSessionRole(true, true)).toBe("staff");
    expect(resolveDockSessionRole(false, true)).toBe("staff");
  });

  it("maps role to landing Menu auth pill", () => {
    expect(landingAuthPill("guest")).toEqual({
      label: "Sign in",
      href: "/account/login",
    });
    expect(landingAuthPill("customer")).toEqual({
      label: "Profile",
      href: "/account",
    });
    expect(landingAuthPill("staff")).toEqual({
      label: "Admin Panel",
      href: "/settings",
    });
  });

  it("shows Admin Panel dock only under /settings (not login)", () => {
    expect(isAdminPanelDockPath("/settings")).toBe(true);
    expect(isAdminPanelDockPath("/settings/orders")).toBe(true);
    expect(isAdminPanelDockPath("/settings/login")).toBe(false);
    expect(isAdminPanelDockPath("/account")).toBe(false);
    expect(isAdminPanelDockPath("/")).toBe(false);
    expect(isAdminPanelDockPath("/shop")).toBe(false);
  });
});
