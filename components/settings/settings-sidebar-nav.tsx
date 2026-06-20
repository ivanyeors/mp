"use client";

import { usePathname } from "next/navigation";
import {
  Boxes, Wrench, Settings2, CircleDollarSign, TrendingUp, Store, ClipboardList,
  Users, Newspaper, Image, LayoutDashboard, ShoppingBag,
  FolderTree, ShoppingCart, UserCircle, Tag, Truck, KeyRound,
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
import SettingsAuthGate from "@/app/[lang]/settings/auth-gate";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, stripLocale, withLocale } from "@/lib/i18n/routing";

type NavItem = {
  href: string;
  label: string;
  tooltip: string;
  Icon: LucideIcon;
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
          { href: "/settings/general", label: "API Configs", tooltip: "API Configurations", Icon: KeyRound },
          { href: "/settings/staff-management", label: "Staff Management", tooltip: "Staff Management", Icon: Users },
        ],
      },
    ],
  },
  {
    label: "Store",
    items: [
      {
        href: "/settings/products",
        label: "Products",
        tooltip: "Product Management",
        Icon: ShoppingBag,
        items: [
          { href: "/settings/categories", label: "Categories", tooltip: "Product Categories", Icon: FolderTree },
        ],
      },
      {
        href: "/settings/orders",
        label: "Orders",
        tooltip: "Order Management",
        Icon: ShoppingCart,
        items: [
          { href: "/settings/results", label: "Results", tooltip: "Mp-config Results", Icon: ClipboardList },
          { href: "/settings/customers", label: "Customers", tooltip: "Customer Management", Icon: UserCircle },
        ],
      },
      { href: "/settings/discounts", label: "Discounts", tooltip: "Discount Codes", Icon: Tag },
      { href: "/settings/shipping", label: "Shipping", tooltip: "Shipping Methods", Icon: Truck },
    ],
  },
  {
    label: "Inventory",
    items: [
      {
        href: "/settings/inventory",
        label: "Inventory",
        tooltip: "Inventory",
        Icon: Boxes,
        items: [
          { href: "/settings/inventory/shopify", label: "Shopify Admin", tooltip: "Shopify Admin", Icon: Store },
          { href: "/settings/inventory/configure", label: "Configure", tooltip: "Configure BOM", Icon: Wrench },
        ],
      },
      { href: "/settings/costings", label: "Costings", tooltip: "Costings", Icon: CircleDollarSign },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/settings/analytics", label: "Analytics", tooltip: "Analytics", Icon: TrendingUp },
    ],
  },
  {
    label: "Landing Site",
    items: [
      { href: "/settings/page-builder", label: "Page Builder", tooltip: "Customise landing page sections", Icon: LayoutDashboard },
      { href: "/settings/blogs", label: "Blogs", tooltip: "Blog Management", Icon: Newspaper },
      { href: "/settings/media", label: "Media", tooltip: "Media Gallery", Icon: Image },
    ],
  },
];

function isNavActive(basePathname: string, href: string): boolean {
  if (href === "/settings") return basePathname === "/settings";
  return basePathname === href || basePathname.startsWith(`${href}/`);
}

export function SettingsSidebarNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const basePathname = stripLocale(pathname);
  const to = (href: string) => withLocale(href, locale);

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
            {NAV_GROUPS.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarMenu>
                  {group.items.map(({ href, label, tooltip, Icon, items }) => {
                    const isActive = isNavActive(basePathname, href) ||
                      (items?.some((sub) => isNavActive(basePathname, sub.href)) ?? false);

                    return (
                      <SidebarMenuItem key={href}>
                        <SidebarMenuButton asChild tooltip={tooltip} isActive={isActive}>
                          <a href={to(href)}>
                            <Icon />
                            <span>{label}</span>
                          </a>
                        </SidebarMenuButton>

                        {items?.length ? (
                          <SidebarMenuSub>
                            {items.map(({ href: subHref, label: subLabel, Icon: SubIcon, tooltip: subTooltip }) => (
                              <SidebarMenuSubItem key={subHref}>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={isNavActive(basePathname, subHref)}
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
            <SettingsAuthGate>{children}</SettingsAuthGate>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
