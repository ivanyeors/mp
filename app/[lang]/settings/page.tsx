"use client";

import { Suspense, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { usePathname, useRouter } from "next/navigation";
import { Sun, Moon, Monitor, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { AccessDeniedNotice } from "@/components/settings/access-denied-notice";
import { InfoTip } from "@/components/ui/info-tip";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const [mounted, setMounted] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // The theme is only known in the browser, so the three radios stay unchecked
  // for the first paint and flip once mounted — the rest of the page renders
  // straight from the server.
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="space-y-4 md:space-y-6">
      <Suspense fallback={null}>
        <AccessDeniedNotice />
      </Suspense>
      <div>
        <div className="flex items-center gap-1.5">
          <h1>General</h1>
          <InfoTip label="About General">
            <p>Choose a theme or sign out.</p>
          </InfoTip>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium">Theme</h2>
        <div className="grid gap-4 sm:grid-cols-3" role="radiogroup" aria-label="Theme">
          <label htmlFor="theme-light" className="cursor-pointer">
            <input
              id="theme-light"
              name="theme"
              type="radio"
              value="light"
              checked={mounted && theme === "light"}
              suppressHydrationWarning
              onChange={() => setTheme("light")}
              className="peer sr-only"
            />
            <div className="rounded-lg border p-3 sm:p-4 transition hover:shadow-sm peer-checked:border-primary peer-checked:ring-2 peer-checked:ring-primary">
              <div className="flex items-center gap-3">
                <Sun className="h-5 w-5" />
                <div className="font-medium">Light</div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Suits bright rooms.</p>
            </div>
          </label>

          <label htmlFor="theme-dark" className="cursor-pointer">
            <input
              id="theme-dark"
              name="theme"
              type="radio"
              value="dark"
              checked={mounted && theme === "dark"}
              suppressHydrationWarning
              onChange={() => setTheme("dark")}
              className="peer sr-only"
            />
            <div className="rounded-lg border p-3 sm:p-4 transition hover:shadow-sm peer-checked:border-primary peer-checked:ring-2 peer-checked:ring-primary">
              <div className="flex items-center gap-3">
                <Moon className="h-5 w-5" />
                <div className="font-medium">Dark</div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Suits dim rooms.</p>
            </div>
          </label>

          <label htmlFor="theme-system" className="cursor-pointer">
            <input
              id="theme-system"
              name="theme"
              type="radio"
              value="system"
              checked={mounted && theme === "system"}
              suppressHydrationWarning
              onChange={() => setTheme("system")}
              className="peer sr-only"
            />
            <div className="rounded-lg border p-3 sm:p-4 transition hover:shadow-sm peer-checked:border-primary peer-checked:ring-2 peer-checked:ring-primary">
              <div className="flex items-center gap-3">
                <Monitor className="h-5 w-5" />
                <div className="font-medium">System</div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Matches your device.</p>
            </div>
          </label>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-medium">Session</h2>
          <InfoTip label="About Session">
            <p>You&apos;re signed in with your staff account. Signing out ends your session on every device.</p>
          </InfoTip>
        </div>
        <Button
          variant="outline"
          onClick={async () => {
            try {
              setLoggingOut(true);
              const supabase = createSupabaseBrowserClient();
              await supabase.auth.signOut();
              router.replace(
                withLocale(
                  `/account/login?next=${encodeURIComponent(withLocale("/settings", locale))}`,
                  locale,
                ),
              );
            } finally {
              setLoggingOut(false);
            }
          }}
          disabled={loggingOut}
          className="w-full sm:w-auto"
        >
          {loggingOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
          Sign out
        </Button>
      </div>
    </div>
  );
}
