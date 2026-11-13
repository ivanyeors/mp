"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getLocaleOrDefault, withLocale } from "@/lib/i18n/routing";

export default function ProductNotFound() {
  // Not-found gets no params; the locale is in the path. A bare "/shop" is a redirect.
  const shopHref = withLocale("/shop", getLocaleOrDefault(usePathname() ?? "/"));
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="text-xl font-semibold">Product Not Found</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        This product does not exist or is no longer available.
      </p>
      <Link
        href={shopHref}
        className="mt-2 rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Browse Products
      </Link>
    </div>
  );
}
