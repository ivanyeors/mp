"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Boxes, Wrench, Settings2, CircleDollarSign, HandCoins, TrendingUp, Store, ClipboardList,
  Newspaper, Image, LayoutDashboard, ShoppingBag, Handshake,
  ShoppingCart, UserCircle, Mail, MailCheck, Funnel, Tag, Truck, KeyRound, Loader2, RotateCcw,
  ShieldCheck, ScrollText, HelpCircle, CalendarDays, FormInput,
  GitBranch, ClipboardCheck, Percent, Box, BookOpen, X,
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
  SidebarMenuBadge,
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
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { subscribeAdminPanelMenu } from "@/lib/auth/admin-panel-menu";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, stripLocale, withLocale } from "@/lib/i18n/routing";
import { permissionForHref, type Permission } from "@/lib/auth/permissions";
import {
  SettingsBreadcrumbProvider,
  useSettingsBreadcrumbDetailLabel,
} from "@/components/settings/settings-breadcrumb-context";
import {
  WORKING_AS_CHANGED_EVENT,
  WorkingAsPicker,
  type WorkingAsState,
} from "@/components/settings/working-as-picker";
import { FOLLOW_UPS_CHANGED_EVENT, followUpBadge, type FollowUpCounts } from "@/lib/crm/followup-badge";
import {
  buildSettingsBreadcrumbs,
  findActiveHref,
} from "@/components/settings/settings-breadcrumbs";

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

type NavBadge = { count: number; urgent: boolean; title: string };

const BADGE_URGENT = "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Admin Panel",
    items: [
      {
        href: "/settings",
        label: "General",
        tooltip: "General",
        Icon: Settings2,
        items: [
          { href: "/settings/general", label: "API configs", tooltip: "API configurations", Icon: KeyRound },
          { href: "/settings/appointments", label: "Appointments", tooltip: "Booking calendar", Icon: CalendarDays },
          { href: "/settings/users", label: "Users & permissions", tooltip: "Members, roles, staff profiles and Telegram", Icon: ShieldCheck },
        ],
      },
      { href: "/settings/docs", label: "Documentation", tooltip: "How the platform works", Icon: BookOpen },
    ],
  },
  {
    label: "CRM",
    items: [
      { href: "/settings/customers", label: "Customers", tooltip: "Profiles, segments, follow-ups and reviews", Icon: UserCircle },
      { href: "/settings/results", label: "Results", tooltip: "Customisation submissions", Icon: ClipboardList },
      { href: "/settings/orders", label: "Orders", tooltip: "Payment, fulfilment and delivery", Icon: ShoppingCart },
      { href: "/settings/rma", label: "Returns / RMA", tooltip: "Return requests", Icon: RotateCcw },
      {
        href: "/settings/campaigns",
        label: "Email campaigns",
        tooltip: "Write and send marketing email",
        Icon: Mail,
        items: [
          { href: "/settings/campaigns/funnel", label: "Funnel", tooltip: "Every email we send by itself, by lifecycle stage", Icon: Funnel },
          { href: "/settings/email-templates", label: "Email templates", tooltip: "Wording of every customer and partner email", Icon: MailCheck },
        ],
      },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/settings/inventory", label: "Inventory", tooltip: "Inventory", Icon: Boxes },
      {
        href: "/settings/costings",
        label: "Costings",
        tooltip: "Costings",
        Icon: CircleDollarSign,
        items: [
          { href: "/settings/costings/services", label: "Service fees", tooltip: "Measurement and re-adjustment fees", Icon: HandCoins },
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
        tooltip: "Storefront products",
        Icon: ShoppingBag,
        items: [
          { href: "/settings/inventory/configure", label: "Configure", tooltip: "Configure BOM", Icon: Wrench },
          { href: "/settings/product-builder/rules-engine", label: "Rules Engine", tooltip: "Recommendation rule graphs", Icon: GitBranch },
        ],
      },
      { href: "/settings/discounts", label: "Discounts", tooltip: "Discount codes and points", Icon: Tag },
      { href: "/settings/shipping", label: "Shipping", tooltip: "Shipping methods", Icon: Truck },
    ],
  },
  {
    label: "Landing site",
    items: [
      { href: "/settings/page-builder", label: "Page Builder", tooltip: "Customise landing page sections", Icon: LayoutDashboard },
      {
        href: "/settings/partners",
        label: "Partners",
        tooltip: "Studios & partner clinics",
        Icon: Handshake,
        items: [
          { href: "/settings/partner-applications", label: "Partner applications", tooltip: "Review partner applications", Icon: ClipboardCheck },
          { href: "/settings/partner-commissions", label: "Partner commissions", tooltip: "Commission schemes", Icon: Percent },
        ],
      },
      { href: "/settings/blogs", label: "Blogs", tooltip: "Blog posts", Icon: Newspaper },
      { href: "/settings/faq", label: "FAQ", tooltip: "FAQ", Icon: HelpCircle },
      { href: "/settings/forms", label: "Forms", tooltip: "Discovery source and form options", Icon: FormInput },
      { href: "/settings/media", label: "Media", tooltip: "Media library", Icon: Image },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/settings/analytics", label: "Analytics", tooltip: "Analytics", Icon: TrendingUp },
      { href: "/settings/audit-log", label: "Audit log", tooltip: "Who changed what", Icon: ScrollText },
    ],
  },
  {
    label: "Showroom",
    items: [
      { href: "/settings/showroom", label: "Showroom model", tooltip: "3D model of the showroom unit", Icon: Box },
    ],
  },
  {
    label: "Integration",
    items: [
      { href: "/settings/integrations/shopify", label: "Shopify link", tooltip: "Shopify link", Icon: Store },
    ],
  },
];

