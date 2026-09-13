"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Globe } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, type Locale } from "@/lib/i18n/locales";
import { getLocaleFromPathname, stripLocale } from "@/lib/i18n/routing";

const LOCALE_LABELS: Record<Locale, string> = {
  "en-US": "English (US)",
  "zh-CN": "中文(简体)",
};

const LOCALE_SHORT_LABELS: Record<Locale, string> = {
  "en-US": "EN",
  "zh-CN": "中文",
};

function setLocaleCookie(locale: Locale) {
  // Best-effort persistence; middleware also keeps cookie in sync.
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(locale)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function LanguageToggle() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();

  const currentLocale = (getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE) as Locale;

  const navigateToLocale = React.useCallback(
    (nextLocale: Locale) => {
      setLocaleCookie(nextLocale);

      const basePath = stripLocale(pathname);
      const nextPath = basePath === "/" ? `/${nextLocale}` : `/${nextLocale}${basePath}`;
      const qs = searchParams.toString();
      router.push(qs ? `${nextPath}?${qs}` : nextPath);
    },
    [pathname, router, searchParams],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/*
          Icon-only below `sm`: the header's right cluster (cart, this, theme)
          has ~136-151px on a 360-390px phone, and with the label it is 165px,
          which pushes the cart under the logo. As a 44px round button it is
          140px, like the theme toggle beside it.
        */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-full px-3 max-sm:min-w-11"
          aria-label="Language"
        >
          <Globe className="h-4 w-4 sm:mr-2" aria-hidden="true" />
          <span className="hidden text-sm font-medium sm:inline">{LOCALE_SHORT_LABELS[currentLocale]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(["en-US", "zh-CN"] as const).map((locale) => (
          <DropdownMenuItem
            key={locale}
            onClick={() => navigateToLocale(locale)}
          >
            {LOCALE_LABELS[locale]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

