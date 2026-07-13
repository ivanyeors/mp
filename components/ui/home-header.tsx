"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { ProfileMenu } from "@/components/auth/profile-menu";
import { Globe, MapPin, MessageCircleMore } from "lucide-react";
import { openBookAppointmentSheet } from "@/lib/book-appointment";
import { stripLocale } from "@/lib/i18n/routing";
import { isMarketingRoute } from "@/lib/routing/is-marketing-route";

export function HomeHeader() {
  const pathname = usePathname() ?? "/";
  const basePathname = stripLocale(pathname);
  const [isCompact, setIsCompact] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => {
      setIsCompact(window.scrollY > 0);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!isMarketingRoute(basePathname)) return null;

  return (
    <>
      {/* Keep compact header explicitly top-anchored so mobile scroll can't drift it. */}
      <div
        className={`fixed left-1/2 top-[var(--mobile-top-clearance)] z-40 w-fit max-w-[calc(100vw-0.5rem)] -translate-x-1/2 px-2 py-2 transition-all duration-200 ease-out sm:max-w-full sm:px-4 ${isCompact ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"
          }`}
      >
        <div
          className="relative flex max-w-full items-center justify-between gap-2 rounded-[35px] px-2 py-1.5 sm:gap-3 sm:px-3"
        >
          {/* Dock-like background (matches `components/ui/shadcn-io/dock/index.tsx`) */}
          <div
            className="absolute inset-0 -z-10 rounded-[35px] dark:hidden"
            style={{
              backgroundImage:
                "linear-gradient(rgb(226, 232, 240) 0%, rgb(203, 213, 225) 100%), linear-gradient(90deg, rgb(241, 245, 249) 0%, rgb(241, 245, 249) 100%)",
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none -z-10 rounded-[35px] dark:hidden"
            style={{
              boxShadow:
                "inset 1px 1px 1.8px 0px rgba(255, 255, 255, 0.8), inset -4px 13px 28.4px 0px rgba(148, 163, 184, 0.3)",
            }}
          />
          <div
            className="absolute inset-0 -z-10 hidden rounded-[35px] dark:block"
            style={{
              backgroundImage:
                "linear-gradient(rgb(0, 23, 54) 0%, rgb(43, 105, 188) 100%), linear-gradient(90deg, rgb(7, 55, 120) 0%, rgb(7, 55, 120) 100%)",
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none -z-10 hidden rounded-[35px] dark:block"
            style={{
              boxShadow:
                "inset 1px 1px 1.8px 0px rgba(194, 220, 255, 0.5), inset -4px 13px 28.4px 0px rgba(102, 167, 255, 0.5)",
            }}
          />

          <Link href="/" className="shrink-0">
            <Image
              src="/mpillow_logo_2026-inv.png"
              alt="Mpillow"
              width={42}
              height={42}
              className="h-[42px] w-[42px] object-contain"
              priority
            />
          </Link>

          <div className="min-w-0 flex items-center gap-1.5 sm:gap-2">
            <span className="hidden text-xs font-medium text-foreground/80 md:inline-block">Customise</span>
            <Button asChild size="sm" className="h-8 rounded-full px-2.5 sm:px-3">
              <Link href="/mp-config" aria-label="Online">
                <Globe className="h-4 w-4 sm:hidden" aria-hidden="true" />
                <span className="hidden sm:inline">Online</span>
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="h-8 rounded-full px-2.5 sm:px-3">
              <button type="button" onClick={openBookAppointmentSheet}>
                <MapPin className="h-4 w-4 sm:hidden" aria-hidden="true" />
                <span className="hidden sm:inline">In-Person</span>
              </button>
            </Button>
            <a
              href="http://wa.me/6587805311"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full p-1 text-foreground/90 hover:text-foreground"
              aria-label="WhatsApp"
            >
              <MessageCircleMore className="h-full w-full" />
            </a>
          </div>
        </div>
      </div>

      <header
        className={`sticky top-0 z-30 ${isCompact ? "" : "border-b bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/40"
          }`}
      >
        {!isCompact ? (
          <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 px-2 py-3 sm:gap-2 sm:px-4">
            <div className="flex min-w-0 justify-start">
              <ProfileMenu />
            </div>
            <div className="flex justify-center">
              <Image
                src="/mpillow_logo_2026.png"
                alt="Mpillow"
                width={120}
                height={120}
                className="h-16 w-16 object-contain sm:h-[120px] sm:w-[120px]"
                priority
              />
            </div>
            <div className="flex min-w-0 justify-end gap-1 sm:gap-2">
              <LanguageToggle />
              <ModeToggle />
            </div>
          </div>
        ) : null}
      </header>
    </>
  );
}

