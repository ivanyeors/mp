"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { MessageCircleMore } from "lucide-react";
import { openBookAppointmentSheet } from "@/components/book-appointment-sheet";

export function HomeHeader() {
  const [isCompact, setIsCompact] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => {
      setIsCompact(window.scrollY > 0);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-30 ${
        isCompact ? "" : "border-b bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/40"
      }`}
    >
      <div
        className={`fixed left-1/2 z-30 max-w-full -translate-x-1/2 px-4 py-2 transition-all duration-200 ease-out ${
          isCompact ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"
        }`}
      >
          <div
            className="relative flex items-center justify-between gap-3 rounded-[35px] px-3 py-1.5"
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

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-foreground/80">Customise</span>
              <Button asChild size="sm" className="h-8 rounded-full px-3">
                <Link href="/mp-config">Online</Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="h-8 rounded-full px-3">
                <button type="button" onClick={openBookAppointmentSheet}>
                  In-Person
                </button>
              </Button>
              <a
                href="http://wa.me/6587805311"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full p-1 text-foreground/90 hover:text-foreground"
                aria-label="WhatsApp"
              >
                <MessageCircleMore className="h-full w-full" />
              </a>
            </div>
          </div>
      </div>

      {!isCompact ? (
        <div className="mx-auto grid w-full max-w-6xl grid-cols-3 items-center px-4 py-3">
          <div />
          <div className="flex justify-center">
            <Image
              src="/mpillow_logo_2026.png"
              alt="Mpillow"
              width={120}
              height={120}
              className="h-[120px] w-[120px] object-contain"
              priority
            />
          </div>
          <div className="flex justify-end">
            <ModeToggle />
          </div>
        </div>
      ) : null}
    </header>
  );
}

