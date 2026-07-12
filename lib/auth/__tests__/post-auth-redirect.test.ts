import { describe, it, expect } from "vitest";
import { resolvePostAuthRedirect } from "@/lib/auth/post-auth-redirect";

const accountHome = "/en-US/account";
const adminHome = "/en-US/settings";

function resolve(next: string | null | undefined, isStaff: boolean) {
  return resolvePostAuthRedirect({ next, isStaff, accountHome, adminHome });
}

describe("resolvePostAuthRedirect", () => {
  it("sends staff with default account next to Admin Panel", () => {
    expect(resolve(accountHome, true)).toBe(adminHome);
    expect(resolve("/en-US/account", true)).toBe(adminHome);
  });

  it("blocks non-staff from landing under /settings via next", () => {
    expect(resolve("/en-US/settings", false)).toBe(accountHome);
    expect(resolve("/en-US/settings/orders", false)).toBe(accountHome);
    expect(resolve("/zh-CN/settings/results/abc", false)).toBe(accountHome);
  });

  it("honors staff next to a Result path", () => {
    expect(resolve("/en-US/results/abc", true)).toBe("/en-US/results/abc");
  });

  it("honors staff next under Admin Panel", () => {
    expect(resolve("/en-US/settings/orders", true)).toBe("/en-US/settings/orders");
  });

  it("honors non-staff safe next (account, results)", () => {
    expect(resolve(accountHome, false)).toBe(accountHome);
    expect(resolve("/en-US/results/xyz", false)).toBe("/en-US/results/xyz");
  });

  it("falls back to account home for unsafe next", () => {
    expect(resolve("https://evil.example", false)).toBe(accountHome);
    expect(resolve("//evil.example", true)).toBe(adminHome); // staff + fallback account → admin
    expect(resolve(undefined, false)).toBe(accountHome);
  });
});
