"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Boxes, Wrench, Settings2, CircleDollarSign, TrendingUp, Store, ClipboardList,
  Users, Newspaper, Image, LayoutDashboard, ShoppingBag, Handshake,
  ShoppingCart, UserCircle, Tag, Truck, KeyRound, Loader2, RotateCcw,
  ShieldCheck, ScrollText, HelpCircle, CalendarDays, FormInput, Shapes,
  GitBranch, ClipboardCheck, Percent,
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { subscribeAdminPanelMenu } from "@/lib/auth/admin-panel-menu";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, stripLocale, withLocale } from "@/lib/i18n/routing";
import type { Permission } from "@/lib/auth/permissions";
import {
  SettingsBreadcrumbProvider,
  useSettingsBreadcrumbDetailLabel,
} from "@/components/settings/settings-breadcrumb-context";
import {
  buildSettingsBreadcrumbs,
  findActiveHref,
} from "@/components/settings/settings-breadcrumbs";

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
    label: "Admin Panel",
    items: [
      {
        href: "/settings",
        label: "General",
        tooltip: "General Settings",
        Icon: Settings2,
        items: [
          { href: "/settings/general", label: "API Configs", tooltip: "API Configurations", Icon: KeyRound, perm: "api-configs" },
          { href: "/settings/appointments", label: "Appointments", tooltip: "Appointment reminders", Icon: CalendarDays, perm: "results" },
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
        perm: "products",
        items: [
          { href: "/settings/inventory/configure", label: "Configure", tooltip: "Configure BOM", Icon: Wrench, perm: "inventory" },
          { href: "/settings/product-builder", label: "Product Builder", tooltip: "Configurator overlay mapping", Icon: Shapes, perm: "page-builder" },
          { href: "/settings/product-builder/rules-engine", label: "Rules Engine", tooltip: "Recommendation rule graphs", Icon: GitBranch, perm: "page-builder" },
        ],
      },
      { href: "/settings/customers", label: "Customers", tooltip: "Customer Management", Icon: UserCircle, perm: "customers" },
      { href: "/settings/results", label: "Results", tooltip: "Mp-config Results", Icon: ClipboardList, perm: "results" },
      { href: "/settings/orders", label: "Orders", tooltip: "Order Management", Icon: ShoppingCart, perm: "orders" },
      { href: "/settings/rma", label: "Returns / RMA", tooltip: "Return requests", Icon: RotateCcw, perm: "orders" },
      { href: "/settings/discounts", label: "Discounts", tooltip: "Discount Codes", Icon: Tag, perm: "discounts" },
      { href: "/settings/shipping", label: "Shipping", tooltip: "Shipping Methods", Icon: Truck, perm: "shipping" },
    ],
  },
  {
    label: "Landing Site",
    items: [
      { href: "/settings/page-builder", label: "Page Builder", tooltip: "Customise landing page sections", Icon: LayoutDashboard, perm: "page-builder" },
      {
        href: "/settings/partners",
        label: "Partners",
        tooltip: "Studios & partner clinics",
        Icon: Handshake,
        perm: "page-builder",
        items: [
          { href: "/settings/partner-applications", label: "Partner applications", tooltip: "Review partner applications", Icon: ClipboardCheck, perm: "page-builder" },
          { href: "/settings/partner-commissions", label: "Partner Commissions", tooltip: "Commission schemes", Icon: Percent, perm: "page-builder" },
        ],
      },
      { href: "/settings/blogs", label: "Blogs", tooltip: "Blog Management", Icon: Newspaper, perm: "blogs" },
      { href: "/settings/faq", label: "FAQ", tooltip: "FAQ Management", Icon: HelpCircle, perm: "page-builder" },
      { href: "/settings/forms", label: "Forms", tooltip: "Discovery source and form option lists", Icon: FormInput, perm: "page-builder" },
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
      { href: "/settings/integrations/shopify", label: "Shopify Link", tooltip: "Shopify Link", Icon: Store, perm: "inventory" },
    ],
  },
];

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

/** Flatten nested items into peers for the mobile icon grid. */
function flattenNavItems(items: NavItem[], permissions: Permission[]): NavItem[] {
  const out: NavItem[] = [];
  for (const item of items) {
    if (!itemVisible(item, permissions)) continue;
    if (canSee(item, permissions)) {
      out.push({ href: item.href, label: item.label, tooltip: item.tooltip, Icon: item.Icon, perm: item.perm });
    }
    for (const sub of item.items ?? []) {
      if (canSee(sub, permissions)) out.push(sub);
    }
  }
  return out;
}

type AdminStatus = "checking" | "authed" | "unauth";

/**
 * Staff session resolved by the server layout. When present the shell renders
 * the page immediately; the client-side `/api/admin/context` fetch is only a
 * fallback for callers that mount the nav without it.
 */
export type SettingsInitialAuth = {
  signedIn: boolean;
  permissions: Permission[];
};

