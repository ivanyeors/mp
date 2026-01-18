"use client";

import { usePathname } from "next/navigation";
import { Boxes, Wrench, Settings2, CircleDollarSign, TrendingUp, Store, ClipboardList } from "lucide-react";
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
import SettingsAuthGate from "./auth-gate";

type NavItem = {
  href: string;
  label: string;
  tooltip: string;
  Icon: LucideIcon;
  items?: NavItem[];
};

const NAV_ITEMS: NavItem[] = [
  { href: "/settings", label: "General", tooltip: "General Settings", Icon: Settings2 },
  { href: "/settings/results", label: "Results", tooltip: "Mp-config Results", Icon: ClipboardList },
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
  { href: "/settings/analytics", label: "Analytics", tooltip: "Analytics", Icon: TrendingUp },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
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
            <SidebarGroup>
              <SidebarGroupLabel>Settings</SidebarGroupLabel>
              <SidebarMenu>
                {NAV_ITEMS.map(({ href, label, tooltip, Icon, items }) => {
                  const isActive =
                    href === "/settings"
                      ? pathname === "/settings"
                      : pathname === href || pathname.startsWith(`${href}/`);

                  return (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton asChild tooltip={tooltip} isActive={isActive}>
                        <a href={href}>
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
                                isActive={pathname === subHref}
                              >
                                <a href={subHref} title={subTooltip}>
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
                    <BreadcrumbLink href="/settings">Settings</BreadcrumbLink>
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
