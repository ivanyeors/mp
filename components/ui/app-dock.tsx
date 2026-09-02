'use client';

import * as React from "react";
import { Dock, DockIcon, DockItem, DockLabel } from "@/components/ui/shadcn-io/dock";
import {
  Cylinder,
  Home,
  LogOut,
  Menu,
  Ruler,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import type { BubbleMenuItem } from "@/components/ui/bubble-menu";
import { openAdminPanelMenu } from "@/lib/auth/admin-panel-menu";
import {
  isAdminPanelDockPath,
  landingAuthPill,
  resolveDockSessionRole,
  type DockSessionRole,
} from "@/lib/auth/dock-chrome";
import { useIsMobile } from "@/hooks/use-mobile";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, stripLocale, withLocale } from "@/lib/i18n/routing";
import { isNearDocumentBottom } from "@/components/ui/app-dock-visibility";

const BubbleMenu = dynamic(
  () => import("@/components/ui/bubble-menu").then((m) => m.BubbleMenu),
  { ssr: false },
);
const BasicMpillowLearnMoreSheet = dynamic(
  () =>
    import("@/components/slide-in-pages/basic-mpillow-learn-more-slide-in").then(
      (m) => m.BasicMpillowLearnMoreSheet,
    ),
  { ssr: false },
);
const PremiumLearnMoreSheet = dynamic(
  () =>
    import("@/components/slide-in-pages/premium-learn-more-dialog").then(
      (m) => m.PremiumLearnMoreSheet,
    ),
  { ssr: false },
);
const MbolsterLearnMoreSheet = dynamic(
  () =>
    import("@/components/slide-in-pages/mbolster-learn-more-slide-in").then(
      (m) => m.MbolsterLearnMoreSheet,
    ),
  { ssr: false },
);
const CervicalNeckSupportSheet = dynamic(
  () =>
    import("@/components/slide-in-pages/cervical-neck-support").then(
      (m) => m.CervicalNeckSupportSheet,
    ),
  { ssr: false },
);

const dockItems = [
  {
    title: "Home",
    icon: Home,
    href: "/",
  },
  {
    title: "Mpillow Config",
    icon: Ruler,
    href: "/mp-config",
  },
  {
    title: "Bolster Config",
    icon: Cylinder,
    href: "/mbolster-config",
  },
];

const ROTATIONS = [-8, 8, 8, -8, 8, -8, 8, -8];

// Issue #59: give each dock item a ≥44px tap target on mobile via the wrapper.
// DockLabel + magnify stay desktop-only enhancements (mouse-hover, unchanged).
const dockTouchWrapClassName =
  "flex flex-col items-center max-md:min-h-11 max-md:min-w-11 max-md:justify-center";

