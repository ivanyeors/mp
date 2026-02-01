"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

type RouteScopeProps = {
  children: React.ReactNode;
};

/**
 * Applies scoped styling hooks to public/marketing routes only.
 * We intentionally exclude `/settings/*` so admin UI typography isn't affected.
 */
export function RouteScope({ children }: RouteScopeProps) {
  const pathname = usePathname() ?? "";
  const isSettingsRoute = pathname === "/settings" || pathname.startsWith("/settings/");

  React.useEffect(() => {
    // Ensure portaled UI (Radix Sheet/Dialog) is covered by the scope too.
    const rootEl = document.documentElement;

    if (isSettingsRoute) {
      rootEl.removeAttribute("data-typography-scope");
      return;
    }

    rootEl.setAttribute("data-typography-scope", "marketing");

    return () => {
      // Cleanup prevents stale scope on fast route transitions.
      rootEl.removeAttribute("data-typography-scope");
    };
  }, [isSettingsRoute]);

  // Keep a wrapper for non-portaled content (and SSR), while <html> scoping covers portals.
  if (isSettingsRoute) return <>{children}</>;

  return (
    <div data-typography-scope="marketing" style={{ display: "contents" }}>
      {children}
    </div>
  );
}

