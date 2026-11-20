"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getLocaleOrDefault, withLocale } from "@/lib/i18n/routing";

export default function NotFound() {
  const homeHref = withLocale("/", getLocaleOrDefault(usePathname() ?? "/"));
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
      <h2 className="text-xl font-semibold">Page Not Found</h2>
      <p className="max-w-md text-muted-foreground">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link
        href={homeHref}
        className="mt-4 rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Go Home
      </Link>
    </div>
  );
}
