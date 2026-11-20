"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { stripLocale } from "@/lib/i18n/routing";

type RouteScopeProps = {
  children: React.ReactNode;
};

export function RouteScope({ children }: RouteScopeProps) {
  const pathname = usePathname() ?? "";
  const basePathname = stripLocale(pathname);
  const isSettingsRoute = basePathname === "/settings" || basePathname.startsWith("/settings/");

  React.useEffect(() => {
    const rootEl = document.documentElement;

    if (isSettingsRoute) {
      rootEl.removeAttribute("data-typography-scope");
      return;
    }

    rootEl.setAttribute("data-typography-scope", "marketing");

    return () => {
      rootEl.removeAttribute("data-typography-scope");
    };
  }, [isSettingsRoute]);

  if (isSettingsRoute) return <>{children}</>;

  return (
    <div data-typography-scope="marketing" style={{ display: "contents" }}>
      {children}
    </div>
  );
}

