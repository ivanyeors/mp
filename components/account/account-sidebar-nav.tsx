"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ClipboardList,
  Loader2,
  MapPin,
  ShoppingCart,
  UserRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
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
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type NavItem = {
  href: string;
  label: string;
  tooltip: string;
  Icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/account", label: "Profile", tooltip: "Profile", Icon: UserRound },
  { href: "/results", label: "Results", tooltip: "My results", Icon: ClipboardList },
  { href: "/account/orders", label: "Orders", tooltip: "Order history", Icon: ShoppingCart },
  { href: "/account/addresses", label: "Addresses", tooltip: "Saved addresses", Icon: MapPin },
];

type AuthStatus = "checking" | "authed" | "unauth";

function isResultsRoute(basePathname: string): boolean {
  return basePathname === "/results" || basePathname.startsWith("/results/");
}

function isNavActive(basePathname: string, href: string): boolean {
  if (href === "/account") return basePathname === "/account";
  if (href === "/results") return isResultsRoute(basePathname);
  return basePathname === href || basePathname.startsWith(`${href}/`);
}

function findActiveHref(basePathname: string): string | null {
  let best: string | null = null;
  for (const item of NAV_ITEMS) {
    if (isNavActive(basePathname, item.href) && item.href.length > (best?.length ?? -1)) {
      best = item.href;
    }
  }
  return best;
}

function buildCrumbs(basePathname: string): Array<{ label: string; href?: string }> {
  const path = basePathname.replace(/\/+$/, "") || "/account";

  if (path === "/account") return [{ label: "Account" }];

  if (path === "/results") {
    return [
      { label: "Account", href: "/account" },
      { label: "Results" },
    ];
  }

  if (path.startsWith("/results/")) {
    return [
      { label: "Account", href: "/account" },
      { label: "Results", href: "/results" },
      { label: "Status" },
    ];
  }

  const activeHref = findActiveHref(path);
  const crumbs: Array<{ label: string; href?: string }> = [
    { label: "Account", href: "/account" },
  ];

  if (activeHref && activeHref !== "/account") {
    const item = NAV_ITEMS.find((n) => n.href === activeHref);
    if (item) {
      const isExact = path === activeHref;
      crumbs.push(isExact ? { label: item.label } : { label: item.label, href: item.href });
    }
  }

  if (activeHref && path.startsWith(`${activeHref}/`)) {
    const rest = path.slice(activeHref.length + 1);
    const segment = rest.split("/")[0];
    if (segment) {
      crumbs.push({ label: decodeURIComponent(segment) });
    }
  }

  return crumbs;
}

/**
 * Customer account shell — same sidebar + inset pattern as settings.
 * Always requires auth (except /account/login). Results guests are handled by
 * the server results layout, which omits this shell entirely.
 */
export function AccountSidebarNav({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const basePathname = stripLocale(pathname);
  const to = (href: string) => withLocale(href, locale);

  const isLoginRoute = basePathname === "/account/login";
  const [status, setStatus] = useState<AuthStatus>(isLoginRoute ? "unauth" : "checking");

  useEffect(() => {
    if (isLoginRoute) return;
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setStatus(data.user ? "authed" : "unauth");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setStatus(session?.user ? "authed" : "unauth");
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [isLoginRoute]);

  useEffect(() => {
    if (status === "unauth" && !isLoginRoute) {
      router.replace(
        to(`/account/login?next=${encodeURIComponent(to(basePathname))}`),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isLoginRoute]);

  // Login: no shell. Stable tree — never flip between shell and bare children
  // for the same route (that caused "Rendered more hooks" in the App Router).
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

  const activeHref = findActiveHref(basePathname);
  const crumbs = buildCrumbs(basePathname);

  return (
    <div className="flex min-h-svh w-full">
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Account</SidebarGroupLabel>
              <SidebarMenu>
                {NAV_ITEMS.map(({ href, label, tooltip, Icon }) => (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      asChild
                      tooltip={tooltip}
                      isActive={activeHref === href}
                    >
                      <Link href={to(href)}>
                        <Icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarRail />
        </Sidebar>
        <SidebarInset>
          <header className="flex h-14 min-w-0 items-center gap-2 border-b px-4 sm:px-6 md:px-8 lg:px-10">
            <SidebarTrigger />
            <div className="min-w-0 flex-1">
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
                              <Link
                                href={to(crumb.href)}
                                className="truncate"
                                title={crumb.label}
                              >
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
            </div>
            <Button asChild variant="ghost" size="icon" className="shrink-0">
              <Link href={to("/")} aria-label="Close account">
                <X className="h-4 w-4" />
              </Link>
            </Button>
          </header>
          {/* pb clears the marketing dock that still shows on account routes */}
          <div className="px-4 py-6 pb-[calc(1.5rem+var(--app-dock-clearance))] sm:px-6 md:px-8 md:py-8 md:pb-28 lg:px-10 lg:py-10">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
