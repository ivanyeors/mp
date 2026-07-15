"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { isAdminJourneyPath } from "@/lib/analytics/journey/paths";

const STORAGE_KEY = "mp_analytics_notice_ok";

/** Disclosure-only bottom bar (Got it dismiss). Collection stays always-on via JourneyTracker. */
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

  if (!visible) return null;

  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const privacyHref = withLocale("/privacy-policy", locale);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // still hide this Visit
    }
    setVisible(false);
  };

  return (
    // pointer-events only on the bar — rest of viewport stays clickable (configurator/checkout)
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-3 pb-[calc(0.75rem+var(--safe-bottom))]">
      <div
        role="status"
        className="pointer-events-auto flex w-full max-w-3xl items-center gap-3 rounded-lg border bg-background/95 px-4 py-3 text-sm shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80"
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
