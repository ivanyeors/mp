'use client';

import * as React from "react";
import { Dock, DockIcon, DockItem, DockLabel } from "@/components/ui/shadcn-io/dock";
import {
  Cylinder,
  Heart,
  Home,
  Info,
  LifeBuoy,
  Menu,
  Newspaper,
  Ruler,
  Settings,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { BasicMpillowLearnMoreSheet } from "@/components/slide-in-pages/basic-mpillow-learn-more-slide-in";
import { PremiumLearnMoreSheet } from "@/components/slide-in-pages/premium-learn-more-dialog";
import { MbolsterLearnMoreSheet } from "@/components/slide-in-pages/mbolster-learn-more-slide-in";
import { CervicalNeckSupportSheet } from "@/components/slide-in-pages/cervical-neck-support";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, stripLocale, withLocale } from "@/lib/i18n/routing";

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

export function AppDock() {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const basePathname = stripLocale(pathname);
  const to = (href: string) => withLocale(href, locale);

  const [isHidden, setIsHidden] = React.useState(false);
  const isMobile = useIsMobile();

  const [menuOpen, setMenuOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const [basicOpen, setBasicOpen] = React.useState(false);
  const [premiumOpen, setPremiumOpen] = React.useState(false);
  const [mbolsterOpen, setMbolsterOpen] = React.useState(false);

  React.useEffect(() => {
    let lastY = window.scrollY;

    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY;

      // near top: always show
      if (y < 24) {
        setIsHidden(false);
        lastY = y;
        return;
      }

      // scroll down: hide; scroll up: show
      if (delta > 6) setIsHidden(true);
      if (delta < -6) setIsHidden(false);

      lastY = y;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isMenuActive =
    basePathname === "/settings" ||
    basePathname === "/shop" ||
    basePathname === "/articles" ||
    basePathname === "/support" ||
    basePathname === "/mp-care";

  const openBasic = () => {
    if (isMobile) {
      setDrawerOpen(false);
      window.requestAnimationFrame(() => setBasicOpen(true));
      return;
    }
    setMenuOpen(false);
    setBasicOpen(true);
  };
  const openPremium = () => {
    if (isMobile) {
      setDrawerOpen(false);
      window.requestAnimationFrame(() => setPremiumOpen(true));
      return;
    }
    setMenuOpen(false);
    setPremiumOpen(true);
  };
  const openMbolster = () => {
    if (isMobile) {
      setDrawerOpen(false);
      window.requestAnimationFrame(() => setMbolsterOpen(true));
      return;
    }
    setMenuOpen(false);
    setMbolsterOpen(true);
  };

  return (
    <div
      className={`app-dock fixed left-1/2 max-w-full -translate-x-1/2 z-50 transition-transform duration-200 ease-out ${
        isHidden ? "translate-y-24 opacity-0" : "translate-y-0 opacity-100"
      }`}
      style={{ bottom: "calc(var(--mobile-dock-offset) + var(--safe-bottom))" }}
    >
      <Dock className="items-end pb-3">
        {dockItems.map((item, idx) => {
          const isActive = basePathname === item.href;
          const IconComponent = item.icon;
          return (
            <Link key={idx} href={to(item.href)}>
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

        {/* Menu (replaces Settings dock icon) */}
        {isMobile ? (
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <DockItem
                className="aspect-square rounded-full bg-gray-800/30 dark:bg-neutral-800/50 backdrop-blur-sm"
                isActive={isMenuActive}
                aria-label="Menu"
              >
                <DockLabel>Menu</DockLabel>
                <DockIcon>
                  <Menu className={`h-full w-full ${isMenuActive ? "text-white" : "text-gray-200 dark:text-neutral-300"}`} />
                </DockIcon>
              </DockItem>
            </SheetTrigger>

            <SheetContent
              side="bottom"
              mobilePreset="quick"
              className="pb-[calc(2rem+var(--safe-bottom))]"
            >
              <div className="px-4 pt-2">
                <div className="text-base font-semibold">Menu</div>
                <div className="mt-1 text-sm text-muted-foreground">Quick access</div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 px-4">
                <button
                  type="button"
                  onClick={openBasic}
                  className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border bg-card/40 p-4 text-center shadow-sm backdrop-blur-sm"
                >
                  <Info className="h-8 w-8" />
                  <div className="text-sm font-medium">Basic</div>
                </button>
                <button
                  type="button"
                  onClick={openPremium}
                  className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border bg-card/40 p-4 text-center shadow-sm backdrop-blur-sm"
                >
                  <Sparkles className="h-8 w-8" />
                  <div className="text-sm font-medium">Premium</div>
                </button>
                <button
                  type="button"
                  onClick={openMbolster}
                  className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border bg-card/40 p-4 text-center shadow-sm backdrop-blur-sm"
                >
                  <Ruler className="h-8 w-8" />
                  <div className="text-sm font-medium">Mbolster</div>
                </button>
                <Link
                  href={to("/mp-care")}
                  onClick={() => setDrawerOpen(false)}
                  className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border bg-card/40 p-4 text-center shadow-sm backdrop-blur-sm"
                >
                  <Heart className="h-8 w-8" />
                  <div className="text-sm font-medium">Mpillow Care</div>
                </Link>
                <Link
                  href={to("/shop")}
                  onClick={() => setDrawerOpen(false)}
                  className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border bg-card/40 p-4 text-center shadow-sm backdrop-blur-sm"
                >
                  <ShoppingBag className="h-8 w-8" />
                  <div className="text-sm font-medium">Shop</div>
                </Link>
                <Link
                  href={to("/articles")}
                  onClick={() => setDrawerOpen(false)}
                  className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border bg-card/40 p-4 text-center shadow-sm backdrop-blur-sm"
                >
                  <Newspaper className="h-8 w-8" />
                  <div className="text-sm font-medium">Articles</div>
                </Link>
                <Link
                  href={to("/support")}
                  onClick={() => setDrawerOpen(false)}
                  className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border bg-card/40 p-4 text-center shadow-sm backdrop-blur-sm"
                >
                  <LifeBuoy className="h-8 w-8" />
                  <div className="text-sm font-medium">Support</div>
                </Link>
                <Link
                  href={to("/settings")}
                  onClick={() => setDrawerOpen(false)}
                  className="col-span-2 flex min-h-20 items-center justify-center gap-3 rounded-2xl border bg-card/40 p-4 text-center shadow-sm backdrop-blur-sm"
                >
                  <Settings className="h-7 w-7" />
                  <div className="text-sm font-medium">Settings</div>
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        ) : (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <DockItem
                className="aspect-square rounded-full bg-gray-800/30 dark:bg-neutral-800/50 backdrop-blur-sm"
                isActive={isMenuActive}
                aria-label="Menu"
              >
                <DockLabel>Menu</DockLabel>
                <DockIcon>
                  <Menu className={`h-full w-full ${isMenuActive ? "text-white" : "text-gray-200 dark:text-neutral-300"}`} />
                </DockIcon>
              </DockItem>
            </DropdownMenuTrigger>

            <DropdownMenuContent side="top" align="center" sideOffset={12} className="w-64">
              <DropdownMenuLabel>Learn more</DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  openBasic();
                }}
              >
                <Info />
                Basic Mpillow
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  openPremium();
                }}
              >
                <Sparkles />
                Premium Mpillow
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  openMbolster();
                }}
              >
                <Ruler />
                Mbolster
              </DropdownMenuItem>

              <DropdownMenuItem asChild>
                <Link href={to("/mp-care")}>
                  <Heart />
                  Mpillow Care
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel>Navigate</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link href={to("/shop")}>
                  <ShoppingBag />
                  Shop
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={to("/articles")}>
                  <Newspaper />
                  Articles
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={to("/support")}>
                  <LifeBuoy />
                  Support
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={to("/settings")}>
                  <Settings />
                  Settings
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </Dock>

      {/* Controlled learn-more sheets (opened via Menu) */}
      <BasicMpillowLearnMoreSheet open={basicOpen} onOpenChange={setBasicOpen} />
      <PremiumLearnMoreSheet open={premiumOpen} onOpenChange={setPremiumOpen} />
      <MbolsterLearnMoreSheet open={mbolsterOpen} onOpenChange={setMbolsterOpen} />

      {/* Global sheets (opened via window events) */}
      <CervicalNeckSupportSheet />
    </div>
  );
}
