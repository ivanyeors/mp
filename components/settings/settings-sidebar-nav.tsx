"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Boxes, Wrench, Settings2, CircleDollarSign, TrendingUp, Store, ClipboardList,
  Users, Newspaper, Image, LayoutDashboard, ShoppingBag,
  ShoppingCart, UserCircle, Tag, Truck, KeyRound, Loader2,
  ShieldCheck, ScrollText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarInset,
  SidebarTrigger,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, stripLocale, withLocale } from "@/lib/i18n/routing";
import type { Permission } from "@/lib/auth/permissions";

type NavItem = {
  href: string;
  label: string;
  tooltip: string;
  Icon: LucideIcon;
  /** Permission required to see this entry; omitted = visible to any staff. */
  perm?: Permission;
  items?: NavItem[];
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Settings",
    items: [
      {
        href: "/settings",
        label: "General",
        tooltip: "General Settings",
        Icon: Settings2,
        items: [
          { href: "/settings/general", label: "API Configs", tooltip: "API Configurations", Icon: KeyRound, perm: "api-configs" },
          { href: "/settings/admins", label: "Admin Users", tooltip: "Admin users & roles", Icon: ShieldCheck, perm: "staff" },
          { href: "/settings/staff-management", label: "Staff Management", tooltip: "Manufacturing staff", Icon: Users, perm: "results" },
        ],
      },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/settings/inventory", label: "Inventory", tooltip: "Inventory", Icon: Boxes, perm: "inventory" },
      { href: "/settings/costings", label: "Costings", tooltip: "Costings", Icon: CircleDollarSign, perm: "costings" },
      { href: "/settings/inventory/configure", label: "Configure", tooltip: "Configure BOM", Icon: Wrench, perm: "inventory" },
    ],
  },
  {
    label: "Store",
    items: [
      { href: "/settings/products", label: "Products", tooltip: "Product Management", Icon: ShoppingBag, perm: "products" },
      { href: "/settings/customers", label: "Customers", tooltip: "Customer Management", Icon: UserCircle, perm: "customers" },
      { href: "/settings/results", label: "Results", tooltip: "Mp-config Results", Icon: ClipboardList, perm: "results" },
      { href: "/settings/orders", label: "Orders", tooltip: "Order Management", Icon: ShoppingCart, perm: "orders" },
      { href: "/settings/discounts", label: "Discounts", tooltip: "Discount Codes", Icon: Tag, perm: "discounts" },
      { href: "/settings/shipping", label: "Shipping", tooltip: "Shipping Methods", Icon: Truck, perm: "shipping" },
    ],
  },
  {
    label: "Landing Site",
    items: [
      { href: "/settings/page-builder", label: "Page Builder", tooltip: "Customise landing page sections", Icon: LayoutDashboard, perm: "page-builder" },
      { href: "/settings/blogs", label: "Blogs", tooltip: "Blog Management", Icon: Newspaper, perm: "blogs" },
      { href: "/settings/media", label: "Media", tooltip: "Media Gallery", Icon: Image, perm: "media" },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/settings/analytics", label: "Analytics", tooltip: "Analytics", Icon: TrendingUp, perm: "analytics" },
      { href: "/settings/audit-log", label: "Audit Log", tooltip: "Admin audit log", Icon: ScrollText, perm: "audit-log" },
    ],
  },
  {
    label: "Integration",
    items: [
      { href: "/settings/integrations/shopify", label: "Shopify Admin", tooltip: "Shopify Admin", Icon: Store, perm: "inventory" },
    ],
  },
];

function isNavActive(basePathname: string, href: string): boolean {
  if (href === "/settings") return basePathname === "/settings";
  return basePathname === href || basePathname.startsWith(`${href}/`);
}

/**
 * The active entry is the one whose href is the *longest* prefix of the current
 * path. Needed because flat siblings can share a prefix (e.g. `/settings/inventory`
 * and `/settings/inventory/configure`) — startsWith alone would light up both.
 */