export function AppDock() {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const basePathname = stripLocale(pathname);
  const to = (href: string) => withLocale(href, locale);
  const adminDock = isAdminPanelDockPath(basePathname);
  const isMobile = useIsMobile();

  const [isHidden, setIsHidden] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [role, setRole] = React.useState<DockSessionRole>("guest");

  const [basicOpen, setBasicOpen] = React.useState(false);
  const [premiumOpen, setPremiumOpen] = React.useState(false);
  const [mbolsterOpen, setMbolsterOpen] = React.useState(false);

  // Dock persists across navigation (root layout). Close any learn-more sheet on
  // route change so booking (pill overlay → /appointments) can't leave a drawer
  // stacked over the destination page — the slice-05 dupe, relocated.
  React.useEffect(() => {
    setBasicOpen(false);
    setPremiumOpen(false);
    setMbolsterOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    let lastY = window.scrollY;

    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY;

      if (
        y < 24 ||
        isNearDocumentBottom(
          window.innerHeight,
          y,
          document.documentElement.scrollHeight,
        )
      ) {
        setIsHidden(false);
        lastY = y;
        return;
      }

      if (delta > 6) setIsHidden(true);
      if (delta < -6) setIsHidden(false);

      lastY = y;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  React.useEffect(() => {
    if (adminDock) return;
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();

    const refresh = async () => {
      const [{ data }, adminJson, partnerJson] = await Promise.all([
        supabase.auth.getUser(),
        fetch("/api/admin/context")
          .then((r) => r.json() as Promise<{ signedIn?: boolean }>)
          .catch(() => null),
        fetch("/api/partner/context")
          .then((r) => r.json() as Promise<{ isPartner?: boolean }>)
          .catch(() => null),
      ]);
      if (cancelled) return;
      setRole(
        resolveDockSessionRole(
          Boolean(data.user),
          Boolean(adminJson?.signedIn),
          Boolean(partnerJson?.isPartner),
        ),
      );
    };

    void refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [adminDock]);

  const isMenuActive =
    basePathname === "/settings" ||
    basePathname === "/account" ||
    basePathname === "/account/login" ||
    basePathname === "/shop" ||
    basePathname === "/blog" ||
    basePathname === "/support" ||
    basePathname === "/mp-care";

  const openBasic = React.useCallback(() => {
    setMenuOpen(false);
    window.requestAnimationFrame(() => setBasicOpen(true));
  }, []);
  const openPremium = React.useCallback(() => {
    setMenuOpen(false);
    window.requestAnimationFrame(() => setPremiumOpen(true));
  }, []);
  const openMbolster = React.useCallback(() => {
    setMenuOpen(false);
    window.requestAnimationFrame(() => setMbolsterOpen(true));
  }, []);

  const authPill = landingAuthPill(role);

  const bubbleMenuItems = React.useMemo<BubbleMenuItem[]>(
    () => [
      { label: 'Basic', onClick: openBasic, ariaLabel: 'Basic Mpillow', rotation: ROTATIONS[0] },
      { label: 'Premium', onClick: openPremium, ariaLabel: 'Premium Mpillow', rotation: ROTATIONS[1] },
      { label: 'Mbolster', onClick: openMbolster, ariaLabel: 'Mbolster', rotation: ROTATIONS[2] },
      { label: 'Mpillow Care', href: withLocale('/mp-care', locale), rotation: ROTATIONS[3] },
      { label: 'Shop', href: withLocale('/shop', locale), rotation: ROTATIONS[4] },
      { label: 'Blogs', href: withLocale('/blog', locale), rotation: ROTATIONS[5] },
      { label: 'Support', href: withLocale('/support', locale), rotation: ROTATIONS[6] },
      {
        label: authPill.label,
        href: withLocale(authPill.href, locale),
        rotation: ROTATIONS[7],
      },
    ],
    [locale, openBasic, openPremium, openMbolster, authPill.label, authPill.href],
  );

  const signOutAction = `/auth/signout?next=${encodeURIComponent(to("/"))}`;

  return (
    <>
      <div
        className={`app-dock fixed left-1/2 max-w-full -translate-x-1/2 z-50 transition-transform duration-200 ease-out ${isHidden ? "translate-y-24 opacity-0" : "translate-y-0 opacity-100"
          }`}
        style={{ bottom: "calc(var(--mobile-dock-offset) + var(--safe-bottom))" }}
      >
        <Dock className="items-end pb-3">
          {adminDock ? (
            <>
              <Link href={to("/")} className={dockTouchWrapClassName}>
                <DockItem
                  className="aspect-square rounded-full bg-gray-800/30 dark:bg-neutral-800/50 backdrop-blur-sm"
                  isActive={false}
                >
                  <DockLabel>Home</DockLabel>
                  <DockIcon>
                    <Home className="h-full w-full text-gray-200 dark:text-neutral-300" />
                  </DockIcon>
                </DockItem>
              </Link>
              {isMobile && (
                <button
                  type="button"
                  onClick={() => openAdminPanelMenu()}
                  aria-label="Open Admin Panel menu"
                  className={`border-none bg-transparent p-0 ${dockTouchWrapClassName}`}
                >
                  <DockItem className="aspect-square rounded-full bg-gray-800/30 dark:bg-neutral-800/50 backdrop-blur-sm">
                    <DockLabel>Menu</DockLabel>
                    <DockIcon>
                      <Menu className="h-full w-full text-gray-200 dark:text-neutral-300" />
                    </DockIcon>
                  </DockItem>
                </button>
              )}
              <form action={signOutAction} method="post">
                <button type="submit" className={`border-none bg-transparent p-0 ${dockTouchWrapClassName}`} aria-label="Logout">
                  <DockItem className="aspect-square rounded-full bg-gray-800/30 dark:bg-neutral-800/50 backdrop-blur-sm">
                    <DockLabel>Logout</DockLabel>
                    <DockIcon>
                      <LogOut className="h-full w-full text-gray-200 dark:text-neutral-300" />
                    </DockIcon>
                  </DockItem>
                </button>
              </form>
            </>
          ) : (
            <>
              {dockItems.map((item, idx) => {
                const isActive = basePathname === item.href;
                const IconComponent = item.icon;
                return (
                  <Link key={idx} href={to(item.href)} className={dockTouchWrapClassName}>
                    <DockItem
                      className="aspect-square rounded-full bg-gray-800/30 dark:bg-neutral-800/50 backdrop-blur-sm"
                      isActive={isActive}
                    >
                      <DockLabel>{item.title}</DockLabel>
                      <DockIcon>
                        <IconComponent className={`h-full w-full ${isActive ? 'text-white' : 'text-gray-200 dark:text-neutral-300'}`} />
                      </DockIcon>
                    </DockItem>
                  </Link>
                );
              })}

              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Menu"
                aria-expanded={menuOpen}
                className={`border-none bg-transparent p-0 ${dockTouchWrapClassName}`}
              >
                <DockItem
                  className="aspect-square rounded-full bg-gray-800/30 dark:bg-neutral-800/50 backdrop-blur-sm"
                  isActive={isMenuActive || menuOpen}
                >
                  <DockLabel>Menu</DockLabel>
                  <DockIcon>
                    <Menu className={`h-full w-full ${isMenuActive || menuOpen ? "text-white" : "text-gray-200 dark:text-neutral-300"}`} />
                  </DockIcon>
                </DockItem>
              </button>
            </>
          )}
        </Dock>

        {!adminDock && (
          <>
            <BasicMpillowLearnMoreSheet open={basicOpen} onOpenChange={setBasicOpen} />
            <PremiumLearnMoreSheet open={premiumOpen} onOpenChange={setPremiumOpen} />
            <MbolsterLearnMoreSheet open={mbolsterOpen} onOpenChange={setMbolsterOpen} />
            <CervicalNeckSupportSheet />
          </>
        )}
      </div>

      {!adminDock && (
        <BubbleMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          hideChrome
          useFixedPosition
          items={bubbleMenuItems}
          menuBg="var(--card)"
          menuContentColor="var(--foreground)"
        />
      )}
    </>
  );
}
