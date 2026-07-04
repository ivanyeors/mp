/**
 * Runnable self-check for buildSettingsBreadcrumbs.
 * Run: npx tsx components/settings/settings-breadcrumbs.check.ts
 */
import {
  buildSettingsBreadcrumbs,
  type BreadcrumbNavGroup,
} from "./settings-breadcrumbs";

const NAV: BreadcrumbNavGroup[] = [
  {
    label: "Settings",
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
  {
    label: "Integration",
    items: [{ href: "/settings/integrations/shopify", label: "Shopify Admin" }],
  },
];

function labels(path: string, detail?: string | null) {
  return buildSettingsBreadcrumbs(path, NAV, detail).map((c) => c.label);
}

function hrefs(path: string, detail?: string | null) {
  return buildSettingsBreadcrumbs(path, NAV, detail).map((c) => c.href ?? null);
}

function assertEqual(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg}\n  expected: ${e}\n  actual:   ${a}`);
  }
}

assertEqual(labels("/settings"), ["Settings"], "root is Settings only");
assertEqual(hrefs("/settings"), [null], "root is current (no link)");

assertEqual(
  labels("/settings/inventory/configure"),
  ["Settings", "Inventory", "Configure"],
  "configure includes Inventory ancestor",
);
assertEqual(
  hrefs("/settings/inventory/configure"),
  ["/settings", "/settings/inventory", null],
  "configure links ancestors only",
);

assertEqual(labels("/settings/general"), ["Settings", "API Configs"], "nav label for general");
assertEqual(labels("/settings/admins"), ["Settings", "Admin Users"], "nav label for admins");
assertEqual(
  labels("/settings/integrations/shopify"),
  ["Settings", "Shopify Admin"],
  "nav label for shopify",
);

const uuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
assertEqual(
  labels(`/settings/products/${uuid}`),
  ["Settings", "Products", "Details"],
  "opaque id becomes Details",
);
assertEqual(
  labels(`/settings/products/${uuid}`, "Cloud Pillow"),
  ["Settings", "Products", "Cloud Pillow"],
  "detailLabel overrides Details",
);
assertEqual(
  hrefs(`/settings/products/${uuid}`),
  ["/settings", "/settings/products", null],
  "detail is current page",
);

assertEqual(
  labels("/settings/products/new"),
  ["Settings", "Products", "New"],
  "non-opaque segment title-cases",
);

console.log("settings-breadcrumbs: all checks passed");
