import { describe, expect, it } from "vitest";
import {
  buildSettingsBreadcrumbs,
  type BreadcrumbNavGroup,
} from "@/components/settings/settings-breadcrumbs";

const GROUPS: BreadcrumbNavGroup[] = [
  {
    label: "Store",
    items: [{ href: "/settings/shipping", label: "Shipping" }],
  },
  {
    label: "Landing Site",
    items: [
      {
        href: "/settings/product-builder",
        label: "Product Builder",
        items: [{ href: "/settings/product-builder/rules-engine", label: "Rules Engine" }],
      },
      {
        href: "/settings/partners",
        label: "Partners",
        items: [
          { href: "/settings/partner-applications", label: "Partner applications" },
          { href: "/settings/partner-commissions", label: "Partner Commissions" },
        ],
      },
    ],
  },
];

const labels = (path: string) =>
  buildSettingsBreadcrumbs(path, GROUPS).map((c) => c.label);

describe("buildSettingsBreadcrumbs", () => {
  it("nests a sibling-URL child under its nav parent", () => {
    expect(labels("/settings/partner-commissions")).toEqual([
      "Admin Panel",
      "Partners",
      "Partner Commissions",
    ]);
  });

  it("nests Couriers under Shipping without a nav entry of its own", () => {
    expect(labels("/settings/shipping/couriers")).toEqual([
      "Admin Panel",
      "Shipping",
      "Couriers",
    ]);
  });

  it("still nests a URL-nested child without duplicating the parent", () => {
    expect(labels("/settings/product-builder/rules-engine")).toEqual([
      "Admin Panel",
      "Product Builder",
      "Rules Engine",
    ]);
  });
});
