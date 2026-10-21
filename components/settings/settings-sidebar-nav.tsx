"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Boxes, Wrench, Settings2, CircleDollarSign, HandCoins, TrendingUp, Store, ClipboardList,
  Newspaper, Image, LayoutDashboard, ShoppingBag, Handshake,
  ShoppingCart, UserCircle, Tag, Truck, KeyRound, Loader2, RotateCcw,
  ShieldCheck, ScrollText, HelpCircle, CalendarDays, FormInput,
  GitBranch, ClipboardCheck, Percent, Box,
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
          { href: "/settings/general", label: "API Configs", tooltip: "API Configurations", Icon: KeyRound },
          { href: "/settings/appointments", label: "Appointments", tooltip: "Appointment reminders", Icon: CalendarDays },
          { href: "/settings/users", label: "Users & permissions", tooltip: "Members, roles, staff profiles and Telegram", Icon: ShieldCheck },
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
        tooltip: "Product Management",
        Icon: ShoppingBag,
        items: [
          { href: "/settings/inventory/configure", label: "Configure", tooltip: "Configure BOM", Icon: Wrench },
          { href: "/settings/product-builder/rules-engine", label: "Rules Engine", tooltip: "Recommendation rule graphs", Icon: GitBranch },
        ],
      },
      { href: "/settings/customers", label: "Customers", tooltip: "Customer Management", Icon: UserCircle },
      { href: "/settings/results", label: "Results", tooltip: "Mp-config Results", Icon: ClipboardList },
      { href: "/settings/orders", label: "Orders", tooltip: "Order Management", Icon: ShoppingCart },
      { href: "/settings/rma", label: "Returns / RMA", tooltip: "Return requests", Icon: RotateCcw },
      { href: "/settings/discounts", label: "Discounts", tooltip: "Discount Codes", Icon: Tag },
      { href: "/settings/shipping", label: "Shipping", tooltip: "Shipping Methods", Icon: Truck },
    ],
  },
  {
    label: "Landing Site",
    items: [
      { href: "/settings/page-builder", label: "Page Builder", tooltip: "Customise landing page sections", Icon: LayoutDashboard },
      {
        href: "/settings/partners",
        label: "Partners",
        tooltip: "Studios & partner clinics",
        Icon: Handshake,
        items: [
          { href: "/settings/partner-applications", label: "Partner applications", tooltip: "Review partner applications", Icon: ClipboardCheck },
          { href: "/settings/partner-commissions", label: "Partner Commissions", tooltip: "Commission schemes", Icon: Percent },
        ],
      },
      { href: "/settings/blogs", label: "Blogs", tooltip: "Blog Management", Icon: Newspaper },
      { href: "/settings/faq", label: "FAQ", tooltip: "FAQ Management", Icon: HelpCircle },
      { href: "/settings/forms", label: "Forms", tooltip: "Discovery source and form option lists", Icon: FormInput },
      { href: "/settings/media", label: "Media", tooltip: "Media Gallery", Icon: Image },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/settings/analytics", label: "Analytics", tooltip: "Analytics", Icon: TrendingUp },
      { href: "/settings/audit-log", label: "Audit Log", tooltip: "Admin audit log", Icon: ScrollText },
    ],
  },
  {
    label: "Showroom",
    items: [
      { href: "/settings/showroom", label: "Showroom Model", tooltip: "3D model of the showroom unit", Icon: Box },
    ],
  },
  {
    label: "Integration",
    items: [
      { href: "/settings/integrations/shopify", label: "Shopify Link", tooltip: "Shopify Link", Icon: Store },
    ],
  },
];

/**
 * An item is visible when the permission its page is guarded by is granted.
 * The key comes from the permission catalog by href, so the sidebar and the
 * page guard cannot disagree; a page with no catalog entry is open to any Staff.
 */
function canSee(item: NavItem, permissions: Permission[]): boolean {
  const perm = permissionForHref(item.href);
  if (!perm) return true;
  return permissions.includes(perm);
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
      out.push({ href: item.href, label: item.label, tooltip: item.tooltip, Icon: item.Icon });
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
  /** The login's Staff profiles and who is at this device (slice 10). */
  workingAs?: WorkingAsState;
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
  // Work waiting in the Results queue, so staff see it without opening the page.
  const [resultsQueue, setResultsQueue] = useState(0);
  const [resultsStuck, setResultsStuck] = useState(0);
  // The current profile's follow-ups due today or overdue (CRM slice 06).
  const [followUpCounts, setFollowUpCounts] = useState<FollowUpCounts | null>(null);

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

  // Refetched per navigation (pathname dep) so the badge settles after an assign
  // without needing a poll. Best-effort: a failure just leaves the badge hidden.
  useEffect(() => {
    if (status !== "authed" || !permissions.includes("results")) return;
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
  }, [status, permissions, basePathname]);

  // Same for the Customers badge. Whose it is follows "Working as", so a switch
  // re-reads it too; with no profile chosen on a shared login it shows nothing.
  useEffect(() => {
    if (status !== "authed" || !permissions.includes("customers")) return;
    let cancelled = false;
    const read = () =>
      fetch("/api/settings/customers/followup-counts")
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { counts?: FollowUpCounts | null } | null) => {
          if (!cancelled && data) setFollowUpCounts(data.counts ?? null);
        })
        .catch(() => {});
    void read();
    // Who is at the device changed, or a follow-up was added, done or moved.
    const events = [WORKING_AS_CHANGED_EVENT, FOLLOW_UPS_CHANGED_EVENT];
    for (const e of events) window.addEventListener(e, read);
    return () => {
      cancelled = true;
      for (const e of events) window.removeEventListener(e, read);
    };
  }, [status, permissions, basePathname]);
  const customersBadge = followUpBadge(followUpCounts);

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

  // Re-read the Member's pages on each navigation after the first, so a role
  // changed mid-session drops its pages from the sidebar on the next click
  // instead of on the next full reload (the server layout is not re-run on a
  // client navigation). The page guards are the real boundary; this is chrome.
  const firstPath = useRef(basePathname);
  // The path the permissions above were read for: the first page (from the
  // server layout) or the last refetch. A redirect is only decided on
  // permissions that are current for this path, never on stale ones.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePathname]);

  // The current page is no longer in the Member's role: send them to the
  // Admin Panel home with the same notice a page guard gives.
  const currentKey = permissionForHref(findActiveHref(basePathname, NAV_GROUPS) ?? "");
  const lostCurrentPage =
    status === "authed" &&
    permissionsPath === basePathname &&
    !!currentKey &&
    !permissions.includes(currentKey);
  useEffect(() => {
    if (lostCurrentPage && currentKey) router.replace(to(`/settings?denied=${currentKey}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lostCurrentPage, currentKey]);

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
      {initialAuth?.workingAs ? <WorkingAsPicker initial={initialAuth.workingAs} /> : null}
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
                            {href === "/settings/customers" && customersBadge ? (
                              <SidebarMenuBadge
                                className={
                                  customersBadge.urgent
                                    ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                                    : undefined
                                }
                                title={customersBadge.title}
                              >
                                {customersBadge.total}
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
