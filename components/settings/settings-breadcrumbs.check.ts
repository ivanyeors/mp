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
  {
    label: "Integration",
    items: [{ href: "/settings/integrations/shopify", label: "Shopify Link" }],
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

assertEqual(labels("/settings"), ["Admin Panel"], "root is Admin Panel only");
assertEqual(hrefs("/settings"), [null], "root is current (no link)");

assertEqual(
  labels("/settings/inventory/configure"),
  ["Admin Panel", "Inventory", "Configure"],
  "configure includes Inventory ancestor",
);
assertEqual(
  hrefs("/settings/inventory/configure"),
  ["/settings", "/settings/inventory", null],
  "configure links ancestors only",
);

assertEqual(labels("/settings/general"), ["Admin Panel", "API Configs"], "nav label for general");
assertEqual(labels("/settings/admins"), ["Admin Panel", "Admin Users"], "nav label for admins");
assertEqual(
  labels("/settings/integrations/shopify"),
  ["Admin Panel", "Shopify Link"],
  "nav label for shopify",
);

const uuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
assertEqual(
  labels(`/settings/products/${uuid}`),
  ["Admin Panel", "Products", "Details"],
  "opaque id becomes Details",
);
assertEqual(
  labels(`/settings/products/${uuid}`, "Cloud Pillow"),
  ["Admin Panel", "Products", "Cloud Pillow"],
  "detailLabel overrides Details",
);
assertEqual(
  hrefs(`/settings/products/${uuid}`),
  ["/settings", "/settings/products", null],
  "detail is current page",
);

assertEqual(
  labels("/settings/products/new"),
  ["Admin Panel", "Products", "New"],
  "non-opaque segment title-cases",
);

// Two-level detail routes (e.g. Product Builder / Rules Engine / {flow}).
assertEqual(
  labels("/settings/inventory/configure/rules-engine/premium-mpillow"),
  ["Admin Panel", "Inventory", "Configure", "Rules Engine", "Premium Mpillow"],
  "nested detail segments each get a crumb",
);
assertEqual(
  hrefs("/settings/inventory/configure/rules-engine/premium-mpillow"),
  ["/settings", "/settings/inventory", "/settings/inventory/configure", "/settings/inventory/configure/rules-engine", null],
  "only the final nested segment is non-linked",
);
assertEqual(
  labels("/settings/inventory/configure/rules-engine/premium-mpillow", "Premium Mpillow"),
  ["Admin Panel", "Inventory", "Configure", "Rules Engine", "Premium Mpillow"],
  "detailLabel overrides only the last nested segment",
);

// Product Builder → Rules Engine → {flow} (slice 02 mount path).
const PB_NAV: BreadcrumbNavGroup[] = [
  {
    label: "Landing Site",
    items: [
      { href: "/settings/product-builder", label: "Product Builder" },
    ],
  },
];
assertEqual(
  buildSettingsBreadcrumbs(
    "/settings/product-builder/rules-engine/premium-mpillow",
    PB_NAV,
  ).map((c) => c.label),
  ["Admin Panel", "Product Builder", "Rules Engine", "Premium Mpillow"],
  "Product Builder / Rules Engine / flow crumbs",
);

console.log("settings-breadcrumbs: all checks passed");