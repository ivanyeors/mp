"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";

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
    <header className="sticky top-0 z-30 border-b bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/40">
      {isCompact ? (
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-2">
          <Link href="/" className="shrink-0">
            <Image
              src="/mpillow_logo_2026.png"
              alt="Mpillow"
              width={60}
              height={60}
              className="h-[60px] w-[60px] object-contain"
              priority
            />
          </Link>

          <Button asChild size="sm">
            <Link href="/mp-config">Customise</Link>
          </Button>
        </div>
      ) : (
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
      )}
    </header>
  );
}

