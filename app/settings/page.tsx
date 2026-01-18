"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1>General</h1>
        <p className="text-muted-foreground mt-2">Basic preferences for your account.</p>
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
              checked={theme === "light"}
              onChange={() => setTheme("light")}
              className="peer sr-only"
            />
            <div className="rounded-lg border p-4 transition hover:shadow-sm peer-checked:border-primary peer-checked:ring-2 peer-checked:ring-primary">
              <div className="flex items-center gap-3">
                <Sun className="h-5 w-5" />
                <div className="font-medium">Light</div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Bright, clean interface.</p>
            </div>
          </label>

          <label htmlFor="theme-dark" className="cursor-pointer">
            <input
              id="theme-dark"
              name="theme"
              type="radio"
              value="dark"
              checked={theme === "dark"}
              onChange={() => setTheme("dark")}
              className="peer sr-only"
            />
            <div className="rounded-lg border p-4 transition hover:shadow-sm peer-checked:border-primary peer-checked:ring-2 peer-checked:ring-primary">
              <div className="flex items-center gap-3">
                <Moon className="h-5 w-5" />
                <div className="font-medium">Dark</div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Dimmed theme for low light.</p>
            </div>
          </label>

          <label htmlFor="theme-system" className="cursor-pointer">
            <input
              id="theme-system"
              name="theme"
              type="radio"
              value="system"
              checked={theme === "system"}
              onChange={() => setTheme("system")}
              className="peer sr-only"
            />
            <div className="rounded-lg border p-4 transition hover:shadow-sm peer-checked:border-primary peer-checked:ring-2 peer-checked:ring-primary">
              <div className="flex items-center gap-3">
                <Monitor className="h-5 w-5" />
                <div className="font-medium">System</div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Match your OS preference.</p>
            </div>
          </label>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium">Session</h2>
        <p className="text-muted-foreground text-sm">
          Logged in via Telegram OTP. Sessions stay active for 3 days per device.
        </p>
        <Button
          variant="outline"
          onClick={async () => {
            try {
              setLoggingOut(true);
              await fetch("/api/auth/settings-otp/logout", { method: "POST" });
              window.location.reload();
            } finally {
              setLoggingOut(false);
            }
          }}
          disabled={loggingOut}
          className="w-full sm:w-auto"
        >
          {loggingOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
          Logout
        </Button>
      </div>
    </div>
  );
}