export function SettingsSidebarNav({
  children,
  initialAuth,
}: {
  children: React.ReactNode;
  initialAuth?: SettingsInitialAuth;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const basePathname = stripLocale(pathname);
  const to = (href: string) => withLocale(href, locale);
  const isMobile = useIsMobile();

  const isLoginRoute = basePathname === "/settings/login";

  const [status, setStatus] = useState<AdminStatus>(() => {
    if (!initialAuth) return "checking";
    return initialAuth.signedIn ? "authed" : "unauth";
  });
  const [permissions, setPermissions] = useState<Permission[]>(
    () => initialAuth?.permissions ?? [],
  );
  const [menuOpen, setMenuOpen] = useState(false);

  // Keep in sync if the server re-renders the layout with a new session
  // (e.g. after sign-in redirects back into the Admin Panel).
  const initialSignedIn = initialAuth?.signedIn;
  const initialPermissionKey = initialAuth?.permissions.join(",");
  useEffect(() => {
    if (!initialAuth) return;
    setStatus(initialAuth.signedIn ? "authed" : "unauth");
    setPermissions(initialAuth.permissions);
    // Compare by value: the layout passes a fresh object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSignedIn, initialPermissionKey]);

  useEffect(() => {
    if (!isMobile) return;
    return subscribeAdminPanelMenu(() => setMenuOpen(true));
  }, [isMobile]);

  useEffect(() => {
    if (isLoginRoute || initialAuth) return;
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
  }, [isLoginRoute, initialAuth]);

  // Redirect unauthorized visitors to unified Sign in (preserve deep link).
  useEffect(() => {
    if (status === "unauth" && !isLoginRoute) {
      router.replace(
        to(`/account/login?next=${encodeURIComponent(to(basePathname))}`),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isLoginRoute]);

  // Legacy /settings/login only redirects; keep bare shell if it still renders.
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

  const header = (
    <header className="flex h-14 min-w-0 items-center gap-2 border-b px-2 sm:px-3 md:px-6 lg:px-8">
      {/* Trigger is desktop chrome; hide with CSS so the server render matches every viewport. */}
      <div className="hidden md:contents">
        <SidebarTrigger />
      </div>
      <div className="min-w-0 flex-1">
        <SettingsBreadcrumbTrail basePathname={basePathname} to={to} />
      </div>
    </header>
  );

  // Mobile nav is a bottom sheet of tiles, opened from the dock menu.
  const mobileMenu = (
    <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
      <SheetContent
        side="bottom"
        mobilePreset="quick"
        className="max-h-[85svh] gap-0 px-0"
      >
        <SheetHeader className="px-4 pb-2 pt-1">
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <div className="overflow-y-auto px-3 pb-[calc(4rem+var(--safe-bottom))]">
          {groups.map((group) => {
            const tiles = flattenNavItems(group.items, permissions);
            if (!tiles.length) return null;
            return (
              <div key={group.label} className="mb-4">
                <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {tiles.map(({ href, label, tooltip, Icon }) => {
                    const isActive = activeHref === href;
                    return (
                      <Link
                        key={href}
                        href={to(href)}
                        title={tooltip}
                        onClick={() => setMenuOpen(false)}
                        className={cn(
                          "flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-center text-sm font-medium transition-colors",
                          isActive
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-foreground hover:bg-accent"
                        )}
                      >
                        <Icon className="size-6 shrink-0" />
                        <span className="line-clamp-2 leading-tight">{label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );

  // One tree for every viewport. The desktop sidebar is hidden below `md` with
  // CSS rather than by branching on `useIsMobile()`, which is false during the
  // server render and made phones paint the desktop shell before swapping.
  return (
    <SettingsBreadcrumbProvider>
      <div className="flex min-h-svh w-full min-w-0 overflow-x-clip md:overflow-x-visible">
        <SidebarProvider>
          {/* shadcn's Sidebar root is `hidden md:block`, so it already stays out of the
              mobile paint; keep it a direct sibling of SidebarInset for the peer styles. */}
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
                              <Link href={to(href)}>
                                <Icon />
                                <span>{label}</span>
                              </Link>
                            </SidebarMenuButton>
                            {href === "/settings/results" && resultsQueue > 0 ? (
                              <SidebarMenuBadge
                                className={
                                  resultsStuck > 0
                                    ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                                    : undefined
                                }
                                title={
                                  resultsStuck > 0
                                    ? `${resultsStuck} stuck, ${resultsQueue - resultsStuck} awaiting assignment`
                                    : `${resultsQueue} awaiting assignment`
                                }
                              >
                                {resultsQueue}
                              </SidebarMenuBadge>
                            ) : null}

                            {visibleSubs.length ? (
                              <SidebarMenuSub>
                                {visibleSubs.map(({ href: subHref, label: subLabel, Icon: SubIcon, tooltip: subTooltip }) => (
                                  <SidebarMenuSubItem key={subHref}>
                                    <SidebarMenuSubButton
                                      asChild
                                      isActive={activeHref === subHref}
                                    >
                                      <Link href={to(subHref)} title={subTooltip}>
                                        <SubIcon />
                                        <span>{subLabel}</span>
                                      </Link>
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
          <SidebarInset className="min-w-0">
            {header}
            <div className="min-w-0 max-w-full px-2 pt-3 pb-[calc(0.75rem+var(--app-dock-clearance))] sm:px-3 md:px-6 md:py-8 lg:px-8 lg:py-10">
              {children}
            </div>
          </SidebarInset>
          {mobileMenu}
        </SidebarProvider>
      </div>
    </SettingsBreadcrumbProvider>
  );
}

function SettingsBreadcrumbTrail({
  basePathname,
  to,
}: {
  basePathname: string;
  to: (href: string) => string;
}) {
  const detailLabel = useSettingsBreadcrumbDetailLabel();
  const crumbs = buildSettingsBreadcrumbs(basePathname, NAV_GROUPS, detailLabel);

  return (
    <Breadcrumb>
      <BreadcrumbList className="flex-nowrap overflow-hidden">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <Fragment key={`${crumb.label}-${i}`}>
              {i > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem className={isLast ? "min-w-0" : "shrink-0"}>
                {isLast || !crumb.href ? (
                  <BreadcrumbPage className="truncate" title={crumb.label}>
                    {crumb.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={to(crumb.href)} className="truncate" title={crumb.label}>
                      {crumb.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