export function canOpen(href: string, permissions: Permission[]): boolean {
  const perm = permissionForHref(href);
  if (!perm) return true;
  return permissions.includes(perm);
}

function canSee(item: NavItem, permissions: Permission[]): boolean {
  return canOpen(item.href, permissions);
}

export function visibleItems(items: NavItem[], permissions: Permission[]): NavItem[] {
  return items.flatMap((item) => {
    const subs = (item.items ?? []).filter((sub) => canSee(sub, permissions));
    if (canSee(item, permissions)) return [{ ...item, items: subs }];
    return subs;
  });
}

function flattenNavItems(items: NavItem[]): NavItem[] {
  return items.flatMap(({ items: subs, ...item }) => [item, ...(subs ?? [])]);
}

type AdminStatus = "authed" | "unauth";

export type SettingsInitialAuth = {
  signedIn: boolean;
  permissions: Permission[];
  workingAs?: WorkingAsState;
};

export function SettingsSidebarNav({
  children,
  initialAuth,
}: {
  children: React.ReactNode;
  initialAuth: SettingsInitialAuth;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const basePathname = stripLocale(pathname);
  const to = (href: string) => withLocale(href, locale);
  const isMobile = useIsMobile();

  const isLoginRoute = basePathname === "/settings/login";

  const [status, setStatus] = useState<AdminStatus>(initialAuth.signedIn ? "authed" : "unauth");
  const [permissions, setPermissions] = useState<Permission[]>(initialAuth.permissions);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resultsQueue, setResultsQueue] = useState(0);
  const [resultsStuck, setResultsStuck] = useState(0);
  const [followUpCounts, setFollowUpCounts] = useState<FollowUpCounts | null>(null);

  const initialAuthKey = `${initialAuth.signedIn}|${initialAuth.permissions.join(",")}`;
  const [seenAuthKey, setSeenAuthKey] = useState(initialAuthKey);
  if (initialAuthKey !== seenAuthKey) {
    setSeenAuthKey(initialAuthKey);
    setStatus(initialAuth.signedIn ? "authed" : "unauth");
    setPermissions(initialAuth.permissions);
  }

  useEffect(() => {
    if (!isMobile) return;
    return subscribeAdminPanelMenu(() => setMenuOpen(true));
  }, [isMobile]);

  const canResults = permissions.includes("results");
  const canCustomers = permissions.includes("customers");
  useEffect(() => {
    if (status !== "authed" || !canResults) return;
    let cancelled = false;
    fetch("/api/results/queue-counts")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { needsAssign?: number; stuck?: number } | null) => {
        if (cancelled || !data) return;
        setResultsQueue((data.needsAssign ?? 0) + (data.stuck ?? 0));
        setResultsStuck(data.stuck ?? 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status, canResults, basePathname]);

  useEffect(() => {
    if (status !== "authed" || !canCustomers) return;
    let cancelled = false;
    const read = () =>
      fetch("/api/settings/customers/followup-counts")
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { counts?: FollowUpCounts | null } | null) => {
          if (!cancelled && data) setFollowUpCounts(data.counts ?? null);
        })
        .catch(() => {});
    void read();
    const events = [WORKING_AS_CHANGED_EVENT, FOLLOW_UPS_CHANGED_EVENT];
    for (const e of events) window.addEventListener(e, read);
    return () => {
      cancelled = true;
      for (const e of events) window.removeEventListener(e, read);
    };
  }, [status, canCustomers, basePathname]);
  const customersBadge = followUpBadge(followUpCounts);

  const firstPath = useRef(basePathname);
  const [permissionsPath, setPermissionsPath] = useState(basePathname);
  useEffect(() => {
    if (isLoginRoute || status !== "authed" || basePathname === firstPath.current) return;
    firstPath.current = "";
    const path = basePathname;
    let cancelled = false;
    fetch("/api/admin/context")
      .then((res) => res.json())
      .then((data: { signedIn?: boolean; permissions?: Permission[] }) => {
        if (cancelled) return;
        if (!data?.signedIn) return setStatus("unauth");
        setPermissions(Array.isArray(data.permissions) ? data.permissions : []);
        setPermissionsPath(path);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [basePathname]);

  const currentKey = permissionForHref(findActiveHref(basePathname, NAV_GROUPS) ?? "");
  const lostCurrentPage =
    status === "authed" &&
    permissionsPath === basePathname &&
    !!currentKey &&
    !permissions.includes(currentKey);
  const leaveTo =
    status === "unauth" && !isLoginRoute
      ? to(`/account/login?next=${encodeURIComponent(to(basePathname))}`)
      : lostCurrentPage && currentKey
        ? to(`/settings?denied=${currentKey}`)
        : null;
  useEffect(() => {
    if (leaveTo) router.replace(leaveTo);
  }, [leaveTo]);

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
    .map((group) => ({ ...group, items: visibleItems(group.items, permissions) }))
    .filter((group) => group.items.length > 0);

  const activeHref = findActiveHref(basePathname, NAV_GROUPS);

  const badges = new Map<string, NavBadge>();
  if (resultsQueue > 0) {
    badges.set("/settings/results", {
      count: resultsQueue,
      urgent: resultsStuck > 0,
      title:
        resultsStuck > 0
          ? `${resultsStuck} stuck, ${resultsQueue - resultsStuck} awaiting assignment`
          : `${resultsQueue} awaiting assignment`,
    });
  }
  if (customersBadge) {
    badges.set("/settings/customers", {
      count: customersBadge.total,
      urgent: customersBadge.urgent,
      title: customersBadge.title,
    });
  }

  const header = (
    <header className="flex h-14 min-w-0 items-center gap-2 border-b px-3 md:px-6 lg:px-8">
      <div className="hidden md:contents">
        <SidebarTrigger />
      </div>
      <div className="min-w-0 flex-1">
        <SettingsBreadcrumbTrail basePathname={basePathname} to={to} permissions={permissions} />
      </div>
      {initialAuth.workingAs ? <WorkingAsPicker initial={initialAuth.workingAs} /> : null}
    </header>
  );

  const mobileMenu = (
    <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
      <SheetContent
        side="bottom"
        mobilePreset="quick"
        hideClose
        className="max-h-[85svh] gap-0 px-0"
      >
        <SheetHeader className="flex-row items-center justify-between px-4 pb-1 pt-0">
          <SheetTitle>Menu</SheetTitle>
          <SheetClose
            className="-mr-2 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground active:bg-press"
            aria-label="Close menu"
          >
            <X className="size-5" aria-hidden />
          </SheetClose>
        </SheetHeader>
        <div className="overflow-y-auto px-3 pb-[calc(1rem+var(--safe-bottom))]">
          {groups.map((group) => (
            <div key={group.label} className="mb-3">
              <p className="mb-1.5 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {flattenNavItems(group.items).map(({ href, label, tooltip, Icon }) => {
                  const isActive = activeHref === href;
                  const badge = badges.get(href);
                  return (
                    <Link
                      key={href}
                      href={to(href)}
                      title={badge ? `${tooltip}. ${badge.title}` : tooltip}
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        "relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center text-xs font-medium transition-colors active:bg-press",
                        isActive
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-foreground hover:bg-accent"
                      )}
                    >
                      <Icon className="size-5 shrink-0" />
                      <span className="line-clamp-2 leading-tight">{label}</span>
                      {badge ? (
                        <span
                          className={cn(
                            "absolute right-1 top-1 min-w-5 rounded-md px-1 text-xs font-medium tabular-nums",
                            badge.urgent ? BADGE_URGENT : "bg-muted text-foreground",
                          )}
                        >
                          {badge.count}
                          <span className="sr-only">. {badge.title}</span>
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );

  return (
    <SettingsBreadcrumbProvider>
      <div className="flex min-h-svh w-full min-w-0 overflow-x-clip md:overflow-x-visible [-webkit-tap-highlight-color:transparent]">
        <SidebarProvider>
          <Sidebar collapsible="icon">
              <SidebarContent>
                {groups.map((group) => (
                  <SidebarGroup key={group.label}>
                    <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                    <SidebarMenu>
                      {group.items.map(({ href, label, tooltip, Icon, items }) => {
                        const subs = items ?? [];
                        const isActive = activeHref === href || subs.some((sub) => sub.href === activeHref);
                        const badge = badges.get(href);

                        return (
                          <SidebarMenuItem key={href}>
                            <SidebarMenuButton asChild tooltip={tooltip} isActive={isActive}>
                              <Link href={to(href)}>
                                <Icon />
                                <span>{label}</span>
                              </Link>
                            </SidebarMenuButton>
                            {badge ? (
                              <SidebarMenuBadge
                                className={badge.urgent ? BADGE_URGENT : undefined}
                                title={badge.title}
                              >
                                {badge.count}
                              </SidebarMenuBadge>
                            ) : null}

                            {subs.length ? (
                              <SidebarMenuSub>
                                {subs.map(({ href: subHref, label: subLabel, Icon: SubIcon, tooltip: subTooltip }) => (
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
            <div className="min-w-0 max-w-full px-3 pt-3 pb-[calc(0.75rem+var(--app-dock-clearance))] max-md:[--card-gap:1rem] max-md:[--card-px:1rem] max-md:[--card-py:1rem] md:px-6 md:py-8 lg:px-8 lg:py-10">
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
  permissions,
}: {
  basePathname: string;
  to: (href: string) => string;
  permissions: Permission[];
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
                {isLast || !crumb.href || !canOpen(crumb.href, permissions) ? (
                  <BreadcrumbPage className="truncate" title={crumb.label}>
                    {crumb.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={to(crumb.href)} className="block truncate py-3 active:opacity-60" title={crumb.label}>
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
