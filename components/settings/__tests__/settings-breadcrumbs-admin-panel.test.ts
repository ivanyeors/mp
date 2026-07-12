import { describe, it, expect } from "vitest";
import {
  buildSettingsBreadcrumbs,
  type BreadcrumbNavGroup,
} from "@/components/settings/settings-breadcrumbs";

const NAV: BreadcrumbNavGroup[] = [
  {
    label: "Admin Panel",
    items: [
      {
        href: "/settings",
        label: "General",
        items: [
          { href: "/settings/general", label: "API Configs" },
          { href: "/settings/admins", label: "Admin Users" },
        ],
      },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/settings/inventory", label: "Inventory" },
      { href: "/settings/inventory/configure", label: "Configure" },
    ],
  },
  {
    label: "Store",
    items: [{ href: "/settings/products", label: "Products" }],
  },
];

describe("Admin Panel breadcrumbs", () => {
  it("uses Admin Panel as root label", () => {
    expect(buildSettingsBreadcrumbs("/settings", NAV).map((c) => c.label)).toEqual([
      "Admin Panel",
    ]);
    expect(
      buildSettingsBreadcrumbs("/settings/inventory/configure", NAV).map((c) => c.label),
    ).toEqual(["Admin Panel", "Inventory", "Configure"]);
  });
});
