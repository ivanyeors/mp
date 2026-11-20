"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { isAdminJourneyPath } from "@/lib/analytics/journey/paths";
import { useScreenBottomPin } from "@/hooks/use-screen-bottom-pin";

const STORAGE_KEY = "mp_analytics_notice_ok";

export function AnalyticsNoticeBar() {
  const pathname = usePathname() ?? "/";
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isAdminJourneyPath(pathname)) {
      setVisible(false);
      return;
    }
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") {
        setVisible(false);
        return;
      }
    } catch {
      // ponytail: private mode / blocked storage — show once per mount
    }
    setVisible(true);
  }, [pathname]);

  const barRef = useRef<HTMLDivElement>(null);
  const pinRef = useScreenBottomPin();
  useEffect(() => {
    const bar = barRef.current;
    if (!visible || !bar || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const publish = () =>
      root.style.setProperty("--analytics-notice-clearance", `calc(${Math.round(bar.getBoundingClientRect().height)}px + 0.75rem)`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--analytics-notice-clearance");
    };
  }, [visible]);

  if (!visible) return null;

  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const privacyHref = withLocale("/privacy-policy", locale);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
    setVisible(false);
  };

  return (
    <div
      ref={pinRef}
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--screen-pin-offset,0px)*-1)] z-40 flex justify-center p-3 pb-[calc(0.75rem+max(var(--safe-bottom),var(--app-dock-clearance),var(--mobile-bottom-bar-height,0px)))] md:justify-end md:pb-[calc(0.75rem+var(--safe-bottom))]"
    >
      <div
        ref={barRef}
        role="status"
        className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-lg border bg-background/95 px-4 py-3 text-sm shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80"
      >
        <p className="min-w-0 flex-1 text-muted-foreground">
          By using this site, we collect visit data to improve your experience.{" "}
          <Link href={privacyHref} className="underline underline-offset-4 hover:text-foreground">
            Privacy Policy
          </Link>
        </p>
        <Button type="button" size="sm" variant="secondary" onClick={dismiss}>
          Got it
        </Button>
      </div>
    </div>
  );
}
