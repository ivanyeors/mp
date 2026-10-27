import { describe, expect, it } from "vitest";
import { NAV_GROUPS, visibleItems } from "@/components/settings/settings-sidebar-nav";
import { buildSettingsBreadcrumbs } from "@/components/settings/settings-breadcrumbs";
import { permissionEntry, permissionForHref, type Permission } from "@/lib/auth/permissions";

const group = (label: string) => NAV_GROUPS.find((g) => g.label === label)!;
const hrefs = (label: string) =>
  group(label).items.flatMap((i) => [i.href, ...(i.items ?? []).map((s) => s.href)]);

describe("the CRM group", () => {
  it("lists the customer loop in the order a customer goes round it", () => {
    expect(group("CRM").items.map((i) => i.href)).toEqual([
      "/settings/customers",
      "/settings/results",
      "/settings/orders",
      "/settings/rma",
      "/settings/campaigns",
    ]);
  });

  it("nests Email templates under Email campaigns", () => {
    const campaigns = group("CRM").items.find((i) => i.href === "/settings/campaigns")!;
    expect(campaigns.items?.map((s) => s.href)).toEqual(["/settings/email-templates"]);
    expect(
      buildSettingsBreadcrumbs("/settings/email-templates/order.refund", NAV_GROUPS, "Refund").map((c) => c.label),
    ).toEqual(["Admin Panel", "Email campaigns", "Email templates", "Refund"]);
  });

  it("leaves Store with what is sold and how", () => {
    for (const href of hrefs("CRM")) expect(hrefs("Store"), href).not.toContain(href);
  });

  it("is the same group on Users & permissions → Roles", () => {
    for (const href of hrefs("CRM")) {
      expect(permissionEntry(permissionForHref(href)!).group, href).toBe("CRM");
    }
  });
});

describe("visibleItems", () => {
  const crm = group("CRM").items;
  const shown = (permissions: Permission[]) =>
    visibleItems(crm, permissions).map((i) => [i.href, (i.items ?? []).map((s) => s.href)]);

  it("shows a parent with the children the role holds", () => {
    expect(shown(["campaigns", "email-templates"])).toEqual([
      ["/settings/campaigns", ["/settings/email-templates"]],
    ]);
    expect(shown(["campaigns"])).toEqual([["/settings/campaigns", []]]);
  });

  it("lifts a child up when the role cannot open its parent", () => {
    expect(shown(["email-templates"])).toEqual([["/settings/email-templates", []]]);
  });

  it("hides what the role does not hold", () => {
    expect(shown(["orders"])).toEqual([["/settings/orders", []]]);
    expect(shown([])).toEqual([]);
  });
});