function findActiveHref(basePathname: string, groups: NavGroup[]): string | null {
  let best: string | null = null;
  for (const group of groups) {
    for (const item of group.items) {
      for (const href of [item.href, ...(item.items ?? []).map((s) => s.href)]) {
        if (isNavActive(basePathname, href) && href.length > (best?.length ?? -1)) {
          best = href;
        }
      }
    }
  }
  return best;
}

/** An item is visible when its permission is granted (or it requires none). */
function canSee(item: NavItem, permissions: Permission[]): boolean {
  if (!item.perm) return true;
  return permissions.includes(item.perm);
}

/** A parent is visible when it or any of its children is visible. */
function itemVisible(item: NavItem, permissions: Permission[]): boolean {
  if (canSee(item, permissions)) return true;
  return (item.items ?? []).some((sub) => canSee(sub, permissions));
}

type AdminStatus = "checking" | "authed" | "unauth";

export function SettingsSidebarNav({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const basePathname = stripLocale(pathname);
  const to = (href: string) => withLocale(href, locale);

  const isLoginRoute = basePathname === "/settings/login";

  const [status, setStatus] = useState<AdminStatus>("checking");
  const [permissions, setPermissions] = useState<Permission[]>([]);

  useEffect(() => {
    if (isLoginRoute) return;
    let cancelled = false;
    fetch("/api/admin/context")
      .then((res) => res.json())
      .then((data: { signedIn?: boolean; permissions?: Permission[] }) => {
        if (cancelled) return;
        if (data?.signedIn) {
          setPermissions(Array.isArray(data.permissions) ? data.permissions : []);
          setStatus("authed");
        } else {
          setStatus("unauth");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("unauth");
      });
    return () => {
      cancelled = true;
    };
  }, [isLoginRoute]);

  // Redirect unauthorized visitors to the staff login.
  useEffect(() => {
    if (status === "unauth" && !isLoginRoute) {
      router.replace(to("/settings/login"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isLoginRoute]);

  // The staff login screen renders without the sidebar or the auth gate so
  // unauthenticated staff can sign in.
  if (isLoginRoute) {
    return <>{children}</>;
  }

  if (status !== "authed") {
    return (
      <div className="flex min-h-svh w-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const groups = NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => itemVisible(item, permissions)),
    }))
    .filter((group) => group.items.length > 0);

  const activeHref = findActiveHref(basePathname, NAV_GROUPS);

  const segments = basePathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "settings";
  const pageTitle = last === "settings"
    ? "Overview"
    : last
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="flex min-h-svh w-full">
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarContent>
            {groups.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarMenu>
                  {group.items.map(({ href, label, tooltip, Icon, items }) => {
                    const isActive = activeHref === href ||
                      (items?.some((sub) => sub.href === activeHref) ?? false);
                    const visibleSubs = (items ?? []).filter((sub) => canSee(sub, permissions));

                    return (
                      <SidebarMenuItem key={href}>
                        <SidebarMenuButton asChild tooltip={tooltip} isActive={isActive}>
                          <a href={to(href)}>
                            <Icon />
                            <span>{label}</span>
                          </a>
                        </SidebarMenuButton>

                        {visibleSubs.length ? (
                          <SidebarMenuSub>
                            {visibleSubs.map(({ href: subHref, label: subLabel, Icon: SubIcon, tooltip: subTooltip }) => (
                              <SidebarMenuSubItem key={subHref}>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={activeHref === subHref}
                                >
                                  <a href={to(subHref)} title={subTooltip}>
                                    <SubIcon />
                                    <span>{subLabel}</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        ) : null}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>
            ))}
          </SidebarContent>
          <SidebarRail />
        </Sidebar>
        <SidebarInset>
          <header className="flex h-14 items-center gap-2 border-b px-2 sm:px-3 md:px-6 lg:px-8">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href={to("/settings")}>Settings</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </header>
          <div className="px-2 py-4 sm:px-3 md:px-6 md:py-8 lg:px-8 lg:py-10">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
